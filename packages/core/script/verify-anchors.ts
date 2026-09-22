#!/usr/bin/env bun
/** 校验锚点。读 documents/ 和 providers/,不解析政策语义。
 *  不联网。抓取挂了也能跑——它判的是磁盘上已有的数据。 */
import path from "node:path"
import fs from "node:fs"
import { verifyAnchors } from "../src/verify"

const root = path.join(import.meta.dirname, "..", "..", "..")
const argv = process.argv.slice(2)
const replay = argv.includes("--replay")
const only = argv.filter((a) => !a.startsWith("--"))

const report = verifyAnchors(root, { only, replay })

const lines = [`# 锚点校验 ${report.at.slice(0, 10)}`, ""]
lines.push(`${report.anchors} 个锚点,${report.providers} 家。`, "")
lines.push(`原文未变 ${report.exact}`)
if (report.skipped) lines.push(`因来源异常或尚无基线而跳过 ${report.skipped}(不判 gone)`)

// 这批不是政策变化,是引文本身锚不住——多半是客户端渲染的内容,
// agent 在浏览器里看得到,jina 抓下来的正文里没有。报成 gone 会让人去查
// 一个根本没发生过的变化。
if (report.unanchorable.length) {
  lines.push("", `## 引文锚不住 ${report.unanchorable.length} 条(不是政策变化)`, "")
  for (const id of report.unanchorable) lines.push(`- \`${id}\` — 这句话在该来源的所有历史快照里一次都没命中过`)
  lines.push("", "要么换一个抓得到这句话的来源,要么换一条依据。别删锚点了事。")
}

if (report.changes.length) {
  lines.push("", "## 需要处理", "")
  for (const c of report.changes) {
    if (c.state === "reworded")
      lines.push(`- **条款改了词** \`${c.provider_id}/${c.anchor_id}\``, `  现在是:${c.found?.slice(0, 200)}`)
    else lines.push(`- **条款找不到了** \`${c.provider_id}/${c.anchor_id}\` — 需开 issue 人工确认`)
  }
} else {
  lines.push("", "本次已核验的锚点均未变。")
}

const body = lines.join("\n") + "\n"
if (!replay) {
  fs.mkdirSync(path.join(root, ".sync"), { recursive: true })
  fs.writeFileSync(path.join(root, ".sync", "verify-anchors.md"), body)
  fs.writeFileSync(path.join(root, ".sync", "verify-anchors.json"), JSON.stringify(report, null, 2))
}
console.log(body)
