#!/usr/bin/env bun
/** 抓取。从 providers/*.toml 汇总来源,抓,存。
 *  不解析政策语义、不判锚点；provider 参数只在 CLI 边界展开为 source id。 */
import path from "node:path"
import fs from "node:fs"
import { sync } from "../src/sync"
import { loadAll } from "../src/registry"

const root = path.join(import.meta.dirname, "..", "..", "..")
const argv = process.argv.slice(2)
const dryRun = argv.includes("--dry-run")
const requested = argv.filter((a) => !a.startsWith("--"))

// sync 本身只认识 source。CLI 在边界把 provider id 展开为它引用的 source ids，
// 避免用 URL 是否碰巧包含 provider 名来冒充「按 provider 抓取」。
const providers = new Map(loadAll(root).map((p) => [p.provider.id, p]))
const only = [...new Set(requested.flatMap((value) => {
  const provider = providers.get(value)
  return provider ? provider.sources.map((source) => source.id) : [value]
}))]

const report = await sync(root, { only, dryRun })

const lines = [`# 抓取 ${report.started_at.slice(0, 10)}`, "", `${report.sources} 个文档。`, ""]
lines.push("| 判定 | 数量 |", "| --- | --- |")
for (const [verdict, count] of Object.entries(report.counts).sort((a, b) => b[1] - a[1]))
  lines.push(`| \`${verdict}\` | ${count} |`)

const changed = report.changed.filter((r) => r.hunks?.length)
if (changed.length) {
  lines.push("", "## 正文变动（待 agent 判断语义）", "")
  for (const r of changed) {
    lines.push(`### ${r.url}`, "", `\`${r.supersedes?.slice(0, 12)}\` → \`${r.version_id?.slice(0, 12)}\``, "")
    for (const h of r.hunks!.slice(0, 20))
      lines.push(`${h.kind === "added" ? "+" : "-"} ${h.text.slice(0, 200)}`)
    if (r.hunks!.length > 20) lines.push(`… 另 ${r.hunks!.length - 20} 处`)
    lines.push("")
  }
}
if (report.failed.length) {
  lines.push("", "## 抓取失败", "")
  for (const r of report.failed) lines.push(`- \`${r.verdict}\` ${r.url}`)
}

const body = lines.join("\n") + "\n"
if (!dryRun) {
  fs.mkdirSync(path.join(root, ".sync"), { recursive: true })
  fs.writeFileSync(path.join(root, ".sync", "fetch.md"), body)
  fs.writeFileSync(path.join(root, ".sync", "fetch.json"), JSON.stringify(report, null, 2))
}
console.log(body)

// 抓不到就是错。不要静默吞掉——那会让一个悄悄失效的来源在台账里挂着
// 一条没人再复核的结论。CI 变红是这里唯一想要的效果:
// 报告写了、issue 开了、agent 去修。
if (report.failed.length) {
  console.error(`\n${report.failed.length}/${report.sources} 个文档抓取失败。`)
  console.error(`连续失败的会开 [unreachable] issue 转给 agent;一次性失败下轮自愈。`)
  process.exit(1)
}
