#!/usr/bin/env bun
/** 用历史上的快照 PR 回放 diff 判断规则，对照 agent 当时的结论。
 *
 *  每个合并过的快照 PR 都有一个 [policy-review] issue：agent 关掉它（无实质变化）、开了 PR
 *  （有变化）或打了 blocked（抓错了页面）。这就是一批带标注的真实案例。改 relevance.ts 或
 *  judge() 之后跑一遍，看无实质变化的有多少不再触发、有变化的是否仍然触发。
 *
 *    bun run snapshot:replay [--since 2026-09-24]    需要 GH_TOKEN 或 gh 已登录
 *    bun run snapshot:replay --jev [--limit 100]     由 Jev 判断（需要 JEV_API_KEY），校准阈值用。一个 PR 约一次调用。
 *                                                    引文失效但全部能自动改绑的算 cosmetic：不会派 agent */
import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { judge, watches } from "../src/snapshot"
import { judgeBatch } from "../src/snapshot/jev"
import { ask, type Ask } from "../src/jev"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)
const since = args[args.indexOf("--since") + 1] ?? "2026-09-24"
$.cwd(root)

const json = async (cmd: ReturnType<typeof $>) => JSON.parse(await cmd.quiet().text())
const snaps = ((await json($`gh pr list --state merged --limit 1000 --search ${`snapshot: in:title merged:>=${since}`} --json number,title,mergeCommit`)) as any[]).filter((p) =>
  p.title.startsWith("snapshot: "),
)
const issues = (await json($`gh issue list --state all --label policy-review --limit 1000 --json number,title,state,labels`)) as any[]
const agentPrs = new Set(((await json($`gh pr list --state all --limit 1000 --search head:dim/ --json headRefName`)) as any[]).map((p) => p.headRefName))
await $`git fetch --no-tags origin ${snaps.map((p) => p.mergeCommit.oid)}`.nothrow().quiet()

const git = (...a: string[]) => spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
const show = (rev: string, f: string) => {
  const r = git("show", `${rev}:${f}`)
  return r.status === 0 ? r.stdout.replace(/^<!--.*?-->\n/, "") : null
}
const rank: Record<string, number> = { failed: 3, changed: 2, created: 2, cosmetic: 1, same: 0 }
const useJev = args.includes("--jev")
const limit = Number(args[args.indexOf("--limit") + 1]) || Infinity
let calls = 0
const dump: unknown[] = []
let tokens = 0
const counted: Ask = async (state, questions) => {
  calls++
  const r = await ask(state, questions)
  tokens += r.usage?.input_tokens ?? 0
  return r
}
const rows: { pr: number; provider: string; expected: string; got: string; why: string }[] = []
// 只回放有结论（agent 判过）的 PR，最近的优先；--limit 控制 Jev 调用量（大约一个 PR 一次）
for (const pr of snaps.filter((p) => issues.some((i) => i.title.endsWith(`snapshot #${p.number}`))).slice(0, limit)) {
  const provider = pr.title.slice("snapshot: ".length)
  const issue = issues.find((i) => i.title.endsWith(`snapshot #${pr.number}`))
  const expected = !issue
    ? "?"
    : issue.labels.some((l: any) => l.name === "blocked")
      ? "failed"
      : agentPrs.has(`dim/issue-${issue.number}`)
        ? "changed"
        : issue.state === "CLOSED"
          ? "no-change"
          : "?"
  const head = pr.mergeCommit.oid
  const w = watches(root, provider)
  const items = git("diff", "--name-only", `${head}^`, head, "--", "snapshots")
    .stdout.split("\n")
    .filter(Boolean)
    .flatMap((f) => {
      const after = show(head, f)
      if (after === null) return []
      const previous = show(`${head}^`, f)
      const watch = w.get(path.basename(f, ".md")) ?? { anchors: [], searched: false }
      const url = git("show", `${head}:${f}`).stdout.match(/^<!-- (.*?) -->/)?.[1] ?? f
      return [{ url, previous, text: after, watch, verdict: judge(previous, after, watch) }]
    })
  // 跟抓取时一样：一个快照 PR 里所有页面一起问 Jev，通常一次调用
  const judged = useJev ? await judgeBatch(items, counted) : []
  // 每个页面 Jev 给的原始概率留档：调阈值时离线重算，不用再花一次调用
  if (useJev) dump.push({ pr: pr.number, provider, expected, pages: judged.map((j, i) => ({ url: items[i]!.url, jev: j.jev })) })
  const verdicts = useJev
    ? judged.map(({ verdict, jev }) =>
        verdict.outcome === "changed" && jev && !jev.error && !jev.policy && !jev.unresolved ? { outcome: "cosmetic" as const, reasons: verdict.reasons } : verdict,
      )
    : items.map((x) => x.verdict)
  let got = { outcome: "same", why: "" }
  for (const v of verdicts) {
    const why = v.outcome === "failed" ? v.error : (v.reasons[0] ?? "")
    if (rank[v.outcome]! > rank[got.outcome]!) got = { outcome: v.outcome, why }
  }
  rows.push({ pr: pr.number, provider, expected, got: got.outcome, why: got.why.slice(0, 120) })
}
const ok = (r: (typeof rows)[number]) =>
  r.expected === "no-change"
    ? !["changed", "created"].includes(r.got)
    : r.expected === "changed"
      ? ["changed", "created"].includes(r.got)
      : r.expected === "failed"
        ? r.got === "failed"
        : true
for (const r of rows.sort((a, b) => a.pr - b.pr))
  console.log(`${ok(r) ? "  " : "✗ "}#${r.pr} ${r.provider.padEnd(26)} agent: ${r.expected.padEnd(9)} ${useJev ? "Jev" : "规则"}: ${r.got.padEnd(8)} ${r.why}`)
const count = (e: string) => `${rows.filter((r) => r.expected === e && ok(r)).length}/${rows.filter((r) => r.expected === e).length}`
console.log(`\n无实质变化不再触发 ${count("no-change")} · 有变化仍触发 ${count("changed")} · 抓错页面判失败 ${count("failed")}`)
if (useJev) console.log(`Jev 调用 ${calls} 次，计费输入 ${tokens} tokens`)
if (useJev) {
  fs.mkdirSync(path.join(root, ".sync"), { recursive: true })
  fs.writeFileSync(path.join(root, ".sync", "jev-replay.json"), JSON.stringify(dump, null, 2))
}
