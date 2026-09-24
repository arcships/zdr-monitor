#!/usr/bin/env bun
/** 快照 PR 能不能自动合并。对应 models.dev 的 check-sync-auto-merge。
 *
 *  快照是观察记录，正常情况下总是可以合。要拦的是「抽取坏了」：站点改版后抓回一个
 *  外壳页、长度又刚好过了可用性检查，这个 provider 的引文会成片失效。这时自动合并
 *  会用坏快照替掉好快照，再让 agent 去追一个没发生过的政策变化。
 *
 *  同时判断这次变化值不值得叫 agent 复核（review=true|false）。快照总是照常更新，
 *  但只有变化碰到了跟五个维度有关的内容才开 [policy-review] issue：
 *    - 原本能定位的引文失效了；或者
 *    - 变化的正文行里出现训练、保留、删除、角色、数据驻留、期限这类词。
 *  帮助中心「相关文章」换了几条推荐、「Updated: yesterday」变成「3 days ago」都不算。
 *
 *    bun run snapshot:auto-merge <provider> [base] [head]
 *      写 safe= / review= 到 GITHUB_OUTPUT，命中的行打印成 markdown（CI 拼进 PR 正文） */
import { $ } from "bun"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { loadProvider } from "../src/registry"
import { fold, locate } from "../src/snapshot/quote"
import { policyChanges } from "../src/snapshot/relevance"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [provider, base = "HEAD^", head = "HEAD"] = process.argv.slice(2)
if (!provider) throw new Error("用法: snapshot:auto-merge <provider> [base] [head]")
$.cwd(root)

const files = (await $`git diff --name-only --no-renames ${base} ${head}`.quiet().text()).split("\n").filter(Boolean)
const reasons: string[] = []
const outside = files.filter((f) => !/^snapshots\/[0-9a-f]{16}\.md$/.test(f))
if (outside.length) reasons.push(`改动了快照以外的文件：${outside.join(", ")}`)

const raw = async (rev: string, file: string) => {
  const r = await $`git show ${`${rev}:${file}`}`.nothrow().quiet()
  return r.exitCode === 0 ? r.stdout.toString().replace(/^<!--.*?-->\n/, "") : null
}

const { anchors } = loadProvider(root, provider)
let broken = 0
let watched = 0
const hits: string[] = []
const lost: string[] = []
for (const file of files.filter((f) => f.startsWith("snapshots/"))) {
  const id = path.basename(file, ".md")
  const [before, after] = await Promise.all([raw(base, file), raw(head, file)])
  if (after === null) continue
  // 新来源的第一份快照不算变化：它的引文由加来源的那次复核负责
  if (before === null) continue
  for (const a of anchors.filter((a) => a.source_id === id)) {
    watched++
    if (locate(fold(before), a.selector) === 1 && locate(fold(after), a.selector) !== 1) {
      broken++
      lost.push(`\`${file}\` 引文失效：「${a.selector.exact.slice(0, 120)}」`)
    }
  }
  for (const line of policyChanges(before, after)) hits.push(`\`${file}\` ${line.slice(0, 240)}`)
}
// 一两条引文失效是正常的政策变化，交给 issue-fixer；成片失效更可能是抽取坏了。
if (broken > Math.max(3, watched / 2)) reasons.push(`${broken}/${watched} 条原本能定位的引文失效，疑似抽取出错`)

const safe = reasons.length === 0
const review = lost.length > 0 || hits.length > 0
console.log(
  [
    "## 复核判定",
    "",
    safe ? `可以自动合并：${files.length} 个快照，${broken} 条引文失效。` : `需要人工确认：${reasons.join("；")}。`,
    review
      ? "变化碰到了跟五个维度有关的内容，合并后开 [policy-review] issue 交给 agent："
      : "变化没有碰到引文，也没有出现跟五个维度有关的词，合并后不开复核 issue。",
    ...[...lost, ...hits.slice(0, 20)].map((x) => `- ${x}`),
    ...(hits.length > 20 ? [`- …另 ${hits.length - 20} 行`] : []),
  ].join("\n"),
)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `safe=${safe}\nreview=${review}\n`)
