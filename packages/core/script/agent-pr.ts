#!/usr/bin/env bun
/** agent PR 的闭环：reviewer 看完之后，合并或者打回，不等人。
 *
 *  合并要同时满足：
 *    - 只改了一家的 providers/<p>.toml、changes/<p>/，以及 workflow 为新来源抓的 snapshots/
 *    - PR 上的校验（test）通过
 *    - 合进当前 main 之后：validate、check:quotes --strict、check:change-record 都过
 *      （agent 是按开 PR 时的快照写的，之后快照可能又变了，所以按合并后的结果算）
 *    - reviewer 没有待办
 *    - 没有删除或替换已有来源（sources-changed 留给人）
 *  不满足就把原因写成一条评论，再派一次 issue-fixer 按意见重做；打回两轮还不行就打 needs-human。
 *
 *    bun run agent:pr <pr> --ready|--not-ready [--review <file>] [--dry-run]
 *  需要 GH_TOKEN 能推送和合并（bot 凭证：用 GITHUB_TOKEN 合并不会触发 Pages 部署）。 */
import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)
const pr = args[0]
const ready = args.includes("--ready")
const dryRun = args.includes("--dry-run")
const reviewFile = args[args.indexOf("--review") + 1]
if (!pr || (!ready && !args.includes("--not-ready"))) throw new Error("用法: agent:pr <pr> --ready|--not-ready [--review <file>]")
$.cwd(root)

const MARK = "<!-- zdr-agent-pr -->"
const MAX_ROUNDS = 2
const repo = process.env.GITHUB_REPOSITORY

const info = JSON.parse(
  await $`gh pr view ${pr} --json headRefName,headRefOid,labels,files,comments,state`.quiet().text(),
) as {
  headRefName: string
  headRefOid: string
  state: string
  labels: { name: string }[]
  files: { path: string }[]
  comments: { body: string }[]
}
const issue = info.headRefName.match(/^dim\/issue-(\d+)$/)?.[1]
if (!issue || info.state !== "OPEN") {
  console.log(`#${pr} 不是开着的 agent PR，跳过`)
  process.exit(0)
}

const problems: string[] = []
const providers = [...new Set(info.files.map((f) => f.path.match(/^providers\/([^/]+)\.toml$/)?.[1]).filter(Boolean))] as string[]
const provider = providers[0]
if (providers.length !== 1) problems.push(`PR 应该只改一家的 providers/<id>.toml，实际是：${providers.join("、") || "没有"}`)
const outside = info.files.map((f) => f.path).filter((p) => !(p === `providers/${provider}.toml` || p.startsWith(`changes/${provider}/`) || /^snapshots\/[0-9a-f]{16}\.md$/.test(p)))
if (outside.length) problems.push(`改了不该改的文件：${outside.join("、")}`)

// PR 上的 test 检查。reviewer 自己也是一个 check，不能 --watch 全部
async function testCheck() {
  for (let i = 0; i < 60; i++) {
    const checks = JSON.parse(await $`gh pr checks ${pr} --json name,bucket`.nothrow().quiet().text() || "[]") as { name: string; bucket: string }[]
    const test = checks.find((c) => c.name === "test")
    if (test && test.bucket !== "pending") return test.bucket
    await Bun.sleep(15000)
  }
  return "timeout"
}

const log = (name: string, r: { exitCode: number; stdout: Buffer; stderr: Buffer }) =>
  (r.stdout.toString() + r.stderr.toString()).trim().split("\n").slice(-15).join("\n").replace(/^/, `${name}：\n`)

