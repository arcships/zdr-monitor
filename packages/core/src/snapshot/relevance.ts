/** 快照 diff 的门槛：新抓回的正文跟上一版比，变化跟我们引用过的内容有关才算变化、才重写快照。
 *
 *  一个 provider 当天只要有一份快照被重写，就会走一轮快照 PR → CI → 复核 issue → agent
 *  （按 provider 合并，每天最多一轮）。页面装修（相关文章换了推荐、时间戳、标题、侧栏、
 *  cookie 横幅）和同一句话换个缩写（Zero Data Retention → ZDR）不该触发这一轮。
 *  这类变化不写快照，快照停在上一版有意义的正文上。 */
import type { Anchor } from "../registry"
import { fold, locate, occurrences, quoteKey } from "./quote"

type Selector = Anchor["selector"]

/** 跟五个维度有关的词。英文按词边界匹配，免得 log 命中 blog、login */
export const POLICY = new RegExp(
  [
    String.raw`\b(train(s|ed|ing)?|retain(s|ed|ing)?|retention|delet(e|es|ed|ion)|purg(e|es|ed)|stored|logs?|logging)\b`,
    String.raw`\b(zero[- ]data[- ]retention|zdr|abuse monitoring|opt[- ]?(out|in)|(sub-?)?processors?|controllers?)\b`,
    String.raw`\b(data residency|residency|data (center|centre)s?|transfer(s|red)?|region(s|al)?)\b`,
    String.raw`\b\d+\s*(days?|months?|years?|hours?)\b`,
    String.raw`训练|改进模型|优化模型|保留|留存|保存|存储|删除|日志|零数据|零保留|处理者|控制者|受托|委托处理|境内|境外|出境|跨境|数据中心|\d+\s*(天|日|个月|年)`,
  ].join("|"),
  "i",
)
/** 帮助中心、文档站侧栏的推荐条目：「* 标题 Learn how …」。标题里常有 data、storage，
 *  但它是导航，不是条款 */
export const TEASER = /^[*-]\s.{3,160}?\s(Learn|Understand|Review|See|Read|Find out|Discover|Explore|了解|查看)\b/i
/** cookie 横幅、示例代码、裸 URL：跟 API 数据怎么处理无关，里面的 region、store 是噪音 */
const NOISE = /cookie|https?:\/\/|^\s*(\/\/|#!|\$ |curl |import |const |let |var |def |from )/i
/** 跟 extract/snapshot 里的正文行门槛一致：短行是菜单、按钮、时间戳 */
const MATERIAL_MIN = 25
/** 整行增删时，不成句的多半是标题、目录项、页面标题、侧栏。条款本身是句子；
 *  改一条条款，句子那一行也会跟着变。中文比英文紧凑，按汉字数另算 */
const isSentence = (line: string) =>
  fold(line).length >= 60 || (line.match(/[\u4e00-\u9fff]/g)?.length ?? 0) >= 20

/** 否定、情态、限定词：「do not use … to train」改成「may use … to train」时，
 *  变的只有这几个词，本身不是维度关键词，但方向全反了 */
const POLARITY = new RegExp(
  [
    String.raw`\b(not|no|never|none|may|might|will|won't|shall|must|can|cannot|only|except|unless|without|until|including|excluding)\b`,
    String.raw`\d`,
    String.raw`不|未|无|非|会|可能|可以|仅|只|除|禁止|不得|将`,
  ].join("|"),
  "i",
)

/** 同一个意思的不同写法先归一，「Zero Data Retention」改成「ZDR」不算变化 */
const canon = (line: string) => line.replace(/zero[- ]data[- ]retention/gi, "ZDR")
/** 英文按词、中文按连续汉字切。中文不切到单字：「保留」「训练」这些词要整个留在同一段里 */
const tokens = (line: string) => canon(line).toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) ?? []

/** 两版之间增删的正文行，以及每行里真正该拿去匹配关键词的部分。
 *  按多重集合比，挪位置不算变化。删掉的一行和新增的一行词重合过半，视为同一行被改写，
 *  只看两边不同的那些词（各带上前后一个词，好让「30 → 60 days」里的数字和单位连起来）。 */
