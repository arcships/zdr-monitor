#!/usr/bin/env bun
/** 给 issue-fixer 派活：一个 provider 一个 issue、一个 agent。对应 models.dev 的
 *  missing-issues.ts——标题稳定可去重，open 和 closed 都算，列表拿不全就不开。
 *
 *    bun run review:issues <provider> --pr <n>     快照 PR 合并后：复核这次正文变化
 *    bun run review:issues --full [provider...]    全量复核（留空 = 全部 provider），按月去重
 *    --dry-run                                     只打印 */
import { $ } from "bun"
import path from "node:path"
import { loadProvider, providerIds } from "../src/registry"
import { checkQuotes } from "../src/snapshot"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const full = args.includes("--full")
const pr = args[args.indexOf("--pr") + 1]
const named = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--pr")
$.cwd(root)

const LIMIT = 1000
const month = new Date().toISOString().slice(0, 7)
const clip = (s: string) => s.replace(/\s+/g, " ").slice(0, 200)

function quoteSection(provider: string) {
  const bad = checkQuotes(root, [provider]).filter((c) => c.state !== "ok")
  if (!bad.length) return ["当前全部引文都能在快照里唯一定位。"]
  return [
    `当前 ${bad.length} 条引文需要处理：`,
    "",
    ...bad.map((c) => `- ${c.state} \`${c.anchor_id}\` — \`snapshots/${c.source_id}.md\`（${c.url}）\n  > ${clip(c.exact)}`),
  ]
}

async function issueFor(provider: string) {
  if (full)
    return {
      title: `[full-review] ${provider}: ${month}`,
      body: [
        `全量复核 \`${provider}\`：重读它引用的全部来源快照，逐档位、逐维度核对结论与引文。`,
        "",
        "来源：",
        ...loadProvider(root, provider).sources.map((s) => `- ${s.url} → \`snapshots/${s.id}.md\``),
        "",
        ...quoteSection(provider),
      ].join("\n"),
    }
  const files = JSON.parse(await $`gh pr view ${pr} --json files,url`.quiet().text()) as { url: string; files: { path: string }[] }
  const urls = new Map(loadProvider(root, provider).sources.map((s) => [s.id, s.url]))
  const changed = files.files.map((f) => path.basename(f.path, ".md")).filter((id) => urls.has(id))
  return {
    title: `[policy-review] ${provider}: snapshot #${pr}`,
    body: [
      `快照 PR ${files.url} 已合并，\`${provider}\` 引用的 ${changed.length} 个来源正文有变化。`,
      "判断这些变化是否影响五个维度：影响就修改结论和引文；不影响就说明理由。",
      "",
      "变化的来源（差异见上面 PR 的 Files changed，或 `git log -p` 对应快照文件）：",
      ...changed.map((id) => `- ${urls.get(id)} → \`snapshots/${id}.md\``),
      "",
      ...quoteSection(provider),
    ].join("\n"),
  }
}

const providers = full ? (named.length ? named : providerIds(root)) : named.slice(0, 1)
if (!providers.length || (!full && !pr)) {
  console.error("用法: review:issues <provider> --pr <n> | review:issues --full [provider...]")
  process.exit(2)
}

const kind = full ? "full-review" : "policy-review"
if (!dryRun)
  for (const [label, color] of [["automation", "1d76db"], [kind, "0e8a16"]] as const)
    await $`gh label create ${label} --color ${color} --force`.quiet()

for (const provider of providers) {
  const issue = await issueFor(provider)
  if (dryRun) {
    console.log(`[dry-run] ${issue.title}\n${issue.body}\n`)
    continue
  }
  await $`gh label create ${`provider:${provider}`} --color c5def5 --force`.quiet()
  // 失败即停：拿不到完整列表就不开，免得重复开同一个 issue。
  const existing = JSON.parse(
    await $`gh issue list --state all --label ${kind} --label ${`provider:${provider}`} --limit ${LIMIT} --json number,title`.quiet().text(),
  ) as { number: number; title: string }[]
  if (existing.length >= LIMIT) throw new Error(`issue 列表达到上限 ${LIMIT}，拒绝在不完整的去重列表上开 issue`)
  const found = existing.find((i) => i.title === issue.title)
  if (found) {
    console.log(`已有 #${found.number}：${issue.title}`)
    continue
  }
  const url = (
    await $`gh issue create --title ${issue.title} --body ${issue.body} --label automation --label ${kind} --label ${`provider:${provider}`}`.quiet().text()
  ).trim()
  const number = Number(url.split("/").pop())
  if (!Number.isInteger(number)) throw new Error(`gh issue create 没有返回编号：${url}`)
  // GITHUB_TOKEN 开的 issue 不会触发 issues.opened，显式派发。
  await $`gh api ${`repos/${process.env.GITHUB_REPOSITORY}/dispatches`} --method POST -f event_type=policy-review -f ${`client_payload[provider]=${provider}`} -F ${`client_payload[issue_number]=${number}`}`.quiet()
  console.log(`新开 #${number} 并派发 issue-fixer：${issue.title}`)
}