// 在一个临时工作区里把 PR 合进最新的 main，再跑确定性检查。
// 前面已经确认 PR 只改了数据文件，这里跑的脚本都来自 main
async function gate() {
  const dir = path.join(root, ".sync", "gate")
  fs.rmSync(dir, { recursive: true, force: true })
  await $`git worktree prune`.quiet()
  await $`git fetch --no-tags origin main ${`+refs/pull/${pr}/head:refs/remotes/pr/${pr}`}`.quiet()
  await $`git worktree add --detach ${dir} origin/main`.quiet()
  try {
    const merged = await $`git -C ${dir} merge --no-edit ${`refs/remotes/pr/${pr}`}`.nothrow().quiet()
    if (merged.exitCode !== 0) return [`和当前 main 合并有冲突，要在最新的 main 上重做`]
    await $`bun install --frozen-lockfile`.cwd(dir).quiet()
    const out: string[] = []
    for (const [name, cmd] of [
      ["validate", ["run", "validate"]],
      ["check:quotes", ["run", "check:quotes", provider!, "--strict"]],
      ["check:change-record", ["run", "check:change-record", provider!, "origin/main"]],
    ] as const) {
      const r = await $`bun ${cmd}`.cwd(dir).nothrow().quiet()
      if (r.exitCode !== 0) out.push("```\n" + log(name, r) + "\n```")
    }
    return out
  } finally {
    await $`git worktree remove --force ${dir}`.nothrow().quiet()
  }
}

if (!problems.length) {
  const test = await testCheck()
  if (test !== "pass") problems.push(`PR 上的校验（test）没有通过：${test}`)
  problems.push(...(await gate()))
}
const review = reviewFile && fs.existsSync(reviewFile) ? fs.readFileSync(reviewFile, "utf8").trim() : ""
if (!ready) problems.push(`reviewer 的待办：\n\n${review || "（没有拿到 reviewer 输出）"}`)

const comment = async (body: string) =>
  dryRun ? console.log(`[dry-run] 评论：\n${body}`) : $`gh pr comment ${pr} --body ${`${MARK}\n${body}`}`.quiet()
const label = async (name: string, color: string) => {
  if (dryRun) return console.log(`[dry-run] 标签：${name}`)
  await $`gh label create ${name} --color ${color} --force`.quiet()
  await $`gh pr edit ${pr} --add-label ${name}`.quiet()
}

if (!problems.length) {
  if (info.labels.some((l) => l.name === "sources-changed")) {
    await label("needs-human", "d93f0b")
    await comment("检查都通过了，但这个 PR 删除或替换了已有来源，按规则留给人确认后合并。")
    console.log(`#${pr} 检查通过，删改了来源，留给人`)
    process.exit(0)
  }
  await comment(
    [
      "**自动合并**：",
      "",
      `- 只改了 \`providers/${provider}.toml\`${info.files.some((f) => f.path.startsWith("changes/")) ? `、\`changes/${provider}/\`` : ""}${info.files.some((f) => f.path.startsWith("snapshots/")) ? " 和新来源的快照" : ""}`,
      "- PR 校验（test）通过",
      "- 合进当前 main 后 validate、check:quotes --strict、check:change-record 通过",
      "- reviewer 没有待办",
      "- 没有删除或替换已有来源",
    ].join("\n"),
  )
  if (!dryRun) await $`gh pr merge ${pr} --squash --delete-branch --match-head-commit ${info.headRefOid}`.quiet()
  console.log(`#${pr} 已自动合并`)
  process.exit(0)
}

if (!provider) {
  await label("needs-human", "d93f0b")
  await comment(`**停下来等人处理**：\n\n${problems.map((p) => `- ${p}`).join("\n")}`)
  process.exit(0)
}
const rounds = info.comments.filter((c) => c.body.startsWith(MARK) && c.body.includes("**打回**")).length
if (rounds >= MAX_ROUNDS) {
  await label("needs-human", "d93f0b")
  await comment(`**已打回 ${rounds} 轮仍未通过，停下来等人处理。** 这一轮的问题：\n\n${problems.map((p) => `- ${p}`).join("\n")}`)
  console.log(`#${pr} 打回 ${rounds} 轮仍未通过，交给人`)
  process.exit(0)
}
await comment(
  `**打回**（第 ${rounds + 1}/${MAX_ROUNDS} 轮），issue-fixer 会按下面的问题在最新的 main 上重做：\n\n${problems.map((p) => `- ${p}`).join("\n")}`,
)
if (!dryRun) await $`gh api ${`repos/${repo}/dispatches`} --method POST -f event_type=policy-review -f ${`client_payload[provider]=${provider}`} -F ${`client_payload[issue_number]=${issue}`}`.quiet()
console.log(`#${pr} 打回，重新派发 issue #${issue}`)
