#!/usr/bin/env bun
/** 抓取来源，覆盖写 snapshots/。对应 models.dev 的 models:sync。
 *
 *    bun run snapshot --list-providers    输出 CI matrix
 *    bun run snapshot <provider>          只抓这个 provider 引用的来源（CI 每个 job 一个）
 *    bun run snapshot                     全部来源（本地用）
 *    bun run snapshot <provider> --dry-run   不写快照；跟快照不一样的正文留在 .sync/fetched/
 *    bun run snapshot <provider> --new-only  只抓还没有快照的来源（issue-fixer 给新加的来源抓快照用，
 *                                            不能顺手把已有快照重抓一遍带进 agent 的 PR）
 *
 *  报告写到 .sync/snapshot-report.md，CI 拿它当 PR 正文和运行摘要。
 *  抓取失败不写快照，只进报告——失败是关于我们的事实，不是关于厂商的。 */
import fs from "node:fs"
import path from "node:path"
import { loadProvider, providerIds } from "../src/registry"
import { allSources, checkQuotes, readSnapshot, snapshotAll } from "../src/snapshot"
import { rebindAnchor } from "../src/snapshot/rebind"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)

if (args.includes("--list-providers")) {
  console.log(JSON.stringify({ include: providerIds(root).map((provider) => ({ provider })) }))
  process.exit(0)
}

const target = args.find((a) => !a.startsWith("-"))
const sources = (target ? loadProvider(root, target).sources : allSources(root)).filter(
  (s) => !args.includes("--new-only") || readSnapshot(root, s.id) === null,
)
const results = await snapshotAll(root, sources, {
  dryRun: args.includes("--dry-run"),
  provider: target,
  log: (line) => console.error(line),
})

// Jev 认定只是改写的引文直接改绑，不用为它派 agent。只改本 provider 的文件：
// 每个 matrix job 只按本家的引文判断（watches 按 provider 过滤）
const rebound: string[] = []
if (target && !args.includes("--dry-run")) {
  const file = path.join(root, "providers", `${target}.toml`)
  const anchors = loadProvider(root, target).anchors
  let toml = fs.readFileSync(file, "utf8")
  for (const r of results)
    for (const b of r.jev?.rebinds ?? []) {
      const a = anchors.find(
        (x) => x.source_id === r.source_id && x.selector.exact === b.from.exact && x.selector.prefix === b.from.prefix && x.selector.suffix === b.from.suffix,
      )
      if (!a) continue
      toml = rebindAnchor(toml, a.id, b.exact)
      rebound.push(a.id)
    }
  if (rebound.length) fs.writeFileSync(file, toml)
}

const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] || 0) + 1), m), {})
const changed = results.filter((r) => r.outcome === "created" || r.outcome === "changed")
const failed = results.filter((r) => r.outcome === "failed")
const touched = new Set(changed.map((r) => r.source_id))
const quotes = target ? checkQuotes(root, [target]).filter((c) => touched.has(c.source_id) && c.state !== "ok") : []
const NO_REVIEW = "<!-- jev:no-review -->"
const clip = (s: string) => s.replace(/\s+/g, " ").slice(0, 160)

const lines = [
  `Updates snapshots for \`${target ?? "all"}\`.`,
  "",
  "| 结果 | 数量 |",
  "| --- | ---: |",
  ...Object.entries(counts).map(([k, v]) => `| ${k} | ${v} |`),
]
if (changed.length)
  lines.push(
    "",
    "### 正文变化",
    "",
    ...changed.flatMap((r) => [
      `- ${r.outcome}: ${r.url} → \`snapshots/${r.source_id}.md\``,
      ...(r.reasons ?? []).slice(0, 8).map((x) => `  - ${x}`),
    ]),
  )
// Jev 拦下的不写快照，也就不进 PR 的 Files changed；列在报告里，误拦了能看出来
const vetoed = results.filter((r) => r.outcome === "cosmetic" && r.jev?.dims)
if (vetoed.length)
  lines.push(
    "",
    "### Jev 判为非政策变化（未重写快照）",
    "",
    ...vetoed.flatMap((r) => [`- ${r.url}`, ...(r.reasons ?? []).slice(0, 4).map((x) => `  - ${x}`)]),
  )
if (rebound.length) lines.push("", "### Jev 自动改绑的引文", "", ...rebound.map((id) => `- \`${target}/${id}\``))
// 这次变化全都是 Jev 判过的非政策变化和已改绑的改写：合并后不开复核 issue（open-review-issues.ts 认这个标记）
const quiet =
  changed.length > 0 &&
  changed.every((r) => r.outcome === "changed" && r.jev && !r.jev.error && !r.jev.policy && r.jev.unresolved === 0) &&
  !quotes.length
if (quiet) lines.push("", NO_REVIEW, "本次变化经 Jev 判断不涉及五个维度上的承诺，失效引文已自动改绑；合并后不派 agent 复核。")
if (quotes.length)
  lines.push("", "### 变化来源上需要处理的引文", "", ...quotes.map((c) => `- ${c.state} \`${c.provider_id}/${c.anchor_id}\`：${clip(c.exact)}`))
if (failed.length)
  lines.push(
    "",
    "### 抓取失败（快照保持原样，不影响结论）",
    "",
    "| 方式 | 来源 | 原因 |",
    "| --- | --- | --- |",
    ...failed.map((r) => `| ${r.method} | ${r.url} | ${r.error} |`),
  )

fs.mkdirSync(path.join(root, ".sync"), { recursive: true })
fs.writeFileSync(path.join(root, ".sync", "snapshot-report.md"), lines.join("\n") + "\n")
console.log(`${target ?? "all"}: ${results.length} 个来源,` + Object.entries(counts).map(([k, v]) => ` ${k} ${v}`).join(""))
