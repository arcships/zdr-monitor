#!/usr/bin/env bun
/** 用正式抓取器为 .verify/ 中通过 agent 策展的来源建立 baseline。
 *
 *  研究来源此时还不是正式 provider 数据；抓取成功、锚点可命中后，
 *  research:import 才会把来源和结论一起写进 providers/*.toml。 */
import fs from "node:fs"
import path from "node:path"
import { sourceId, type Source } from "../src/registry"
import { sync } from "../src/sync"

const root = path.join(import.meta.dirname, "..", "..", "..")
const dir = path.join(root, ".verify")
const dryRun = process.argv.includes("--dry-run")
const requested = process.argv.slice(2).filter((value) => !value.startsWith("--"))
const sources = new Map<string, Source>()

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
  if (requested.length && !requested.includes(data.provider_id)) continue
  for (const candidate of data.sources || []) {
    if (candidate.verdict !== "ok" || candidate.tier === "drop") continue
    const source: Source = {
      id: sourceId(candidate.url),
      url: candidate.url,
      channel: candidate.channel || "developer_data",
      tier: candidate.tier === "contradiction" ? "contradiction" : "core",
      note: candidate.tier === "contradiction" && candidate.contradiction_note
        ? candidate.contradiction_note
        : candidate.scope_note || "",
    }
    if (!sources.has(source.id)) sources.set(source.id, source)
  }
}

const report = await sync(root, { sources: [...sources.values()], dryRun })
console.log(`${dryRun ? "[dry-run] " : ""}研究来源 ${report.sources} 份，成功 ${report.sources - report.failed.length} 份`)
if (report.failed.length) {
  for (const result of report.failed) console.error(`${result.verdict}: ${result.url}`)
  process.exit(1)
}
