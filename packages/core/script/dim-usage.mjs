// Project-local metering. Never use account balance deltas: the account is shared.
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const number = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined
const sum = (rows, key) => rows.reduce((n, r) => n + (r[key] ?? 0), 0)
export const day = (at) => new Date(new Date(at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"))
const save = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n")
}

// Persist only an allowlist of price/rate fields. No tokens, account details or model prompts.
export function modelPrice(row) {
  const cost = row.dim?.cost ?? row.dim?.raw?.pricing ?? row.dim?.pricing
  return {
    model: row.id,
    prices: Object.fromEntries(["input", "output", "cache_read", "cache_write"].flatMap((key) =>
      number(cost?.[key]) === undefined ? [] : [[key, cost[key]]])),
    rate: number(row.rate), baseRate: number(row.base_rate),
    windows: (Array.isArray(row.rate_windows) ? row.rate_windows : []).map((w) => ({
      start: w.start, end: w.end, rate: number(w.rate),
    })),
  }
}

// Window rules match the relay: Asia/Shanghai, [start,end), including overnight windows.
export function rateAt(price, at) {
  if (!price) return undefined
  const minute = new Date(new Date(at).getTime() + 8 * 3600_000)
  const now = minute.getUTCHours() * 60 + minute.getUTCMinutes()
  const clock = (s) => {
    if (typeof s !== "string" || !/^\d{2}:\d{2}$/.test(s)) return undefined
    const [h, m] = s.split(":").map(Number)
    return h <= 24 && m < 60 && (h < 24 || m === 0) ? h * 60 + m : undefined
  }
  if (price.windows.length) {
    for (const w of price.windows) {
      const start = clock(w.start), end = clock(w.end)
      if (start === undefined || end === undefined || start === end || number(w.rate) === undefined) return undefined
      if (start < end ? now >= start && now < end : now >= start || now < end) return w.rate
    }
    return number(price.baseRate) // Never fall back to a potentially stale instantaneous rate.
  }
  return number(price.baseRate) ?? number(price.rate)
}

export function estimateCredits(call, snapshot) {
  const price = snapshot?.models?.find((p) => p.model === call.model)
  const rate = rateAt(price, call.startedAt)
  const scale = number(snapshot?.unitsPerCredit)
  if (rate === undefined || !scale || call.aggregate) return null
  if (rate === 0) return 0
  const p = price.prices
  if (number(p.input) === undefined || number(p.output) === undefined ||
      (call.cacheReadTokens > 0 && number(p.cache_read) === undefined) ||
      (call.cacheWriteTokens > 0 && number(p.cache_write) === undefined) ||
      call.cacheReadTokens + call.cacheWriteTokens > call.promptTokens) return null
  // USD / 1M tokens -> internal units (1M / USD) -> Credits. Reasoning is already in output.
  return (Math.max(0, call.promptTokens - call.cacheReadTokens - call.cacheWriteTokens) * p.input +
    call.completionTokens * p.output + call.cacheReadTokens * (p.cache_read ?? 0) +
    call.cacheWriteTokens * (p.cache_write ?? 0)) * rate / scale
}

export function parseEvents(text, model) {
  const calls = [], seen = new Set(), starts = new Map(), runs = new Map()
  let malformed = 0
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    let e
    try { e = JSON.parse(line) } catch { malformed++; continue }
    const p = e.payload ?? {}, key = `${e.runId}:${p.messageId}`
    if (e.eventType === "run:started" || e.eventType === "run:accepted") {
      runs.set(e.runId, { startedAt: e.createdAt, status: "incomplete" })
    }
    if (e.eventType === "message:started") starts.set(key, e.createdAt)
    if (e.eventType === "run:ended") {
      runs.set(e.runId, { ...runs.get(e.runId), status: p.status, usage: p.usage, endedAt: e.createdAt })
    }
    if (e.eventType !== "message:ended" || !p.usage || seen.has(key)) continue
    const u = p.usage
    if (number(u.promptTokens) === undefined || number(u.completionTokens) === undefined) { malformed++; continue }
    if (u.cacheReadTokens !== undefined && number(u.cacheReadTokens) === undefined ||
        u.cacheWriteTokens !== undefined && number(u.cacheWriteTokens) === undefined) { malformed++; continue }
    seen.add(key)
    calls.push({ runId: e.runId, messageId: p.messageId, model,
      startedAt: starts.get(key) ?? runs.get(e.runId)?.startedAt ?? e.createdAt, endedAt: e.createdAt,
      promptTokens: u.promptTokens, completionTokens: u.completionTokens,
      cacheReadTokens: u.cacheReadTokens ?? 0, cacheWriteTokens: u.cacheWriteTokens ?? 0,
    })
  }
  // Reconcile terminal totals: compaction or a truncated stream can omit per-call usage.
  // Preserve only the residual, without inventing its model-call count or per-call price.
  for (const [runId, r] of runs) {
    if (!r.usage) continue
    const u = r.usage
    if (number(u.promptTokens) === undefined || number(u.completionTokens) === undefined) continue
    const observed = calls.filter((c) => c.runId === runId)
    const residual = {
      promptTokens: Math.max(0, u.promptTokens - sum(observed, "promptTokens")),
      completionTokens: Math.max(0, u.completionTokens - sum(observed, "completionTokens")),
      cacheReadTokens: Math.max(0, (u.cacheReadTokens ?? 0) - sum(observed, "cacheReadTokens")),
      cacheWriteTokens: Math.max(0, (u.cacheWriteTokens ?? 0) - sum(observed, "cacheWriteTokens")),
    }
    if (residual.promptTokens + residual.completionTokens === 0) continue
    calls.push({ runId, model, aggregate: true, startedAt: r.startedAt ?? r.endedAt, endedAt: r.endedAt,
      ...residual })
  }
  const statuses = [...runs.values()].map((r) => r.status)
  return { calls, malformed, status: statuses.includes("incomplete") || malformed || calls.some((c) => c.aggregate) ? "incomplete" :
    statuses.includes("failed") ? "failed" : statuses.length ? statuses.join(",") : "no_events" }
}

