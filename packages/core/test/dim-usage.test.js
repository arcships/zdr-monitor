import { expect, test } from "bun:test"
import { aggregate, day, estimateCredits, modelPrice, parseEvents, rateAt, recordUsage, renderReport } from "../script/dim-usage.mjs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const at = "2026-10-08T15:59:50Z"
const usage = { promptTokens: 1_000_000, completionTokens: 100_000, cacheReadTokens: 900_000 }
const event = (eventType, payload, createdAt = at) => JSON.stringify({ eventType, payload, runId: "r1", createdAt })
const stream = (status = "completed") => [
  event("run:accepted", {}), event("message:started", { messageId: "m1" }),
  event("message:ended", { messageId: "m1", usage }, "2026-10-08T16:00:10Z"),
  event("run:ended", { status, usage }),
].join("\n")
const price = modelPrice({ id: "m", rate: 2, dim: { cost: { input: 0.14, output: 0.28, cache_read: 0.0028 } } })
const snapshot = { unitsPerCredit: 1000, models: [price] }
const call = { model: "m", startedAt: at, ...usage, cacheWriteTokens: 0 }

test("one model call counts once even with duplicate end events and cumulative run totals", () => {
  const parsed = parseEvents(stream() + "\n" + event("message:ended", { messageId: "m1", usage }), "m")
  expect(parsed.calls).toHaveLength(1)
  expect(parsed.calls[0].promptTokens).toBe(1_000_000)
  expect(parsed.status).toBe("completed")
})

test("failed and interrupted runs retain completed calls; truncated JSON is marked incomplete", () => {
  expect(parseEvents(stream("failed"), "m").calls).toHaveLength(1)
  const partial = parseEvents(stream().split("\n").slice(0, -1).join("\n") + '\n{"eventType":', "m")
  expect(partial.status).toBe("incomplete")
  expect(partial.malformed).toBe(1)
  expect(partial.calls).toHaveLength(1)
  expect(parseEvents("", "m").status).toBe("no_events")
})

test("terminal-only usage is retained without inventing a per-call price", () => {
  const parsed = parseEvents(event("run:ended", { status: "failed", usage }), "m")
  expect(parsed.calls[0].aggregate).toBe(true)
  expect(estimateCredits(parsed.calls[0], snapshot)).toBeNull()
})

test("usage missing from individual messages is reconciled against the terminal total", () => {
  const parsed = parseEvents(stream().split("\n").slice(0, -1).join("\n") + "\n" + event("run:ended", {
    status: "completed", usage: { ...usage, promptTokens: 1_000_100, completionTokens: 100_020 },
  }), "m")
  expect(parsed.status).toBe("incomplete")
  expect(parsed.calls).toHaveLength(2)
  expect(parsed.calls[1]).toMatchObject({ promptTokens: 100, completionTokens: 20, aggregate: true })
})

test("cache hits are subtracted from input and charged at cache price; reasoning is not added again", () => {
  expect(estimateCredits(call, snapshot)).toBeCloseTo(89.04, 8)
  expect(estimateCredits({ ...call, cacheReadTokens: 0 }, snapshot)).toBeCloseTo(336, 8)
})

test("missing cache prices, rates, conversion and inconsistent usage are unknown, not free", () => {
  expect(estimateCredits(call, { ...snapshot, models: [{ ...price, prices: { input: 0.14, output: 0.28 } }] })).toBeNull()
  expect(estimateCredits(call, { ...snapshot, unitsPerCredit: undefined })).toBeNull()
  expect(estimateCredits(call, { ...snapshot, models: [{ ...price, rate: undefined }] })).toBeNull()
  expect(estimateCredits({ ...call, cacheReadTokens: 1_000_001 }, snapshot)).toBeNull()
  expect(estimateCredits(call, { ...snapshot, models: [{ ...price, rate: 0 }] })).toBe(0)
})

test("rate windows use Shanghai request-start time and base rate outside the window", () => {
  const p = { ...price, rate: 99, baseRate: 2, windows: [{ start: "20:00", end: "06:00", rate: 0.5 }] }
  expect(rateAt(p, "2026-10-08T12:00:00Z")).toBe(0.5)
  expect(rateAt(p, "2026-10-08T21:59:59Z")).toBe(0.5)
  expect(rateAt(p, "2026-10-08T22:00:00Z")).toBe(2)
  expect(rateAt({ ...p, baseRate: undefined }, "2026-10-08T22:00:00Z")).toBeUndefined()
})

test("daily grouping respects Beijing midnight; duplicate artifacts dedupe, reruns stay separate", () => {
  const c = { ...call, estimatedCredits: 89.04 }
  const record = { id: "1-1-fix", project: "zdr-monitor", status: "completed", calls: [c] }
  const rerun = { ...record, id: "1-2-fix", calls: [{ ...c, startedAt: "2026-10-08T16:00:00Z" }] }
  const rows = aggregate([record, record, rerun, { ...record, project: "other", id: "other" }], "2026-10-08", "2026-10-09")
  expect(day(at)).toBe("2026-10-08")
  expect(rows.map((r) => [r.date, r.tasks, r.records, r.estimatedCredits])).toEqual([
    ["2026-10-08", 1, 1, 89.04], ["2026-10-09", 1, 1, 89.04],
  ])
})

test("one unpriced call makes that day's total unknown; reports disclose missing historical coverage", () => {
  const rows = aggregate([{ id: "x", project: "zdr-monitor", status: "incomplete", calls: [
    { ...call, estimatedCredits: 1 }, { ...call, estimatedCredits: null },
  ] }], "2026-10-08", "2026-10-09")
  expect(rows[0].estimatedCredits).toBeNull()
  expect(rows[0].incompleteTasks).toBe(1)
  const report = renderReport(rows, "2026-10-08", "2026-10-09", 1)
  expect(report).toContain("未知（缺价）")
  expect(report).toContain("没有记录的日期不代表消耗为零")
  expect(report).toContain("artifacts：1")
})

test("saved metering never contains prompts, tool arguments, output or auth secrets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zdr-meter-test-"))
  try {
    const events = path.join(dir, "events.jsonl"), pricingFile = path.join(dir, "price.json")
    await fs.writeFile(events, stream() + "\n" + event("text:delta", { delta: "PRIVATE_PROMPT" }))
    await fs.writeFile(pricingFile, JSON.stringify(snapshot))
    const output = path.join(dir, "records")
    const r = await recordUsage(events, pricingFile, output, { GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "2",
      GITHUB_JOB: "fix", GITHUB_REPOSITORY: "arcships/zdr-monitor", DIMCODE_MODEL: "m", SECRET: "PRIVATE_AUTH" })
    const saved = await fs.readFile(path.join(output, "1-2-fix.json"), "utf8")
    expect(saved).not.toContain("PRIVATE_PROMPT")
    expect(saved).not.toContain("PRIVATE_AUTH")
    expect(r.calls).toHaveLength(1)
    expect(r.attempt).toBe("2")
    const missing = await recordUsage(path.join(dir, "absent"), pricingFile, path.join(dir, "missing"), {})
    expect(missing.status).toBe("no_events")
  } finally { await fs.rm(dir, { recursive: true, force: true }) }
})