export function changedLines(before: string, after: string) {
  const count = (text: string) => {
    const m = new Map<string, { line: string; n: number }>()
    for (const line of text.split("\n")) {
      const key = fold(canon(line))
      if (key.length < MATERIAL_MIN) continue
      const e = m.get(key) ?? { line, n: 0 }
      e.n++
      m.set(key, e)
    }
    return m
  }
  const [a, b] = [count(before), count(after)]
  const diff = (x: typeof a, y: typeof a) =>
    [...x].flatMap(([key, e]) => Array(Math.max(0, e.n - (y.get(key)?.n ?? 0))).fill(e.line) as string[])
  const removed = diff(a, b)
  const added = diff(b, a)

  const overlap = (x: string[], y: string[]) => {
    const [p, q] = [new Set(x), new Set(y)]
    const shared = [...p].filter((t) => q.has(t)).length
    return shared / Math.max(1, new Set([...p, ...q]).size)
  }
  // probe 带前后一个词，给关键词匹配用；bare 只有变了的词，给否定/情态匹配用
  const delta = (own: string[], other: string[]) => {
    const rest = new Set(other)
    const changed = own.map((t, i) => [t, i] as const).filter(([t]) => !rest.has(t))
    return {
      probe: changed.flatMap(([t, i]) => [`${t} ${own[i + 1] ?? ""}`, `${own[i - 1] ?? ""} ${t}`]).join(" | "),
      bare: changed.map(([t]) => t).join(" "),
    }
  }
  const used = new Set<number>()
  const out: Array<{ shown: string; probe: string; bare: string; whole: string }> = []
  for (const line of removed) {
    const t = tokens(line)
    let best = -1
    let score = 0.5
    added.forEach((other, j) => {
      const s = used.has(j) ? 0 : overlap(t, tokens(other))
      if (s >= score) [best, score] = [j, s]
    })
    if (best < 0) {
      out.push({ shown: `- ${line}`, probe: line, bare: line, whole: line })
      continue
    }
    used.add(best)
    const u = tokens(added[best]!)
    out.push({ shown: `- ${line}`, ...delta(t, u), whole: line }, { shown: `+ ${added[best]}`, ...delta(u, t), whole: added[best]! })
  }
  added.forEach((line, j) => used.has(j) || out.push({ shown: `+ ${line}`, probe: line, bare: line, whole: line }))
  return out
}


/** 命中的变化行（带 -/+ 前缀）。整行新增或删除：是句子、且行里有关键词就算；
 *  改写：变的词里有关键词，或者这一行本身讲的是这些维度、而变的是否定/情态/限定/数字。 */
export function policyChanges(before: string, after: string) {
  return changedLines(before, after)
    .filter(({ shown, probe, bare, whole }) => {
      if (TEASER.test(whole) || NOISE.test(whole)) return false
      if (bare === whole && !isSentence(whole)) return false
      if (POLICY.test(probe)) return true
      return bare !== whole && POLICY.test(canon(whole)) && POLARITY.test(bare)
    })
    .map(({ shown }) => shown)
}

/** 这个来源上我们关心什么：绑在它上面的引文，以及它是不是某条 unknown 结论查过的页面 */
export interface Watch {
  anchors: Selector[]
  searched: boolean
}

/** 引文在折叠正文里的起点；定位不到唯一一处就是 -1。跟 locate 同一套规则 */
function position(folded: string, selector: Selector) {
  const key = quoteKey(selector.exact)
  const n = locate(folded, selector)
  if (!key || n !== 1) return -1
  if (occurrences(folded, selector.exact) === 1) return folded.indexOf(key)
  const prefix = quoteKey(selector.prefix ?? "")
  if (prefix) {
    const i = folded.indexOf(prefix + key)
    if (i >= 0 && folded.indexOf(prefix + key, i + 1) < 0) return i + prefix.length
  }
  return folded.indexOf(key + quoteKey(selector.suffix ?? ""))
}

/** 引文前后各几段算它的上下文 */
const CONTEXT = 3

/** 引文所在的那几段：同一小节里（不跨标题），引文所在段前后各 CONTEXT 段，折叠后拼起来。
 *  「We do not train on your data」后面加一句「unless you opt in」，引文还在，上下文变了。 */
function context(text: string, selector: Selector) {
  const lines = text.split("\n").filter((l) => fold(l))
  const folded = lines.map(fold)
  const at = position(folded.join(""), selector)
  if (at < 0) return null
  let line = 0
  for (let offset = 0; line < folded.length && offset + folded[line]!.length <= at; line++) offset += folded[line]!.length
  const heading = (i: number) => /^#{1,6}\s/.test(lines[i]!)
  let from = line
  while (from > 0 && line - from < CONTEXT && !heading(from)) from--
  let to = line
  while (to < lines.length - 1 && to - line < CONTEXT && !heading(to + 1)) to++
  return folded.slice(from, to + 1).join("")
}

/** 新旧两版之间的变化跟我们引用过的内容有没有关系，返回理由；空数组就是无关（cosmetic）：
 *    - 引文失效：原本能唯一定位，现在找不到或变成多处
 *    - 引文上下文变了：引文还在，但它所在的那几段改了
 *    - 页面有新表述：我们引用过、或某条 unknown 结论查过的页面，新增了碰到五个维度的句子。
 *      新句子离引文再远也算——「默认情况下每个请求的输入和回复都会持久化存储」这种新披露
 *      不在任何引文旁边，却直接关系到保留期 */
export function relevantChanges(before: string, after: string, watch: Watch): string[] {
  const reasons: string[] = []
  for (const a of watch.anchors) {
    const [was, now] = [context(before, a), context(after, a)]
    if (was === null) continue
    const quote = a.exact.slice(0, 100)
    if (now === null) reasons.push(`引文失效：「${quote}」`)
    else if (was !== now) reasons.push(`引文上下文变了：「${quote}」`)
  }
  if (watch.searched || watch.anchors.length)
    for (const line of policyChanges(before, after).filter((l) => l.startsWith("+ ")))
      reasons.push(`页面新增：${line.slice(2, 200)}`)
  return reasons
}
