#!/usr/bin/env bun
/** 引文核对：每条引文必须能在 bot 抓回的快照里找到。离线、确定。
 *
 *    bun run check:quotes [provider...]   默认全部
 *    --strict                             有 missing 就退出 1（PR 关卡用）
 *    --md                                 输出 markdown（PR 正文用）
 *
 *  no_snapshot 不算失败：来源还没抓到时无从核对，那是抓取的事，不是引文的事。 */
import path from "node:path"
import { checkQuotes } from "../src/snapshot"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith("--"))
const checks = checkQuotes(root, only)

const counts = checks.reduce<Record<string, number>>((m, c) => ((m[c.state] = (m[c.state] || 0) + 1), m), {})
const missing = checks.filter((c) => c.state === "missing")
const ambiguous = checks.filter((c) => c.state === "ambiguous")
const clip = (s: string) => s.replace(/\s+/g, " ").slice(0, 140)

if (args.includes("--md")) {
  console.log(`引文核对:${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}\n`)
  if (missing.length) {
    console.log("### 快照里找不到的引文\n")
    for (const c of missing) console.log(`- \`${c.provider_id}/${c.anchor_id}\` — ${c.url}\n  > ${clip(c.exact)}`)
  }
  if (ambiguous.length) {
    console.log("\n### 在快照里出现多次的引文(需确认对应的是哪一档)\n")
    for (const c of ambiguous) console.log(`- \`${c.provider_id}/${c.anchor_id}\` — ${c.url}`)
  }
} else {
  console.log(`${checks.length} 条引文:` + Object.entries(counts).map(([k, v]) => ` ${k} ${v}`).join(""))
  for (const c of missing) console.log(`  missing  ${c.provider_id}/${c.anchor_id}  ${c.url}`)
}
if (args.includes("--strict") && missing.length) process.exit(1)
