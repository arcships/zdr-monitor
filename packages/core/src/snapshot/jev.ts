/** 用 Jev 做快照层的语义判断。关键词规则（relevance.ts）只看变了的词里有没有「retention」
 *  「region」「删除」，召回高、误报也高：推荐文章换了一条、账号删除步骤改写、条款换了国家版本、
 *  价格表调价，都会走一轮快照 PR → 复核 issue → agent。配了 JEV_API_KEY 时由 Jev 判断：
 *
 *    - 每个变了的页面一道单选题：改的是哪个维度的承诺，或者「none」（不是政策变化）。
 *      1 − P(none) 就是政策变化的概率，各维度的概率顺带给复核 issue 分流
 *    - 每条失效引文一道单选题：新正文的候选句里哪句跟它同义，或者「none」。有就自动改绑，不用派 agent
 *
 *  调用量压到最低：一个 provider 一天里所有变了的页面和失效引文放进同一个请求（state 里按 id 分开，
 *  每道题只看自己那一份），装不下才拆成几个请求。一个 provider 通常一天最多一次调用。
 *
 *  Jev 调用失败一律退回原规则（宁可多叫一次 agent，不能漏掉一次真变化）。 */
import { ask as defaultAsk, noul, STATE_CHARS, type Ask, type JevResult, type Question } from "../jev"
import { fold, locate } from "./quote"
import { changedLines, relevantChanges, type Watch } from "./relevance"

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? n : fallback
}
/** 1 − P(none) 达到它就算政策变化。偏低：漏判一次真变化的代价远大于多派一次 agent */
export const policyThreshold = () => num(process.env.JEV_POLICY_THRESHOLD, 0.3)
/** 改绑和「同一份文档」都会替掉现有证据，要很有把握 */
export const rebindThreshold = () => num(process.env.JEV_REBIND_THRESHOLD, 0.9)
export const samePageThreshold = () => num(process.env.JEV_SAME_PAGE_THRESHOLD, 0.9)

const clipAll = (lines: string[], budget: number) => {
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    if (used + line.length > budget) break
    out.push(line)
    used += line.length
  }
  return out
}

export const DIMENSIONS = {
  training: "Whether customer prompts, inputs, outputs or files are used to train or improve models.",
  retention: "How long customer prompts, inputs, outputs, files or logs are retained, or when they are deleted.",
  zdr: "Whether zero data retention is offered, its scope, eligibility or exceptions.",
  processing_region: "Where customer data is processed or stored.",
  role: "Whether the vendor acts as processor, sub-processor or controller of customer data, or who its sub-processors are.",
} as const
export type Dimensions = Record<keyof typeof DIMENSIONS, number>

const pageQuestion = (id: string): Question => ({
  type: "choice",
  instructions:
    `Look only at \`pages.${id}\`: an edit to an official vendor page about an AI/LLM service (\`removed\` = old lines, \`added\` = new lines, ` +
    "`tracked_quotes` = sentences we already cite from it). Which vendor commitment about customer data does the edit change? " +
    "A commitment counts as changed when it is added, removed, reversed, narrowed, widened, or its period, scope, region, plan, model or exception changes.",
  criteria: {
    ...DIMENSIONS,
    none:
      "No commitment changes: only navigation, menus, related-article teasers, headings, dates, prices, model or feature lists without data-handling terms, " +
      "formatting, typo fixes, links, rewording that keeps the same meaning, or account how-to steps.",
  },
})

const quoteQuestion = (id: string, candidates: number): Question => ({
  type: "choice",
  instructions:
    `Look only at \`quotes.${id}\`: \`quoted_sentence\` is a vendor commitment we cite from the old version of a page; the candidates come from the new version. ` +
    "Which candidate states the same commitment with the same meaning — same data, same plan or product scope, same period, same conditions and exceptions? " +
    "Choose none if every candidate differs in any of these, even slightly.",
  criteria: {
    ...Object.fromEntries(
      Array.from({ length: candidates }, (_, i) => [`candidate_${i + 1}`, `quotes.${id}.candidate_${i + 1} says the same thing as quoted_sentence.`]),
    ),
    none: "No candidate states the same commitment with the same meaning.",
  },
})

const tokens = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+|[一-鿿]/g) ?? [])
const sentencesOf = (text: string) =>
  text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.;!?])\s+|(?<=[。；！？])/))
    .map((s) => s.trim())
    .filter((s) => fold(s).length >= 20)

