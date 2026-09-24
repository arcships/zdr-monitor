#!/usr/bin/env bun
/** 抓取来源，覆盖写 snapshots/。对应 models.dev 的 models:sync。
 *
 *    bun run snapshot --list-providers    输出 CI matrix
 *    bun run snapshot <provider>          只抓这个 provider 引用的来源（CI 每个 job 一个）
 *    bun run snapshot                     全部来源（本地用）
 *    bun run snapshot <provider> --dry-run   不写快照；跟快照不一样的正文留在 .sync/fetched/
 *
 *  报告写到 .sync/snapshot-report.md，CI 拿它当 PR 正文和运行摘要。
 *  抓取失败不写快照，只进报告——失败是关于我们的事实，不是关于厂商的。 */
import fs from "node:fs"
import path from "node:path"
import { loadProvider, providerIds } from "../src/registry"
import { allSources, checkQuotes, snapshotAll } from "../src/snapshot"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)

if (args.includes("--list-providers")) {
  console.log(JSON.stringify({ include: providerIds(root).map((provider) => ({ provider })) }))
  process.exit(0)
}

const target = args.find((a) => !a.startsWith("-"))
const sources = target ? loadProvider(root, target).sources : allSources(root)
const results = await snapshotAll(root, sources, {
  dryRun: args.includes("--dry-run"),
  log: (line) => console.error(line),
})

const counts = results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] || 0) + 1), m), {})
const changed = results.filter((r) => r.outcome === "created" || r.outcome === "changed")
const failed = results.filter((r) => r.outcome === "failed")
const touched = new Set(changed.map((r) => r.source_id))
const quotes = target ? checkQuotes(root, [target]).filter((c) => touched.has(c.source_id) && c.state !== "ok") : []
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
