#!/usr/bin/env bun
/** 把相关快照的改动历史导出成文件，给不能跑 shell 的 agent 读。
 *
 *  issue-fixer 和 reviewer 都只有读文件的工具。快照是覆盖写的，工作区里只有新版；要判断「厂商删了
 *  哪句、改成了什么」，得看旧正文。没有这个，agent 只能猜「旧页有没有这句」，reviewer 又要求给出
 *  旧句原文，同一个 PR 会被来回打回（#284、#317）。
 *
 *    bun run snapshot:history <out-dir> <file>...
 *  从给出的文件（issue 正文、PR diff）里找 snapshots/<id>.md 和 source_id = "<id>"，
 *  每份快照写一个 <out-dir>/<id>.diff：最近几次改动的 git log -p。需要完整的 git 历史。 */
import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [out, ...inputs] = process.argv.slice(2)
if (!out || !inputs.length) throw new Error("用法: snapshot:history <out-dir> <file>...")
$.cwd(root)

const COMMITS = 4
const MAX_BYTES = 120_000

const ids = new Set<string>()
for (const file of inputs) {
  if (!fs.existsSync(file)) continue
  const text = fs.readFileSync(file, "utf8")
  for (const m of text.matchAll(/snapshots\/([0-9a-f]{16})\.md|source_id\s*=\s*"([0-9a-f]{16})"/g)) ids.add((m[1] ?? m[2])!)
}

fs.mkdirSync(out, { recursive: true })
const written: string[] = []
for (const id of [...ids].sort()) {
  const file = `snapshots/${id}.md`
  if (!fs.existsSync(path.join(root, file))) continue
  const log = await $`git log -p -n ${COMMITS} --format=${"%n===== commit %h %cs %s"} -- ${file}`.nothrow().quiet().text()
  if (!log.trim()) continue
  const body = log.length > MAX_BYTES ? log.slice(0, MAX_BYTES) + "\n…（截断）\n" : log
  fs.writeFileSync(path.join(out, `${id}.diff`), `# ${file} 最近 ${COMMITS} 次改动（- 是旧正文，+ 是新正文）\n${body}`)
  written.push(id)
}
console.log(`写了 ${written.length} 份快照历史到 ${out}${written.length ? "：" + written.join(" ") : ""}`)