async function get(url, headers = {}) {
  const r = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`) // Never log response bodies or credentials.
  return r.json()
}

export async function snapshotPrices(file, authFile = path.join(os.homedir(), ".dimcode/v2/auth.json")) {
  const output = { schemaVersion: 1, fetchedAt: new Date().toISOString(), source: "dim-model-catalog", models: [], errors: [] }
  try {
    const auth = (await read(authFile)).nextApiOauth
    if (!auth?.access || !auth?.issuer || !auth?.relayBaseUrl) throw new Error("Missing OAuth configuration")
    const headers = { Authorization: `Bearer ${auth.access}`, "User-Agent": "DimAgent/0.5.11", "X-Title": "DimCode" }
    const results = await Promise.allSettled([
      get(`${auth.relayBaseUrl.replace(/\/$/, "")}/models?type=dim`, headers),
      get(`${auth.issuer.replace(/\/$/, "")}/api/status`),
    ])
    if (results[0].status === "fulfilled" && Array.isArray(results[0].value.data)) {
      output.models = results[0].value.data.map(modelPrice)
    } else output.errors.push("model_catalog_unavailable")
    const config = results[1].status === "fulfilled" ? results[1].value.data?.credits_display : undefined
    if (config?.enabled === true && number(config.units_per_credit) > 0) output.unitsPerCredit = config.units_per_credit
    else output.errors.push("credits_conversion_unavailable")
  } catch { output.errors.push("pricing_snapshot_unavailable") }
  await save(file, output)
  if (output.errors.length) console.log(`::warning::Dim 用量仍会记录；价格快照不完整：${output.errors.join(", ")}`)
  return output
}

export async function recordUsage(eventsFile, pricingFile, directory, env = process.env) {
  let text = "", pricing
  try { text = await fs.readFile(eventsFile, "utf8") } catch (e) { if (e.code !== "ENOENT") throw e }
  try { pricing = await read(pricingFile) } catch { /* Tokens can be recorded without a price. */ }
  const parsed = parseEvents(text, env.DIMCODE_MODEL ?? "unknown")
  const calls = parsed.calls.map((c) => ({ ...c, estimatedCredits: estimateCredits(c, pricing) }))
  const id = `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}-${env.GITHUB_JOB}`
  const record = { schemaVersion: 1, project: "zdr-monitor", id,
    workflow: env.GITHUB_WORKFLOW, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    job: env.GITHUB_JOB, subject: env.DIM_USAGE_SUBJECT ?? "", recordedAt: new Date().toISOString(),
    runUrl: `https://github.com/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
    status: parsed.status, malformedLines: parsed.malformed, calls, pricing,
  }
  await save(path.join(directory, `${id}.json`), record)
  const tokens = sum(calls, "promptTokens") + sum(calls, "completionTokens")
  const unknown = calls.filter((c) => c.estimatedCredits === null).length
  const credits = unknown || parsed.status === "no_events" ? "未知" : sum(calls, "estimatedCredits").toFixed(2)
  const summary = `\n### zdr-monitor · Dim 用量\n\n- 状态：${parsed.status}；已记录 ${calls.length} 条用量、${tokens.toLocaleString("en-US")} tokens\n- Credits（估算）：${credits}；缺价记录：${unknown}\n- 仅本任务调用，不含账号其他使用。估算基于模型目录价格及套餐倍率，不是实际扣账；中断时可能漏掉未返回 usage 的请求。\n`
  if (env.GITHUB_STEP_SUMMARY) await fs.appendFile(env.GITHUB_STEP_SUMMARY, summary)
  console.log(summary)
  return record
}

