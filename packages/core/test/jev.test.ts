import { expect, test } from "bun:test"
import type { Ask, JevResult } from "../src/jev"
import { judge, judgeWithJev } from "../src/snapshot"
import { judgeBatch } from "../src/snapshot/jev"
import { rebindAnchor } from "../src/snapshot/rebind"
import { parse } from "../src/toml"

const page = (...lines: string[]) =>
  ["# Data controls", "Some unrelated paragraph that stays exactly the same across both versions.", ...lines].join("\n")

/** 假的 Jev：政策题和维度题都给 policy，引文候选题里 choice 指的那句给 p、其他句给 0.02 */
const fake = (policy: number, choice = "none", p = 0.95, seen: any[] = []): Ask => async (state, questions) => {
  seen.push({ state, questions })
  const answers: JevResult["answers"] = {}
  for (const id of Object.keys(questions))
    answers[id] = { type: "noul", noul: id.startsWith("q") ? (choice === `candidate_${Number(id.split("_")[1]) + 1}` ? p : 0.02) : policy }
  return { model: "jev-test", answers }
}

const before = page("To submit a data privacy request directly to Perplexity, please use this form on our website.")
const after = page(
  "To submit a data privacy request directly to Perplexity, you can make your request in one of these ways.",
  "You can export or delete your data yourself from your account settings page at any time.",
)
const watch = { anchors: [{ prefix: "", exact: "Some unrelated paragraph that stays exactly the same", suffix: "" }], searched: false }

test("Jev 五个维度都判没改承诺 → cosmetic", async () => {
  const v = judge(before, after, watch)
  expect(v.outcome).toBe("changed")
  const seen: any[] = []
  const r = await judgeWithJev(before, after, "https://example.com/privacy", watch, v, fake(0.05, "none", 0.95, seen))
  expect(r.verdict.outcome).toBe("cosmetic")
  expect(Object.keys(r.jev!.dims!)).toEqual(["training", "retention", "zdr", "processing_region", "role", "none"])
  expect(Object.keys(seen[0].questions)).toEqual(["policy", "dim_training", "dim_retention", "dim_zdr", "dim_processing_region", "dim_role"])
  expect(Object.values(seen[0].questions).every((q: any) => q.type === "noul")).toBe(true)
  expect(seen[0].state.added.join("\n")).toContain("export or delete your data")
  expect(seen[0].state.tracked_quotes).toEqual([watch.anchors[0]!.exact])
})

test("Jev 判任一维度改了承诺 → changed，即使规则没看出来", async () => {
  const b = page("Our support team answers most questions about the product within one business day.")
  const a = page("Our support team answers most questions about the product within two business days, always.")
  const r = await judgeWithJev(b, a, "u", watch, judge(b, a, watch), fake(0.8))
  expect(r.verdict.outcome).toBe("changed")
  expect(r.jev!.policy).toBe(true)
})

test("Jev 调用失败 → 按规则", async () => {
  const fail: Ask = async () => {
    throw new Error("http_500")
  }
  const r = await judgeWithJev(before, after, "u", watch, judge(before, after, watch), fail)
  expect(r.verdict.outcome).toBe("changed")
  expect(r.jev!.error).toContain("http_500")
})

const quoted = {
  anchors: [{ prefix: "", exact: "We retain API inputs and outputs for up to 30 days to monitor for abuse.", suffix: "" }],
  searched: false,
}
const b2 = page("We retain API inputs and outputs for up to 30 days to monitor for abuse.")
const a2 = page("We keep API inputs and outputs for no longer than 30 days to monitor for abuse.")

test("引文只是改写 → 自动改绑，记下新句子", async () => {
  const r = await judgeWithJev(b2, a2, "u", quoted, judge(b2, a2, quoted), fake(0.05, "candidate_1"))
  expect(r.verdict.outcome).toBe("changed")
  expect(r.jev!.rebinds.map((x) => x.exact)).toEqual(["We keep API inputs and outputs for no longer than 30 days to monitor for abuse."])
  expect(r.jev!.unresolved).toBe(0)
})

test("Jev 说没有同义句或没把握 → 留给 agent", async () => {
  for (const ask of [fake(0.05, "none"), fake(0.05, "candidate_1", 0.6)]) {
    const r = await judgeWithJev(b2, a2, "u", quoted, judge(b2, a2, quoted), ask)
    expect(r.jev!.rebinds).toEqual([])
    expect(r.jev!.unresolved).toBe(1)
  }
})

test("每个页面一个请求，state 里只有这个页面", async () => {
  const seen: any[] = []
  const items = [
    { url: "a", previous: before, text: after, watch, verdict: judge(before, after, watch) },
    { url: "b", previous: b2, text: a2, watch: quoted, verdict: judge(b2, a2, quoted) },
    { url: "c", previous: before, text: before, watch, verdict: judge(before, before, watch) },
  ]
  const out = await judgeBatch(items, fake(0.05, "candidate_1", 0.95, seen))
  expect(seen.map((s) => s.state.url).sort()).toEqual(["a", "b"])
  const b = seen.find((s) => s.state.url === "b")!
  expect(Object.keys(b.questions)).toContain("q0_0")
  expect(b.state.lost_quotes[0].candidates[0]).toContain("We keep API inputs")
  expect(out.map((o) => o.verdict.outcome)).toEqual(["cosmetic", "changed", "same"])
  expect(out[1]!.jev!.rebinds.length).toBe(1)
})

test("两个候选句都像 → 不改绑", async () => {
  const both: Ask = async (_s, questions) => ({
    model: "jev-test",
    answers: Object.fromEntries(Object.keys(questions).map((id) => [id, { type: "noul" as const, noul: id.startsWith("q") ? 0.95 : 0.05 }])),
  })
  const b3 = page("We retain API inputs and outputs for up to 30 days to monitor for abuse.")
  const a3 = page("We keep API inputs and outputs for no longer than 30 days to monitor for abuse.", "We keep API inputs and outputs for at most 30 days to monitor for abuse.")
  const r = await judgeWithJev(b3, a3, "u", quoted, judge(b3, a3, quoted), both)
  expect(r.jev!.rebinds).toEqual([])
  expect(r.jev!.unresolved).toBe(1)
})

test("rebindAnchor 只改这一条锚点的 selector", () => {
  const toml = [
    'name = "X"',
    "[[anchor]]",
    'id = "a"',
    'source_id = "0000000000000000"',
    'topics = ["retention"]',
    "[anchor.selector]",
    'prefix = "p"',
    'exact = """',
    "[link](https://x) old",
    'line"""',
    'suffix = "s"',
    "[[anchor]]",
    'id = "b"',
    'source_id = "0000000000000000"',
    'topics = ["zdr"]',
    "[anchor.selector]",
    'prefix = ""',
    'exact = "keep"',
    'suffix = ""',
    "",
  ].join("\n")
  const out = parse(rebindAnchor(toml, "a", 'new "quoted" text')) as any
  expect(out.anchor[0].selector).toEqual({ prefix: "", exact: 'new "quoted" text', suffix: "" })
  expect(out.anchor[1].selector.exact).toBe("keep")
  expect(out.name).toBe("X")
})
