/** 快照层：按每个来源声明的方式抓取，规范化后覆盖写 snapshots/<source_id>.md。
 *
 *  一个 URL 一个文件，版本历史交给 git：快照的 git diff 就是政策差异，
 *  PR 就是待复核队列。
 *
 *  抓取失败不写任何文件——失败是关于我们的事实，只进运行报告。 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { loadAll, type Source } from "../registry"
import { closeBrowser, fetchWith, type Method } from "./fetch"
import { toText, unusable } from "./extract"
import { fold, locate } from "./quote"

export { METHODS, type Method } from "./fetch"

export const snapshotPath = (root: string, id: string) => path.join(root, "snapshots", `${id}.md`)

const header = (url: string) => `<!-- ${url} -->\n`

/** 承载条款的是长句；导航项、按钮、菜单、「Updated 5 minutes ago」都是短行。
 *  只有短行变了不算正文变化——不重写快照，也就不会为页面装修叫一次 agent。
 *  按顺序比较而不是按集合：同一句话从个人版一节挪到企业版一节是实质变化。 */
const MATERIAL_MIN = 25
const material = (text: string) => text.split("\n").filter((line) => fold(line).length >= MATERIAL_MIN)
export const sameMaterial = (a: string, b: string) => {
  const x = material(a)
  const y = material(b)
  return x.length === y.length && x.every((line, i) => line === y[i])
}

export function readSnapshot(root: string, id: string): string | null {
  const file = snapshotPath(root, id)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, "utf8").replace(/^<!--.*?-->\n/, "")
}

/** 每份快照最后一次提交的日期（YYYY-MM-DD）。一次 git log 扫完整个目录，
 *  取每个文件第一次出现（最新）的那次提交。还没提交的快照（本地刚抓、或浅克隆
 *  里看不到历史）退回文件修改时间；不在 git 仓库里也照样能用。 */
export function snapshotDates(root: string): Map<string, string> {
  const dates = new Map<string, string>()
  const log = spawnSync("git", ["log", "--format=%x00%cs", "--name-only", "--", "snapshots/"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  })
  if (log.status === 0)
    for (const entry of log.stdout.split("\0").slice(1)) {
      const [date, ...files] = entry.trim().split("\n")
      for (const file of files) {
        const id = file.match(/^snapshots\/([0-9a-f]{16})\.md$/)?.[1]
        if (id && !dates.has(id)) dates.set(id, date!)
      }
    }
  const dir = path.join(root, "snapshots")
  if (fs.existsSync(dir))
    for (const name of fs.readdirSync(dir)) {
      const id = name.match(/^([0-9a-f]{16})\.md$/)?.[1]
      if (id && !dates.has(id)) dates.set(id, fs.statSync(path.join(dir, name)).mtime.toISOString().slice(0, 10))
    }
  return dates
}

export interface Capture {
  source_id: string
  url: string
  method: Method
  status: number
  /** created = 第一次有快照；changed = 正文变了；same = 没变；failed = 没抓到可用正文 */
  outcome: "created" | "changed" | "same" | "failed"
  error?: string
  chars?: number
}

export async function capture(root: string, source: Pick<Source, "id" | "url" | "fetch">, dryRun = false): Promise<Capture> {
  const method = source.fetch ?? "direct"
  const base = { source_id: source.id, url: source.url, method }
  const raw = await fetchWith(method, source.url)
  if (!raw.ok) return { ...base, status: raw.status, outcome: "failed", error: raw.error ?? `http_${raw.status}` }
  let text: string
  try {
    text = await toText(raw.kind, raw.body)
  } catch (e: any) {
    return { ...base, status: raw.status, outcome: "failed", error: "extract: " + String(e?.message || e) }
  }
  const reason = unusable(text)
  if (reason) return { ...base, status: raw.status, outcome: "failed", error: reason }

  const previous = readSnapshot(root, source.id)
  const outcome = previous === null ? "created" : sameMaterial(previous, text) ? "same" : "changed"
  if (outcome !== "same" && !dryRun) {
    fs.mkdirSync(path.join(root, "snapshots"), { recursive: true })
    fs.writeFileSync(snapshotPath(root, source.id), header(source.url) + text + "\n")
  }
  return { ...base, status: raw.status, outcome, chars: text.length }
}