/** 新正文里跟旧引文最像的几句，作为改绑候选。只取在新正文里能唯一定位的句子 */
export function rebindCandidates(oldExact: string, after: string, limit = 3) {
  const want = tokens(oldExact)
  const folded = fold(after)
  const seen = new Set<string>()
  return sentencesOf(after)
    .map((s) => {
      const t = tokens(s)
      const shared = [...want].filter((x) => t.has(x)).length
      return { s, score: shared / Math.max(1, new Set([...want, ...t]).size) }
    })
    .filter(({ s, score }) => score >= 0.25 && !seen.has(fold(s)) && seen.add(fold(s)) && locate(folded, { exact: s }) === 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s }) => s)
}

type Selector = Watch["anchors"][number]
type Outcome = "created" | "changed" | "same" | "cosmetic"
type Verdict = { outcome: Outcome; reasons: string[] } | { outcome: "failed"; error: string }

/** Jev 的判断，跟着 Capture 进报告；rebinds 由 snapshot 脚本写回 provider 文件 */
export interface JevJudgment {
  /** 各维度被改的概率与 none 的概率。正文长句没变（只有引文所在的短行变了）时没问 */
  dims?: Dimensions & { none: number }
  policy: boolean
  /** 失效引文里 Jev 找到同义改写的：旧 selector → 新 exact */
  rebinds: { from: Selector; exact: string; p: number }[]
  /** 失效引文里找不到同义改写的，要 agent 处理 */
  unresolved: number
  error?: string
}

export interface Item {
  url: string
  previous: string | null
  text: string
  watch: Watch
  verdict: Verdict
}

/** 一批页面一起判断：配了 Jev 时由它做语义判断，关键词规则只在 Jev 不可用时兜底。
 *    - 正文变化：Jev 说改了某个维度 → changed；none → cosmetic（规则说有变化也算 cosmetic）
 *    - 引文失效：快照必须重写。Jev 找到同义改写的记下改绑，找不到的留给 agent
 *  没人关心的来源（没有引文、也不在 searched 里）不问。某个请求失败 → 那一批按规则 */
export async function judgeBatch(items: Item[], ask: Ask = defaultAsk): Promise<{ verdict: Verdict; jev?: JevJudgment }[]> {
  type Prepared = { i: number; lines: string[]; lost: Selector[]; candidates: string[][]; size: number }
  const prepared: Prepared[] = []
  const out: { verdict: Verdict; jev?: JevJudgment }[] = items.map((it) => ({ verdict: it.verdict }))
  items.forEach((it, i) => {
    if (it.previous === null || (it.verdict.outcome !== "changed" && it.verdict.outcome !== "cosmetic")) return
    if (!it.watch.anchors.length && !it.watch.searched) return
    const [a, b] = [fold(it.previous), fold(it.text)]
    const lost = it.watch.anchors.filter((x) => locate(a, x) === 1 && locate(b, x) !== 1)
    const lines = clipAll(
      changedLines(it.previous, it.text).map((l) => l.shown),
      STATE_CHARS * 0.5,
    )
    const candidates = lost.map((x) => rebindCandidates(x.exact, it.text))
    const size = lines.join("").length + lost.reduce((n, x, j) => n + x.exact.length * 3 + candidates[j]!.join("").length, 0)
    prepared.push({ i, lines, lost, candidates, size })
  })

  // 按 state 大小装箱：一个请求装得下就只发一个
  const batches: Prepared[][] = []
  let used = Infinity
  for (const p of prepared) {
    if (used + p.size > STATE_CHARS * 0.8) batches.push([]), (used = 0)
    batches.at(-1)!.push(p)
    used += p.size
  }

  for (const batch of batches) {
    const pages: Record<string, unknown> = {}
    const quotes: Record<string, unknown> = {}
    const questions: Record<string, Question> = {}
    for (const p of batch) {
      const it = items[p.i]!
      if (p.lines.length) {
        pages[`p${p.i}`] = {
          url: it.url,
          removed: p.lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2)),
          added: p.lines.filter((l) => l.startsWith("+ ")).map((l) => l.slice(2)),
          tracked_quotes: clipAll(
            it.watch.anchors.map((x) => x.exact),
            4000,
          ),
        }
        questions[`p${p.i}`] = pageQuestion(`p${p.i}`)
      }
      p.lost.forEach((x, j) => {
        const c = p.candidates[j]!
        if (!c.length) return
        const id = `q${p.i}_${j}`
        const at = it.previous!.indexOf(x.exact.slice(0, 40))
        quotes[id] = {
          url: it.url,
          quoted_sentence: x.exact,
          old_context: at < 0 ? "" : it.previous!.slice(Math.max(0, at - 300), at + x.exact.length + 300),
          ...Object.fromEntries(c.map((s, k) => [`candidate_${k + 1}`, s])),
        }
        questions[id] = quoteQuestion(id, c.length)
      })
    }
    let result: JevResult | undefined
    let error: string | undefined
    if (Object.keys(questions).length)
      try {
        result = await ask({ pages, quotes }, questions)
      } catch (e: any) {
        error = String(e?.message || e).slice(0, 200)
      }
    for (const p of batch) out[p.i] = interpret(items[p.i]!, p, result, error)
  }
  return out
}

