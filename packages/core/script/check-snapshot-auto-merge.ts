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
import { jevEnabled } from "../src/jev"
import { parse } from "../src/toml"
import { samePage, samePageThreshold } from "../src/snapshot/jev"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [provider, base = "HEAD^", head = "HEAD"] = process.argv.slice(2)
if (!provider) throw new Error("用法: snapshot:auto-merge <provider> [base] [head]")
$.cwd(root)

const files = (await $`git diff --name-only --no-renames ${base} ${head}`.quiet().text()).split("\n").filter(Boolean)
const reasons: string[] = []
const notes: string[] = []
// Jev 自动改绑会改本家的 provider 文件，但只能改锚点的 selector，且改后的引文必须在新快照里唯一定位
const own = `providers/${provider}.toml`
const outside = files.filter((f) => !/^snapshots\/[0-9a-f]{16}\.md$/.test(f) && f !== own)
if (outside.length) reasons.push(`改动了快照以外的文件：${outside.join(", ")}`)

async function checkRebinds() {
  const read = async (rev: string) => {
    const r = await $`git show ${`${rev}:${own}`}`.nothrow().quiet()
    return r.exitCode === 0 ? (parse(r.stdout.toString()) as any) : null
  }
  const [a, b] = await Promise.all([read(base), read(head)])
  if (!a || !b) return [`\`${own}\` 新增或删除了`]
  const strip = (x: any) => ({ ...x, anchor: (x.anchor ?? []).map(({ selector, ...rest }: any) => rest) })
  if (JSON.stringify(strip(a)) !== JSON.stringify(strip(b))) return [`\`${own}\` 除了锚点 selector 还改了别的`]
  const out: string[] = []
  for (const [i, anchor] of (b.anchor ?? []).entries()) {
    if (JSON.stringify(anchor.selector) === JSON.stringify(a.anchor[i].selector)) continue
    const text = await show(head, `snapshots/${anchor.source_id}.md`)
    if (text === null || locate(fold(text), anchor.selector) !== 1) out.push(`改绑后的引文 \`${anchor.id}\` 在新快照里不能唯一定位`)
  }
  return out
}

/** 旧快照的长句有多少原样出现在新快照里。长句的门槛跟快照层一致：短行是菜单、按钮、时间戳 */
const MIN_RETAINED = 0.4
const retained = (before: string, after: string) => {
  const lines = (text: string) => new Set(text.split("\n").map((l) => fold(l)).filter((l) => l.length >= 25))
  const [x, y] = [lines(before), lines(after)]
  return x.size ? [...x].filter((l) => y.has(l)).length / x.size : 1
}

const show = async (rev: string, file: string) => {
  const r = await $`git show ${`${rev}:${file}`}`.nothrow().quiet()
  return r.exitCode === 0 ? r.stdout.toString().replace(/^<!--.*?-->\n/, "") : null
}
if (files.includes(own)) reasons.push(...(await checkRebinds()))

// 快照是多家共用的：同一份快照上所有 provider 的引文一起算，按来源判断。
// 只数本家会漏——#293 里 xiaomi-token-plan-cn 自己只丢了 3 条、没过阈值，
// 同一份快照上 xiaomi 的 5 条也一起丢了，合并后两家的引文都坏了。
const urls = new Map<string, string>()
const anchorsBySource = new Map<string, { provider: string; selector: { prefix?: string; exact: string; suffix?: string } }[]>()
for (const { provider: p, sources, anchors } of loadAll(root)) {
  for (const s of sources) urls.set(s.id, s.url)
  for (const a of anchors) anchorsBySource.set(a.source_id, [...(anchorsBySource.get(a.source_id) ?? []), { provider: p.id, selector: a.selector }])
}
for (const file of files.filter((f) => f.startsWith("snapshots/"))) {
  const id = path.basename(file, ".md")
  const [rawBefore, rawAfter] = await Promise.all([show(base, file), show(head, file)])
  if (rawBefore === null || rawAfter === null) continue
  const [before, after] = [fold(rawBefore), fold(rawAfter)]
  const anchors = anchorsBySource.get(id) ?? []
  const broken = anchors.filter((a) => locate(before, a.selector) === 1 && locate(after, a.selector) !== 1)
  // 一两条引文失效是正常的政策变化，交给 issue-fixer。成片失效有两种：厂商改写了条款（#389 IBM 改了
  // Data Sheet），或者我们抓错了页面（验证页、别的地区版本）。区分靠旧正文还剩多少：改写时大部分句子
  // 还在（实测 0.49–0.90），抓错页面时几乎一句不剩（0–0.14）。只拦后一种
  const kept = retained(rawBefore, rawAfter)
  if (broken.length > Math.max(3, anchors.length / 2) && kept < MIN_RETAINED) {
    const owners = [...new Set(broken.map((a) => a.provider))].join("、")
    const what = `\`${file}\` 上 ${broken.length}/${anchors.length} 条原本能定位的引文失效（${owners}），旧正文的长句只剩 ${Math.round(kept * 100)}%`
    // 比例分不开「厂商整页重写」和「抓错页面」（#708 IBM 改版只剩 20%）。Jev 读两版正文，很有把握是同一份文档才放行
    let p: number | undefined
    if (jevEnabled())
      try {
        p = await samePage(urls.get(id) ?? file, rawBefore, rawAfter)
      } catch (e: any) {
        notes.push(`Jev 未能判断 \`${file}\`：${String(e?.message || e).slice(0, 120)}`)
      }
    if (p !== undefined && p >= samePageThreshold()) notes.push(`${what}；Jev 判为同一文档改版（${p.toFixed(2)}），照常合并`)
    else reasons.push(`${what}，疑似抓错了页面${p === undefined ? "" : `（Jev 判为同一文档的概率 ${p.toFixed(2)}）`}`)
  }
}

const safe = reasons.length === 0
const summary = safe ? `可以自动合并：${files.filter((f) => f.startsWith("snapshots/")).length} 个快照。` : `需要人工确认：${reasons.join("；")}。`
console.log(summary)
for (const n of notes) console.log(n)
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `safe=${safe}\nsummary=${summary}\n`)
// 拦下来的 PR 不会合并，也就不会开复核 issue、不会派 agent：把原因和该怎么处理写进 PR 正文，
// 否则它每天被重抓刷新一次，却没人知道要看（#248、#282 就这样挂了好几天）
const report = path.join(root, ".sync", "snapshot-report.md")
if (notes.length && fs.existsSync(report)) await appendFile(report, ["", "### Jev 复核", "", ...notes.map((n) => `- ${n}`), ""].join("\n"))
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
