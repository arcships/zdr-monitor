#!/usr/bin/env bun
/** 一次性校准：每个来源用三种方式各抓一次，看哪种能拿到引文所在的正文。
 *
 *  输出 .sync/calibrate.json 和一张汇总表，用来决定每个 [[source]] 的 fetch 值。
 *  jina 免费额度每分钟 20 次，所以只对前两种方式都没拿全引文的来源试 jina。
 *
 *    bun run calibrate [<url 片段>...] [--methods=direct,browser,jina] [--out=.sync/x.json]
 *
 *  分批跑时结果按来源合并进已有的 .sync/calibrate.json，同一方式的旧结果被替换。 */
import fs from "node:fs"
import path from "node:path"
import { loadAll } from "../src/registry"
import { closeBrowser, fetchWith, type Method } from "../src/snapshot/fetch"
import { toText, unusable, type Extractor } from "../src/snapshot/extract"
import { fold, occurrences } from "../src/snapshot/quote"

const root = path.join(import.meta.dirname, "..", "..", "..")
const args = process.argv.slice(2)
const only = args.filter((a) => !a.startsWith("--"))
const methods = (args.find((a) => a.startsWith("--methods="))?.slice(10).split(",") ?? ["direct", "browser", "jina"]) as Method[]
const reportFile = path.resolve(root, args.find((a) => a.startsWith("--out="))?.slice(6) ?? ".sync/calibrate.json")

const quotes = new Map<string, string[]>()
const urls = new Map<string, string>()
for (const p of loadAll(root)) {
  for (const s of p.sources) urls.set(s.id, s.url)
  for (const a of p.anchors) (quotes.get(a.source_id) ?? quotes.set(a.source_id, []).get(a.source_id)!).push(a.selector.exact)
}
const queue = [...urls].filter(([, url]) => !only.length || only.some((o) => url.includes(o)))

interface Trial {
  method: Method
  status: number
  kind?: string
  error?: string
  /** 每种抽取方式的结果：正文长度、命中几条引文、是否可用 */
  extract: Partial<Record<Extractor, { chars: number; hits: number; unusable: string | null }>>
}
const results = new Map<string, { id: string; url: string; quotes: number; trials: Trial[] }>()
const previous = new Map<string, { trials: Trial[] }>(
  fs.existsSync(reportFile) ? (JSON.parse(fs.readFileSync(reportFile, "utf8")) as any[]).map((r) => [r.id, r]) : [],
)
for (const [id, url] of urls)
  results.set(id, {
    id,
    url,
    quotes: quotes.get(id)?.length ?? 0,
    trials: (previous.get(id)?.trials ?? []).filter((t) => !queue.some(([q]) => q === id) || !methods.includes(t.method)),
  })

async function trial(method: Method, id: string, url: string): Promise<Trial> {
  const raw = await fetchWith(method, url)
  const trial: Trial = { method, status: raw.status, kind: raw.kind, error: raw.error, extract: {} }
  if (!raw.ok) return trial
  for (const extractor of raw.kind === "html" ? (["body", "main", "readability"] as const) : (["body"] as const)) {
    try {
      const text = await toText(raw.kind, raw.body, extractor)
      const folded = fold(text)
      trial.extract[extractor] = {
        chars: folded.length,
        hits: (quotes.get(id) ?? []).filter((q) => occurrences(folded, q) > 0).length,
        unusable: unusable(text),
      }
    } catch (e: any) {
      trial.error = String(e?.message || e)
    }
  }
  return trial
}

const best = (r: { trials: Trial[] }) =>
  Math.max(-1, ...r.trials.flatMap((t) => Object.values(t.extract).filter((e) => !e!.unusable).map((e) => e!.hits)))

async function pool(items: [string, string][], concurrency: number, method: Method, gapMs = 0) {
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const [id, url] = items[next++]!
        results.get(id)!.trials.push(await trial(method, id, url))
        if (++done % 50 === 0) console.error(`  ${method} ${done}/${items.length}`)
        if (gapMs) await new Promise((r) => setTimeout(r, gapMs))
      }
    }),
  )
}

if (methods.includes("direct")) {
  console.error(`direct ${queue.length}`)
  await pool(queue, 8, "direct")
}
if (methods.includes("browser")) {
  console.error(`browser ${queue.length}`)
  await pool(queue, 4, "browser")
  await closeBrowser()
}
if (methods.includes("jina")) {
  const rest = queue.filter(([id]) => {
    const r = results.get(id)!
    return best(r) < 0 || best(r) < r.quotes
  })
  console.error(`jina ${rest.length}`)
  await pool(rest, 1, "jina", 3200)
}

const report = [...results.values()].sort((a, b) => a.url.localeCompare(b.url))
fs.mkdirSync(path.join(root, ".sync"), { recursive: true })
fs.writeFileSync(reportFile, JSON.stringify(report, null, 1))
console.log(`已写 ${path.relative(root, reportFile)}(${report.length} 个来源)`)
