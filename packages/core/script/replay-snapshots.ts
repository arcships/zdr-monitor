#!/usr/bin/env bun
/** 用历史上的快照 PR 回放 diff 判断规则，对照 agent 当时的结论。
 *
 *  每个合并过的快照 PR 都有一个 [policy-review] issue：agent 关掉它（无实质变化）、开了 PR
 *  （有变化）或打了 blocked（抓错了页面）。这就是一批带标注的真实案例。改 relevance.ts 或
 *  judge() 之后跑一遍，看无实质变化的有多少不再触发、有变化的是否仍然触发。
 *
 *    bun run snapshot:replay [--since 2026-09-24]    需要 GH_TOKEN 或 gh 已登录 */
import { $ } from "bun"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { judge, watches } from "../src/snapshot"

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
const rows = snaps.map((pr) => {
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
  let got = { outcome: "same", why: "" }
  for (const f of git("diff", "--name-only", `${head}^`, head, "--", "snapshots").stdout.split("\n").filter(Boolean)) {
    const after = show(head, f)
    if (after === null) continue
    const v = judge(show(`${head}^`, f), after, w.get(path.basename(f, ".md")) ?? { anchors: [], searched: false })
    const why = v.outcome === "failed" ? v.error : (v.reasons[0] ?? "")
    if (rank[v.outcome]! > rank[got.outcome]!) got = { outcome: v.outcome, why }
  }
  return { pr: pr.number, provider, expected, got: got.outcome, why: got.why.slice(0, 120) }
})
const ok = (r: (typeof rows)[number]) =>
  r.expected === "no-change"
    ? !["changed", "created"].includes(r.got)
    : r.expected === "changed"
      ? ["changed", "created"].includes(r.got)
      : r.expected === "failed"
        ? r.got === "failed"
        : true
for (const r of rows.sort((a, b) => a.pr - b.pr))
  console.log(`${ok(r) ? "  " : "✗ "}#${r.pr} ${r.provider.padEnd(26)} agent: ${r.expected.padEnd(9)} 规则: ${r.got.padEnd(8)} ${r.why}`)
const count = (e: string) => `${rows.filter((r) => r.expected === e && ok(r)).length}/${rows.filter((r) => r.expected === e).length}`
console.log(`\n无实质变化不再触发 ${count("no-change")} · 有变化仍触发 ${count("changed")} · 抓错页面判失败 ${count("failed")}`)