/** 全部 provider 引用的来源，按 URL 去重。同一 URL 在不同 provider 里声明了不同的
 *  抓取方式时取第一个——快照只有一份，抓法也只能有一种。 */
export function allSources(root: string): Source[] {
  const found = new Map<string, Source>()
  for (const { sources } of loadAll(root)) for (const s of sources) if (!found.has(s.id)) found.set(s.id, s)
  return [...found.values()].sort((a, b) => a.url.localeCompare(b.url))
}

const CONCURRENCY: Record<Method, number> = { direct: 8, browser: 4, jina: 1 }
/** jina 免费额度每分钟 20 次。有 key 时额度高得多，但仍然不必抢。 */
const GAP: Record<Method, number> = { direct: 0, browser: 0, jina: 3200 }

export async function snapshotAll(root: string, sources: Source[], options: { dryRun?: boolean; log?: (s: string) => void } = {}) {
  const results: Capture[] = []
  for (const method of ["direct", "browser", "jina"] as Method[]) {
    const queue = sources.filter((s) => (s.fetch ?? "direct") === method)
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY[method], queue.length) }, async () => {
        while (next < queue.length) {
          const source = queue[next++]!
          const result = await capture(root, source, options.dryRun)
          results.push(result)
          options.log?.(`${result.outcome.padEnd(7)} ${method.padEnd(7)} ${source.url}${result.error ? "  " + result.error : ""}`)
          if (GAP[method]) await new Promise((r) => setTimeout(r, GAP[method]))
        }
      }),
    )
    if (method === "browser") await closeBrowser()
  }
  return results.sort((a, b) => a.url.localeCompare(b.url))
}

export interface QuoteCheck {
  provider_id: string
  anchor_id: string
  source_id: string
  url: string
  /** ok = 唯一定位（本身只出现一次，或靠 prefix/suffix 定位到一处）；
   *  ambiguous = 多处且上下文区分不开（需要确认对应哪一档）；missing = 快照里没有；
   *  no_snapshot = 这个来源还没有快照，无从核对 */
  state: "ok" | "ambiguous" | "missing" | "no_snapshot"
  exact: string
}

export function checkQuotes(root: string, only?: string[]): QuoteCheck[] {
  const cache = new Map<string, string | null>()
  const folded = (id: string) => {
    if (!cache.has(id)) {
      const text = readSnapshot(root, id)
      cache.set(id, text === null ? null : fold(text))
    }
    return cache.get(id)!
  }
  const out: QuoteCheck[] = []
  for (const { provider, sources, anchors } of loadAll(root)) {
    if (only?.length && !only.includes(provider.id)) continue
    const urls = new Map(sources.map((s) => [s.id, s.url]))
    for (const a of anchors) {
      const text = folded(a.source_id)
      const n = text === null ? -1 : locate(text, a.selector)
      out.push({
        provider_id: provider.id,
        anchor_id: a.id,
        source_id: a.source_id,
        url: urls.get(a.source_id) ?? "",
        state: n < 0 ? "no_snapshot" : n === 0 ? "missing" : n === 1 ? "ok" : "ambiguous",
        exact: a.selector.exact,
      })
    }
  }
  return out
}

/** 哪些 provider 引用了这些来源。共享 URL 会映射到多个 provider，
 *  每个 provider 各自一个 PR、一个 agent。 */
export function ownersOf(root: string, sourceIds: Iterable<string>) {
  const wanted = new Set(sourceIds)
  const owners = new Map<string, string[]>()
  for (const { provider, sources } of loadAll(root)) {
    const mine = sources.filter((s) => wanted.has(s.id)).map((s) => s.id)
    if (mine.length) owners.set(provider.id, mine)
  }
  return owners
}
