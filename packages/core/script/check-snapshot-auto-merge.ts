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
import fs from "node:fs"
import path from "node:path"
import { loadAll } from "../src/registry"
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

// 快照是多家共用的：同一份快照上所有 provider 的引文一起算，按来源判断。
// 只数本家会漏——#293 里 xiaomi-token-plan-cn 自己只丢了 3 条、没过阈值，
// 同一份快照上 xiaomi 的 5 条也一起丢了，合并后两家的引文都坏了。
const anchorsBySource = new Map<string, { provider: string; selector: { prefix?: string; exact: string; suffix?: string } }[]>()
for (const { provider: p, anchors } of loadAll(root))
  for (const a of anchors) anchorsBySource.set(a.source_id, [...(anchorsBySource.get(a.source_id) ?? []), { provider: p.id, selector: a.selector }])
for (const file of files.filter((f) => f.startsWith("snapshots/"))) {
  const id = path.basename(file, ".md")
  const [before, after] = await Promise.all([show(base, file), show(head, file)])
  if (before === null || after === null) continue
  const anchors = anchorsBySource.get(id) ?? []
  const broken = anchors.filter((a) => locate(before, a.selector) === 1 && locate(after, a.selector) !== 1)
  // 一两条引文失效是正常的政策变化，交给 issue-fixer；成片失效更可能是抽取坏了、或抓到了别的地区版本。
  if (broken.length > Math.max(3, anchors.length / 2)) {
    const owners = [...new Set(broken.map((a) => a.provider))].join("、")
    reasons.push(`\`${file}\` 上 ${broken.length}/${anchors.length} 条原本能定位的引文失效（${owners}），疑似抽取出错`)
  }
}

const safe = reasons.length === 0
const summary = safe ? `可以自动合并：${files.length} 个快照。` : `需要人工确认：${reasons.join("；")}。`
console.log(summary)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `safe=${safe}\nsummary=${summary}\n`)
// 拦下来的 PR 不会合并，也就不会开复核 issue、不会派 agent：把原因和该怎么处理写进 PR 正文，
// 否则它每天被重抓刷新一次，却没人知道要看（#248、#282 就这样挂了好几天）
const report = path.join(root, ".sync", "snapshot-report.md")
if (!safe && fs.existsSync(report))
  await appendFile(
    report,
    [
      "",
      "### 未自动合并，需要人判断",
      "",
      ...reasons.map((r) => `- ${r}`),
      "",
      "- 厂商真的改了条款（看 Files changed）：直接合并，合并后照常开复核 issue、派 agent 改结论和引文",
      "- 抓错了页面（验证页、外壳页、别的地区版本）：关掉这个 PR，修来源的抓取方式；快照保持上一版",
      "",
    ].join("\n"),
  )