function interpret(
  it: Item,
  p: { i: number; lines: string[]; lost: Selector[]; candidates: string[][] },
  result: JevResult | undefined,
  error: string | undefined,
): { verdict: Verdict; jev?: JevJudgment } {
  if (error || (!result && p.lines.length)) {
    const reasons = it.verdict.outcome === "changed" ? [...it.verdict.reasons, `Jev 未能判断，按规则处理：${error}`] : (it.verdict as any).reasons
    return { verdict: { ...it.verdict, reasons } as Verdict, jev: { policy: true, rebinds: [], unresolved: p.lost.length, error } }
  }
  const reasons: string[] = []
  let dims: JevJudgment["dims"]
  if (p.lines.length) {
    const a = result!.answers[`p${p.i}`]
    if (a?.type !== "choice") return interpret(it, p, undefined, `没有回答 p${p.i}`)
    dims = Object.fromEntries([...Object.keys(DIMENSIONS), "none"].map((k) => [k, a.probabilities?.[k] ?? 0])) as JevJudgment["dims"]
  }
  const policy = !!dims && 1 - dims.none >= policyThreshold()
  if (dims)
    reasons.push(
      `Jev ${policy ? "判为政策变化" : "判为非政策变化"}：` +
        Object.entries(dims)
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join("、"),
    )
  if (policy) reasons.push(...relevantChanges(it.previous!, it.text, { anchors: [], searched: true }))
  const rebinds: JevJudgment["rebinds"] = []
  p.lost.forEach((x, j) => {
    const a = result?.answers[`q${p.i}_${j}`]
    const k = a?.type === "choice" && a.choice !== "none" ? Number(a.choice.replace("candidate_", "")) - 1 : -1
    const prob = a?.type === "choice" ? (a.probabilities?.[a.choice] ?? a.confidence) : 0
    const exact = p.candidates[j]![k]
    if (exact && prob >= rebindThreshold()) {
      rebinds.push({ from: x, exact, p: prob })
      reasons.push(`引文改写，自动改绑（${prob.toFixed(2)}）：「${x.exact.slice(0, 80)}」→「${exact.slice(0, 80)}」`)
    } else reasons.push(`引文失效：「${x.exact.slice(0, 100)}」`)
  })
  return {
    verdict: { outcome: policy || p.lost.length ? "changed" : "cosmetic", reasons },
    jev: { dims, policy, rebinds, unresolved: p.lost.length - rebinds.length },
  }
}

export const SAME_PAGE_QUESTION = {
  type: "noul",
  instructions:
    "`before` and `after` are two fetches of the same URL, normalized to text. Is `after` a revised version of the same document as `before`, " +
    "rather than a different page (a login, captcha or error page, a cookie wall, a page for another country, language or product version, or an unrelated page)?",
  criteria: {
    true: "Same document: same vendor, same subject and scope, with sections rewritten, added, moved or removed.",
    false: "Different page: verification/error/shell page, another region, language or product version, or a different document.",
  },
} as const

/** 新正文是不是同一份文档的改版，返回 Jev 说「是」的概率 */
export async function samePage(url: string, before: string, after: string, ask: Ask = defaultAsk): Promise<number> {
  const state = { url, before: before.slice(0, STATE_CHARS * 0.45), after: after.slice(0, STATE_CHARS * 0.45) }
  return noul(await ask(state, { same_page: SAME_PAGE_QUESTION }), "same_page")
}