export function aggregate(records, since, until) {
  const daily = new Map(), seen = new Set()
  for (const record of records) {
    if (record.project !== "zdr-monitor" || seen.has(record.id)) continue
    seen.add(record.id) // Re-downloaded artifacts do not double count; rerun attempts have different IDs.
    for (const call of record.calls) {
      const date = day(call.startedAt)
      if (date < since || date > until) continue
      const row = daily.get(date) ?? { date, tasks: new Set(), records: 0, promptTokens: 0, completionTokens: 0,
        cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCredits: 0, unpriced: 0, incompleteTasks: new Set() }
      row.tasks.add(record.id)
      if (record.status === "incomplete" || call.aggregate) row.incompleteTasks.add(record.id)
      row.records++
      for (const key of ["promptTokens", "completionTokens", "cacheReadTokens", "cacheWriteTokens"]) row[key] += call[key]
      if (call.estimatedCredits === null) row.unpriced++
      else row.estimatedCredits += call.estimatedCredits
      daily.set(date, row)
    }
  }
  return [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r,
    tasks: r.tasks.size, incompleteTasks: r.incompleteTasks.size,
    totalTokens: r.promptTokens + r.completionTokens,
    estimatedCredits: r.unpriced ? null : r.estimatedCredits,
  }))
}

export function renderReport(rows, since, until, gaps = 0) {
  const body = [`# zdr-monitor · Dim 每日用量`, "", `北京时间 ${since}～${until}；只统计已安装计量的 CI 任务。`, "",
    "Credits 为模型目录价格 × 套餐倍率的估算，可能与实际扣费不同；没有使用共享账号余额差。",
    "按每次模型调用开始的日期归属；重跑分别计费。中断可能漏掉未返回 usage 的请求，未计量的历史任务无法补齐。", "",
    "| 日期 | 任务/重跑 | 用量记录 | Tokens | 缓存读取 Tokens | Credits（估算） | 不完整任务 |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map((r) => `| ${r.date}${r.date === day(new Date()) ? "（未结束）" : ""} | ${r.tasks} | ${r.records} | ${r.totalTokens.toLocaleString("en-US")} | ${r.cacheReadTokens.toLocaleString("en-US")} | ${r.estimatedCredits === null ? "未知（缺价）" : r.estimatedCredits.toFixed(2)} | ${r.incompleteTasks} |`),
    "", "没有记录的日期不代表消耗为零。JSON 保留每次调用及价格快照；原始 prompts、模型输出、工具参数和登录凭证不会进入用量 artifact。",
    `无法读取的用量 artifacts：${gaps}。无事件的任务单独保留在 records.json 中，不视作已确认零消耗。`, ""]
  return body.join("\n")
}

async function report(directory, days) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("days must be 1..90")
  const until = day(new Date()), since = day(new Date(Date.now() - (days - 1) * 86400_000))
  const cutoff = Date.parse(`${since}T00:00:00+08:00`)
  const repo = process.env.GITHUB_REPOSITORY
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("Missing repository")
  const gh = (args, options = {}) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, ...options })
  const artifacts = []
  for (let page = 1; ; page++) {
    const body = JSON.parse(gh(["api", `repos/${repo}/actions/artifacts?per_page=100&page=${page}`]))
    const batch = body.artifacts ?? []
    artifacts.push(...batch.filter((a) => !a.expired && a.name.startsWith("dim-usage-record-") && Date.parse(a.created_at) >= cutoff))
    if (batch.length < 100 || batch.every((a) => Date.parse(a.created_at) < cutoff)) break
  }
  await fs.mkdir(directory, { recursive: true })
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zdr-usage-")), records = []
  let gaps = 0
  try {
    for (const artifact of artifacts) {
      const target = path.join(temp, String(artifact.id))
      try {
        gh(["run", "download", String(artifact.workflow_run.id), "--repo", repo, "--name", artifact.name, "--dir", target], { stdio: ["ignore", "pipe", "pipe"] })
        for (const file of await fs.readdir(target)) if (file.endsWith(".json")) records.push(await read(path.join(target, file)))
      } catch { gaps++; console.log(`::warning::无法读取用量 artifact ${artifact.id}`) }
    }
  } finally { await fs.rm(temp, { recursive: true, force: true }) }
  const daily = aggregate(records, since, until)
  const markdown = renderReport(daily, since, until, gaps)
  await save(path.join(directory, "records.json"), records)
  await save(path.join(directory, "daily.json"), { since, until, timezone: "Asia/Shanghai", gaps, daily })
  await fs.writeFile(path.join(directory, "daily.md"), markdown)
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
  console.log(markdown)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === "snapshot") await snapshotPrices(args[0])
  else if (command === "record") await recordUsage(...args)
  else if (command === "report") await report(args[0], Number(args[1] ?? 7))
  else throw new Error("Usage: dim-usage.mjs snapshot <file> | record <events> <pricing> <dir> | report <dir> [days]")
}
