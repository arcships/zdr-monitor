/** 用 Jev 做快照层的语义判断。关键词规则（relevance.ts）只看变了的词里有没有「retention」
 *  「region」「删除」，召回高、误报也高：推荐文章换了一条、账号删除步骤改写、条款换了国家版本、
 *  价格表调价，都会走一轮快照 PR → 复核 issue → agent。配了 JEV_API_KEY 时由 Jev 判断。
 *
 *  按官方用法（https://docs.typesafe.ai/skill.md）：
 *    - 一个页面一个请求，state 只放这个页面的改动和它的引文。不把几个页面塞进一个 state 再让题目
 *      「只看某一段」：无关内容会拉低准确率。同一个 state 的题都放进同一个请求，并行、几乎不加时间
 *    - 每个问题一个原子判断，用 Noul（是非概率）：「改没改任何数据承诺」一道，五个维度各一道
 *      （一次改动可能同时动几个维度，不是互斥的单选）。不用带「none」选项的单选题
 *    - 失效引文的每个候选句一道 Noul：「跟原引文是不是同一个承诺」。最高的那句够高、且只有它够高才改绑
 *    - 答案在代码里组合：政策变化的概率取总题和五个维度里的最大值，阈值偏低（宁可多派 agent）
 *
 *  Jev 调用失败一律退回原规则（宁可多叫一次 agent，不能漏掉一次真变化）。 */
import { ask as defaultAsk, clipTokens, estimateTokens, noul, QUESTION_TOKENS, type Ask, type JevResult, type Question } from "../jev"
import { fold, locate } from "./quote"
import { changedLines, relevantChanges, type Watch } from "./relevance"

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? n : fallback
}
/** 政策变化的概率（几道 Noul 的最大值）达到它就算政策变化。偏低：漏判一次真变化的代价远大于多派一次 agent */
export const policyThreshold = () => num(process.env.JEV_POLICY_THRESHOLD, 0.3)
/** 改绑和「同一份文档」都会替掉现有证据，要很有把握 */
export const rebindThreshold = () => num(process.env.JEV_REBIND_THRESHOLD, 0.9)
export const samePageThreshold = () => num(process.env.JEV_SAME_PAGE_THRESHOLD, 0.9)
/** 同时在跑的 Jev 请求数 */
const CONCURRENCY = 4

const clipAll = (lines: string[], budget: number) => {
  const out: string[] = []
  let used = 0
  for (const line of lines) {
    const n = estimateTokens(line)
    if (used + n > budget) break
    out.push(line)
    used += n
  }
  return out
}

export const DIMENSIONS = {
  training: "whether customer prompts, inputs, outputs or files are used to train or improve models",
  retention: "how long customer prompts, inputs, outputs, files or logs are retained, or when they are deleted",
  zdr: "whether zero data retention is offered, and its scope, eligibility or exceptions",
  processing_region: "where customer data is processed or stored",
  role: "whether the vendor acts as processor, sub-processor or controller of customer data, or who its sub-processors are",
} as const
export type Dimensions = Record<keyof typeof DIMENSIONS, number>

const CHANGED =
  "The edit adds, removes, reverses, narrows or widens such a commitment, or changes its period, scope, region, plan, model or exception."
const NOT_CHANGED =
  "Only navigation, menus, related-article teasers, headings, dates, prices, model or feature lists without data-handling terms, " +
  "formatting, typo fixes, links, rewording that keeps the same meaning, or account how-to steps changed."

const policyQuestion: Question = {
  type: "noul",
  instructions:
    "`removed` and `added` are the old and new lines of an edit to an official vendor page about an AI/LLM service " +
    "(`tracked_quotes` are sentences we already cite from it). Does the edit change any vendor commitment about how customer data is handled?",
  criteria: { true: CHANGED, false: NOT_CHANGED },
}

const dimensionQuestion = (what: string): Question => ({
  type: "noul",
  instructions: `\`removed\` and \`added\` are the old and new lines of an edit to an official vendor page about an AI/LLM service. Does the edit change the vendor's commitment about ${what}?`,
  criteria: { true: CHANGED, false: `The edit does not touch ${what}, or only rewords it with the same meaning.` },
})

