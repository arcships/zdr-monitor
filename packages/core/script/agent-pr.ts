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
 *  不满足就把原因写成一条评论，再派一次 issue-fixer 按意见重做。前两轮用默认模型，之后换更强的
 *  模型（STRONG_MODEL，默认 gpt-6-sol）；五轮都不过才打 needs-human。实跑下来 reviewer 的意见
 *  一轮比一轮窄（先是归类错，再是缺引文、方向没依据），三轮常常差一点。
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
const MAX_ROUNDS = 5
const STRONG_FROM = 3
const STRONG_MODEL = process.env.STRONG_MODEL || "gpt-6-sol"
const repo = process.env.GITHUB_REPOSITORY

const info = JSON.parse(
  await $`gh pr view ${pr} --json headRefName,headRefOid,labels,comments,state,body`.quiet().text(),
) as {
  headRefName: string
  headRefOid: string
  state: string
  body: string
  labels: { name: string }[]
  comments: { body: string }[]
}
const issue = info.headRefName.match(/^dim\/issue-(\d+)$/)?.[1]
if (!issue || info.state !== "OPEN") {
  console.log(`#${pr} 不是开着的 agent PR，跳过`)
  process.exit(0)
}

const problems: string[] = []
let provider: string | undefined
let files: string[] = []

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

// 在一个临时工作区里把 PR 合进最新的 main，先确认 PR 只改了一家的数据文件，再跑确定性检查。
// 文件清单取合并后的 git diff，不用分页的 API：这一关漏了，下面就会以 bot 身份跑 PR 里的脚本
async function gate(): Promise<string[]> {
  const dir = path.join(root, ".sync", "gate")
  fs.rmSync(dir, { recursive: true, force: true })
  await $`git worktree prune`.quiet()
  await $`git fetch --no-tags origin main ${`+refs/pull/${pr}/head:refs/remotes/pr/${pr}`}`.quiet()
  await $`git worktree add --detach ${dir} origin/main`.quiet()
  try {
    const merged = await $`git -C ${dir} merge --no-edit ${`refs/remotes/pr/${pr}`}`.nothrow().quiet()
    if (merged.exitCode !== 0) return [`和当前 main 合并有冲突，要在最新的 main 上重做`]
    files = (await $`git -C ${dir} diff --name-only --no-renames origin/main HEAD`.quiet().text()).split("\n").filter(Boolean)
    const providers = [...new Set(files.map((f) => f.match(/^providers\/([^/]+)\.toml$/)?.[1]).filter(Boolean))] as string[]
    provider = providers.length === 1 ? providers[0] : undefined
    if (!provider) return [`PR 应该只改一家的 providers/<id>.toml，实际是：${providers.join("、") || "没有"}`]
    // 快照只允许新增（workflow 给新加的来源抓的），已有快照只有抓取 bot 的快照 PR 能改
    const added = new Set((await $`git -C ${dir} diff --name-only --no-renames --diff-filter=A origin/main HEAD`.quiet().text()).split("\n"))
    const outside = files.filter((f) => !(f === `providers/${provider}.toml` || f.startsWith(`changes/${provider}/`) || (/^snapshots\/[0-9a-f]{16}\.md$/.test(f) && added.has(f))))
    if (outside.length) {
      provider = undefined
      return [`改了不该改的文件：${outside.join("、")}`]
    }
    await $`bun install --frozen-lockfile`.cwd(dir).quiet()
    const out: string[] = []
    for (const [name, cmd] of [
      ["validate", ["run", "validate"]],
      ["check:quotes", ["run", "check:quotes", provider, "--strict"]],
      ["check:change-record", ["run", "check:change-record", provider, "origin/main", ...(correction ? ["--correction"] : [])]],
    ] as const) {
      const r = await $`bun ${cmd}`.cwd(dir).nothrow().quiet()
      if (r.exitCode !== 0) out.push("```\n" + log(name, r) + "\n```")
    }
    return out
  } finally {
    await $`git worktree remove --force ${dir}`.nothrow().quiet()
  }
}

// agent 声明结论变化是我们的改正（补证据、换来源、改正旧判断），不进时间线；reviewer 核实这个说法
const correction = (info.body ?? "").includes("非厂商变化")
const test = await testCheck()
if (test !== "pass") problems.push(`PR 上的校验（test）没有通过：${test}`)
problems.push(...(await gate()))
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
      `- 只改了 \`providers/${provider}.toml\`${files.some((f) => f.startsWith("changes/")) ? `、\`changes/${provider}/\`` : ""}${files.some((f) => f.startsWith("snapshots/")) ? " 和新来源的快照" : ""}`,
      "- PR 校验（test）通过",
      `- 合进当前 main 后 validate、check:quotes --strict、check:change-record 通过${correction ? "（PR 声明结论变化是我们的改正，非厂商变化，不进时间线）" : ""}`,
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
// 后几轮换更强的模型：默认模型两次都没改对，再用它多半还是一样
const strong = rounds + 1 >= STRONG_FROM
await comment(
  `**打回**（第 ${rounds + 1}/${MAX_ROUNDS} 轮${strong ? `，换用 \`${STRONG_MODEL}\`` : ""}），issue-fixer 会按下面的问题在最新的 main 上重做：\n\n${problems.map((p) => `- ${p}`).join("\n")}`,
)
const model = strong ? ["-f", `client_payload[model]=${STRONG_MODEL}`] : []
if (!dryRun) await $`gh api ${`repos/${repo}/dispatches`} --method POST -f event_type=policy-review -f ${`client_payload[provider]=${provider}`} -F ${`client_payload[issue_number]=${issue}`} ${model}`.quiet()
console.log(`#${pr} 打回，重新派发 issue #${issue}`)
