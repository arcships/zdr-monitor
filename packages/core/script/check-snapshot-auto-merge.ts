#!/usr/bin/env bun
/** 快照 PR 能不能自动合并。对应 models.dev 的 check-sync-auto-merge。
 *
 *  快照是观察记录，正常情况下总是可以合。要拦的是「抽取坏了」：站点改版后抓回一个
 *  外壳页、长度又刚好过了可用性检查，这个 provider 的引文会成片失效。这时自动合并
 *  会用坏快照替掉好快照，再让 agent 去追一个没发生过的政策变化。
 *
 *    bun run snapshot:auto-merge <provider> [base] [head]   写 safe=true|false 到 GITHUB_OUTPUT */
import { $ } from "bun"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { loadProvider } from "../src/registry"
import { fold, locate } from "../src/snapshot/quote"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [provider, base = "HEAD^", head = "HEAD"] = process.argv.slice(2)
if (!provider) throw new Error("用法: snapshot:auto-merge <provider> [base] [head]")
$.cwd(root)

const files = (await $`git diff --name-only --no-renames ${base} ${head}`.quiet().text()).split("\n").filter(Boolean)
const reasons: string[] = []
const outside = files.filter((f) => !/^snapshots\/[0-9a-f]{16}\.md$/.test(f))
if (outside.length) reasons.push(`改动了快照以外的文件：${outside.join(", ")}`)

const show = async (rev: string, file: string) => {
  const r = await $`git show ${`${rev}:${file}`}`.nothrow().quiet()
  return r.exitCode === 0 ? fold(r.stdout.toString().replace(/^<!--.*?-->\n/, "")) : null
}

const { anchors } = loadProvider(root, provider)
let broken = 0
let watched = 0
for (const file of files.filter((f) => f.startsWith("snapshots/"))) {
  const id = path.basename(file, ".md")
  const [before, after] = await Promise.all([show(base, file), show(head, file)])
  if (before === null || after === null) continue
  for (const a of anchors.filter((a) => a.source_id === id)) {
    watched++
    if (locate(before, a.selector) === 1 && locate(after, a.selector) !== 1) broken++
  }
}
// 一两条引文失效是正常的政策变化，交给 issue-fixer；成片失效更可能是抽取坏了。
if (broken > Math.max(3, watched / 2)) reasons.push(`${broken}/${watched} 条原本能定位的引文失效，疑似抽取出错`)

const safe = reasons.length === 0
const summary = safe ? `可以自动合并：${files.length} 个快照，${broken} 条引文失效。` : `需要人工确认：${reasons.join("；")}。`
console.log(summary)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `safe=${safe}\nsummary=${summary}\n`)
