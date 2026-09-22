#!/usr/bin/env bun
/** 把同步报告里需要人工判断的东西开成 issue。
 *
 *  去重是这一步的命门:标题稳定,开之前先查 open + closed 的同类。
 *  查不到列表就不开——宁可漏一次也不要重复刷屏,重复 issue 会把 issue-fixer
 *  拖进死循环。models.dev 就是这么做的。 */
import { $ } from "bun"
import path from "node:path"
import fs from "node:fs"
import { loadAll } from "../src/registry"
import { loadSources } from "../src/sources"
import { loadFailures } from "../src/sync/health"
import { anchorLost, documentChanged, unreachable, FAILURE_THRESHOLD, type Issue } from "../src/sync/issues"
import type { VerifyReport } from "../src/verify"

const root = path.join(import.meta.dirname, "..", "..", "..")
const dryRun = process.argv.includes("--dry-run")
const reportPath = path.join(root, ".sync", "verify-anchors.json")
if (!fs.existsSync(reportPath)) {
  console.log("没有锚点校验报告,先跑 bun run verify:anchors")
  process.exit(0)
}
const report: VerifyReport = JSON.parse(fs.readFileSync(reportPath, "utf8"))
const tree = loadAll(root)
const anchorById = new Map(tree.flatMap((p) => p.anchors.map((a) => [`${a.provider_id}/${a.id}`, a])))
const sourceById = new Map(loadSources(root).map((s) => [s.id, s]))

const pending: Issue[] = []

// 一、正文变了就交完整 diff。即使某个旧锚点也变了,同一版本里仍可能新增
// 另一条尚无锚点的政策,不能因为已有 anchor issue 就跳过全文复核。
const fetchPath = path.join(root, ".sync", "fetch.json")
if (fs.existsSync(fetchPath)) {
  const fetched = JSON.parse(fs.readFileSync(fetchPath, "utf8"))
  for (const result of fetched.results || []) {
    if (!result.hunks?.length) continue
    const source = sourceById.get(result.source_id)
    if (!source) continue
    const owners = tree.filter((p) => p.sources.some((source) => source.id === result.source_id)).map((p) => p.provider.id)
    pending.push(documentChanged(owners, source.url, result.supersedes, result.version_id, result.hunks))
  }
}

for (const change of report.changes) {
  if (change.state !== "gone") continue
  const anchor = anchorById.get(`${change.provider_id}/${change.anchor_id}`)
  const source = sourceById.get(change.source_id)
  if (!anchor || !source) continue
  pending.push(anchorLost(change.provider_id, change.anchor_id, source.url, anchor.selector.exact))
}

// 连续失败才开 issue。成功时 health 文件会被删除,不会留下每日成功日志。
for (const health of loadFailures(root)) {
  if (health.consecutive_failures < FAILURE_THRESHOLD) continue
  const source = sourceById.get(health.source_id)
  if (!source) continue
  const owners = [...new Set(tree.filter((p) => p.sources.some((source) => source.id === health.source_id)).map((p) => p.provider.id))]
  pending.push(unreachable(owners.join(",") || "未知", source.url, [health.verdict]))
}

if (dryRun) {
  console.log(`[dry-run] ${pending.length} 条待开`)
  for (const issue of pending.slice(0, 20)) console.log("  " + issue.title)
  if (pending.length > 20) console.log(`  ... 另 ${pending.length - 20} 条`)
  process.exit(0)
}

// 查不到已有列表就整个中止,不要带着不完整的去重信息去开 issue。
let existing: Set<string>
try {
  const json = await $`gh issue list --state all --limit 1000 --json title`.quiet().text()
  existing = new Set((JSON.parse(json) as { title: string }[]).map((i) => i.title))
} catch (e) {
  console.error("查不到已有 issue 列表,中止。宁可漏一次也不要重复刷屏。")
  process.exit(1)
}

// issue-fixer 和 retry workflow 用标签识别机器派发的任务。首次运行时仓库里可能
// 还没有这些标签，所以由生产 issue 的同一步负责创建，避免额外的人工初始化。
if (pending.some((issue) => !existing.has(issue.title))) {
  await $`gh label create automation --color 1d76db --description ${"机器创建并维护的任务"} --force`.quiet()
  await $`gh label create dim:ready --color 0e8a16 --description ${"等待 DimCode 处理"} --force`.quiet()
}

let opened = 0
for (const issue of pending) {
  if (existing.has(issue.title)) continue
  // 类型已经编码在稳定标题里。不要依赖仓库预先创建自定义 label；
  // 新仓库第一次运行也必须能开出 issue。
  const url = await $`gh issue create --title ${issue.title} --body ${issue.body} --label automation --label dim:ready`.quiet().text()
  const issueNumber = Number(url.trim().split("/").pop())
  if (!Number.isInteger(issueNumber)) throw new Error(`无法从新 issue URL 取得编号:${url.trim()}`)

  // GITHUB_TOKEN 创建的 issue 不会再次触发 issues.opened workflow。显式 dispatch
  // 才能保证机器发现变化后 DimCode 一定会收到任务。
  await $`gh api --method POST repos/{owner}/{repo}/dispatches -f event_type=policy-review -F ${`client_payload[issue_number]=${issueNumber}`}`.quiet()
  opened++
}
console.log(`待开 ${pending.length} 条,去重后新开 ${opened} 条`)