const quoteQuestion = (j: number, k: number): Question => ({
  type: "noul",
  instructions:
    `\`lost_quotes[${j}].quoted_sentence\` is a vendor commitment we cite from the old version of the page (\`old_context\` is the text around it). ` +
    `Does \`lost_quotes[${j}].candidates[${k}]\`, from the new version, state the same commitment with the same meaning?`,
  criteria: {
    true: "Same data, same plan or product scope, same period, same conditions and exceptions; only the wording differs.",
    false: "Any of the data, scope, period, conditions or exceptions differs, even slightly, or it is a different statement.",
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
  /** 五个维度各自被改的概率；none = 1 − 政策变化的概率。正文长句没变（只有引文所在的短行变了）时没问 */
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

type Prepared = { i: number; lines: string[]; lost: Selector[]; candidates: string[][] }

/** 一批页面逐个判断（每个页面一个请求，并发 CONCURRENCY 个）：配了 Jev 时由它做语义判断，关键词规则只在 Jev 不可用时兜底。
 *    - 正文变化：Jev 说改了数据承诺 → changed；没改 → cosmetic（规则说有变化也算 cosmetic）
 *    - 引文失效：快照必须重写。Jev 找到同义改写的记下改绑，找不到的留给 agent
 *  没人关心的来源（没有引文、也不在 searched 里）不问。某个请求失败 → 那个页面按规则 */
export async function judgeBatch(items: Item[], ask: Ask = defaultAsk): Promise<{ verdict: Verdict; jev?: JevJudgment }[]> {
  const prepared: Prepared[] = []
  const out: { verdict: Verdict; jev?: JevJudgment }[] = items.map((it) => ({ verdict: it.verdict }))
  items.forEach((it, i) => {
    if (it.previous === null || (it.verdict.outcome !== "changed" && it.verdict.outcome !== "cosmetic")) return
    if (!it.watch.anchors.length && !it.watch.searched) return
    const [a, b] = [fold(it.previous), fold(it.text)]
    const lost = it.watch.anchors.filter((x) => locate(a, x) === 1 && locate(b, x) !== 1)
    // 题目、引文、候选句留出余量，剩下的给改动行；装不下的行截掉（宁可少看几行，也不超上下文报错）
    const lines = clipAll(
      changedLines(it.previous, it.text).map((l) => l.shown),
      QUESTION_TOKENS * 0.6,
    )
    prepared.push({ i, lines, lost, candidates: lost.map((x) => rebindCandidates(x.exact, it.text)) })
  })
  let next = 0
  const worker = async () => {
    while (next < prepared.length) {
      const p = prepared[next++]!
      out[p.i] = await judgePage(items[p.i]!, p, ask)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, prepared.length) }, worker))
  return out
}

async function judgePage(it: Item, p: Prepared, ask: Ask) {
  const questions: Record<string, Question> = {}
  const state: Record<string, unknown> = { url: it.url }
  if (p.lines.length) {
    state.removed = p.lines.filter((l) => l.startsWith("- ")).map((l) => l.slice(2))
    state.added = p.lines.filter((l) => l.startsWith("+ ")).map((l) => l.slice(2))
    state.tracked_quotes = clipAll(
      it.watch.anchors.map((x) => x.exact),
      QUESTION_TOKENS * 0.1,
    )
    questions.policy = policyQuestion
    for (const [k, what] of Object.entries(DIMENSIONS)) questions[`dim_${k}`] = dimensionQuestion(what)
  }
  // 题号 q{j}_{k} 对应 lost_quotes[j].candidates[k]；没有候选句的引文不出题，直接留给 agent
  if (p.lost.length)
    state.lost_quotes = p.lost.map((x, j) => {
      const at = it.previous!.indexOf(x.exact.slice(0, 40))
      p.candidates[j]!.forEach((_, k) => (questions[`q${j}_${k}`] = quoteQuestion(j, k)))
      return {
        quoted_sentence: x.exact,
        old_context: at < 0 ? "" : it.previous!.slice(Math.max(0, at - 300), at + x.exact.length + 300),
        candidates: p.candidates[j]!,
      }
    })
  let result: JevResult | undefined
  let error: string | undefined
  if (Object.keys(questions).length)
    try {
      result = await ask(state, questions)
    } catch (e: any) {
      error = String(e?.message || e).slice(0, 200)
    }
  return interpret(it, p, result, error)
}

function interpret(it: Item, p: Prepared, result: JevResult | undefined, error: string | undefined): { verdict: Verdict; jev?: JevJudgment } {
  if (error || (!result && p.lines.length)) {
    const reasons = it.verdict.outcome === "changed" ? [...it.verdict.reasons, `Jev 未能判断，按规则处理：${error}`] : (it.verdict as any).reasons
    return { verdict: { ...it.verdict, reasons } as Verdict, jev: { policy: true, rebinds: [], unresolved: p.lost.length, error } }
  }
  const reasons: string[] = []
  let dims: JevJudgment["dims"]
  if (p.lines.length) {
    let any: number
    let each: Dimensions
    try {
      any = noul(result!, "policy")
      each = Object.fromEntries(Object.keys(DIMENSIONS).map((k) => [k, noul(result!, `dim_${k}`)])) as Dimensions
    } catch (e: any) {
      return interpret(it, p, undefined, String(e?.message || e))
    }
    dims = { ...each, none: 1 - Math.max(any, ...Object.values(each)) }
  }
  const policy = !!dims && 1 - dims.none >= policyThreshold()
  if (dims)
    reasons.push(
      `Jev ${policy ? "判为政策变化" : "判为非政策变化"}：` +
        Object.entries(dims)
          .filter(([k]) => k !== "none")
          .map(([k, v]) => `${k} ${v.toFixed(2)}`)
          .join("、") +
        `（任一承诺 ${(1 - dims.none).toFixed(2)}）`,
    )
  if (policy) reasons.push(...relevantChanges(it.previous!, it.text, { anchors: [], searched: true }))
  const rebinds: JevJudgment["rebinds"] = []
  p.lost.forEach((x, j) => {
    const scores = p.candidates[j]!.map((_, k) => {
      const a = result?.answers[`q${j}_${k}`] as { noul?: unknown } | undefined
      return typeof a?.noul === "number" ? a.noul : 0
    })
    const best = scores.length ? scores.indexOf(Math.max(...scores)) : -1
    const prob = best < 0 ? 0 : scores[best]!
    // 只有一句够像才改绑：两句都像说明拿不准是哪句
    const unique = scores.filter((v) => v >= 0.5).length <= 1
    const exact = p.candidates[j]![best]
    if (exact && prob >= rebindThreshold() && unique) {
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
  const half = (QUESTION_TOKENS - 2000) / 2
  const state = { url, before: clipTokens(before, half), after: clipTokens(after, half) }
  return noul(await ask(state, { same_page: SAME_PAGE_QUESTION }), "same_page")
}
