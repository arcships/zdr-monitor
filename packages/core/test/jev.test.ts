import { expect, test } from "bun:test"
import type { Ask, JevResult } from "../src/jev"
import { judge, judgeWithJev } from "../src/snapshot"
import { judgeBatch } from "../src/snapshot/jev"
import { rebindAnchor } from "../src/snapshot/rebind"
import { parse } from "../src/toml"

const page = (...lines: string[]) =>
  ["# Data controls", "Some unrelated paragraph that stays exactly the same across both versions.", ...lines].join("\n")

/** 假的 Jev：页面题按 policy 给「none」以外的概率，引文题选 choice */
const fake = (policy: number, choice = "none", p = 0.95, seen: any[] = []): Ask => async (state, questions) => {
  seen.push({ state, questions })
  const answers: JevResult["answers"] = {}
  for (const id of Object.keys(questions))
    answers[id] = id.startsWith("p")
      ? { type: "choice", choice: policy >= 0.5 ? "retention" : "none", confidence: 1, probabilities: { retention: policy, none: 1 - policy } }
      : { type: "choice", choice, confidence: p, probabilities: { [choice]: p } }
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
  expect(seen[0].state.pages.p0.added.join("\n")).toContain("export or delete your data")
  expect(seen[0].state.pages.p0.tracked_quotes).toEqual([watch.anchors[0]!.exact])
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

test("一批页面和失效引文只发一次请求", async () => {
  const seen: any[] = []
  const items = [
    { url: "a", previous: before, text: after, watch, verdict: judge(before, after, watch) },
    { url: "b", previous: b2, text: a2, watch: quoted, verdict: judge(b2, a2, quoted) },
    { url: "c", previous: before, text: before, watch, verdict: judge(before, before, watch) },
  ]
  const out = await judgeBatch(items, fake(0.05, "candidate_1", 0.95, seen))
  expect(seen.length).toBe(1)
  expect(Object.keys(seen[0].questions).sort()).toEqual(["p0", "p1", "q1_0"])
  expect(out.map((o) => o.verdict.outcome)).toEqual(["cosmetic", "changed", "same"])
  expect(out[1]!.jev!.rebinds.length).toBe(1)
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
