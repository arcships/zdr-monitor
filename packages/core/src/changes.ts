/** 经 agent 审阅确认的政策变化。
 *
 * 快照的 git diff 只是待审线索，不能直接展示成「政策变了」。只有 changes/ 下的
 * TOML 才是产品数据；一份文件代表一次已确认变化。新旧正文不在这里存版本号：
 * `issue` 指向的复核 issue 或 PR 链到那次快照改动，git 历史就是版本。 */
import fs from "node:fs"
import path from "node:path"
import * as toml from "./toml"

export const CHANGE_DIRECTIONS = ["weakened", "strengthened", "clarified"] as const
export type ChangeDirection = (typeof CHANGE_DIRECTIONS)[number]

export interface PolicyChange {
  id: string
  provider: string
  dimensions: string[]
  direction: ChangeDirection
  observed_at: string
  effective_at?: string
  source_id: string
  summary_zh: string
  summary_en: string
  issue: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DIMENSIONS = new Set(["training", "zdr", "retention", "processing_region", "role"])

export function loadChanges(root: string): PolicyChange[] {
  const dir = path.join(root, "changes")
  if (!fs.existsSync(dir)) return []

  const changes: PolicyChange[] = []
  for (const provider of fs.readdirSync(dir).sort()) {
    const providerDir = path.join(dir, provider)
    if (!fs.statSync(providerDir).isDirectory()) continue
    for (const name of fs.readdirSync(providerDir).filter((x) => x.endsWith(".toml")).sort()) {
      const file = path.join(providerDir, name)
      const raw = toml.parse(fs.readFileSync(file, "utf8")) as unknown as Omit<PolicyChange, "id">
      const id = `${provider}/${name.replace(/\.toml$/, "")}`
      const fail = (message: string): never => { throw new Error(`changes/${id}: ${message}`) }

      if (raw.provider !== provider) fail(`provider 必须是 ${provider}`)
      if (!Array.isArray(raw.dimensions) || !raw.dimensions.length || raw.dimensions.some((d) => !DIMENSIONS.has(d)))
        fail("dimensions 含未知维度或为空")
      if (!CHANGE_DIRECTIONS.includes(raw.direction)) fail(`direction 无效: ${raw.direction}`)
      if (!DATE.test(raw.observed_at) || !name.startsWith(`${raw.observed_at}-`))
        fail("observed_at 必须是 YYYY-MM-DD，并与文件名前缀一致")
      if (raw.effective_at && !DATE.test(raw.effective_at)) fail("effective_at 必须是 YYYY-MM-DD")
      if (!raw.source_id) fail("缺 source_id")
      if (!raw.summary_zh?.trim() || !raw.summary_en?.trim()) fail("中英文摘要不能为空")
      try { new URL(raw.issue) } catch { fail("issue 必须是 issue 或 PR 的 URL") }

      changes.push({ id, ...raw })
    }
  }
  return changes.sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id))
}
