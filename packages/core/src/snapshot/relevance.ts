/** 快照 diff 的门槛：新抓回的正文跟上一版比，变化跟我们引用过的内容有关才算变化、才重写快照。
 *
 *  一个 provider 当天只要有一份快照被重写，就会走一轮快照 PR → CI → 复核 issue → agent
 *  （按 provider 合并，每天最多一轮）。页面装修（相关文章换了推荐、时间戳、标题、侧栏、
 *  cookie 横幅）和同一句话换个缩写（Zero Data Retention → ZDR）不该触发这一轮。
 *  这类变化不写快照，快照停在上一版有意义的正文上。 */
import type { Anchor } from "../registry"
import { fold, locate } from "./quote"

type Selector = Anchor["selector"]

/** 跟五个维度有关的词。英文按词边界匹配，免得 log 命中 blog、login */
export const POLICY = new RegExp(
  [
    String.raw`\b(retain(s|ed|ing)?|retention|delet(e|es|ed|ion)|purg(e|es|ed)|stored|stores|storing|logging)\b|\blogs?\b(?!\s*(in|out|into)\b)`,
    String.raw`\b(zero[- ]data[- ]retention|zdr|abuse monitoring|opt[- ]?(out|in)|(sub-?)?processors?|controllers?)\b`,
    String.raw`\b(data residency|residency|data (center|centre)s?|transfer(s|red)?)\b`,
    // region 单独出现太常见（「Availability varies by region」），要跟处理、存储放在一起才算
    String.raw`\b(process(ed|ing)?|stor(ed|age)|host(ed|ing)?|resid(e|es|ency))\b[^.]{0,60}\bregions?\b|\bregions?\b[^.]{0,60}\b(process(ed|ing)?|stor(ed|age)|host(ed|ing)?)\b`,
    String.raw`\b\d+\s*(days?|months?|years?|hours?)\b`,
    String.raw`训练|改进模型|优化模型|保留|留存|保存|存储|持久化|删除|日志|零数据|零保留|处理者|控制者|受托|委托处理|境内|境外|出境|跨境|数据中心|\d+\s*(天|日|个月|年)`,
  ].join("|"),
  "i",
)
/** 这两个词在条款以外也常见：「training or technical assistance」是培训，
 *  「CLI choices persist」是界面设置。同一句里有数据、内容、模型这类对象才算 */
const WEAK = [
  {
    term: /\btrain(s|ed|ing)?\b/i,
    object: /\b(models?|ai|ml|llms?|machine learning|data|datasets?|content|inputs?|outputs?|prompts?|completions?|improv\w*|fine-?tun\w*)\b/i,
  },
  {
    term: /\bpersist(s|ed|ent|ently|ence)?\b/i,
    object: /\b(data|content|inputs?|outputs?|prompts?|responses?|requests?|conversations?|messages?|files?|code|history|logs?|stor\w*|disk|information)\b/i,
  },
]
const sentences = (line: string) => line.split(/(?<=[.;!?])\s+|(?<=[。；！？])/)
/** text 里有没有跟五个维度有关的词。弱词要到 whole（text 所在的整行）里找它所在的句子看对象 */
export const mentionsPolicy = (text: string, whole = text) =>
  POLICY.test(text) || WEAK.some(({ term, object }) => term.test(text) && sentences(whole).some((s) => term.test(s) && object.test(s)))

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
      if (mentionsPolicy(probe, whole)) return true
      return bare !== whole && mentionsPolicy(canon(whole)) && POLARITY.test(bare)
    })
    .map(({ shown }) => shown)
}

/** 这个来源上我们关心什么：绑在它上面的引文，以及它是不是某条 unknown 结论查过的页面 */
export interface Watch {
  anchors: Selector[]
  searched: boolean
}

/** 原本能唯一定位、新正文里定位不到的引文。只看引文本身，不管所在行多短——
 *  「本服务不会使用您的数据训练模型。」这种短句改一个字，正文长行可能一行都没变 */
export function lostAnchors(before: string, after: string, anchors: Selector[]) {
  const [a, b] = [fold(before), fold(after)]
  return anchors.filter((x) => locate(a, x) === 1 && locate(b, x) !== 1).map((x) => `引文失效：「${x.exact.slice(0, 100)}」`)
}

/** 抓回的正文整体换了语种：中文页突然变成全英文（或反过来）。多半是按 IP 返回了另一个地区的
 *  版本——runner 在境外时，境内协议页会给境外版。这不是厂商改了条款，是我们没抓到对的页面，
 *  按抓取失败处理，快照保持上一次成功的内容。 */
export function languageFlipped(before: string, after: string) {
  const ratio = (t: string) => {
    const cjk = t.match(/[\u4e00-\u9fff]/g)?.length ?? 0
    const latin = t.match(/[a-z]/gi)?.length ?? 0
    return cjk + latin ? cjk / (cjk + latin / 4) : 0
  }
  return Math.abs(ratio(before) - ratio(after)) > 0.5
}

/** 新旧两版之间的变化跟我们有没有关系，返回理由；空数组就是无关（cosmetic）：
 *    - 引文失效：原本能唯一定位，现在找不到或变成多处
 *    - 页面上涉及五个维度的改动：只看我们引用过、或某条 unknown 结论查过的页面。新增、删除、改写都算；
 *      改写只看真正变了的词（policyChanges），所以引文旁边加一句「unless you opt in」会算，
 *      同一行里换了个 URL、导航改了名、页脚促销提到 region 都不算
 *  没人关心的来源返回空：正文怎么变都不触发。 */
export function relevantChanges(before: string, after: string, watch: Watch): string[] {
  const reasons = lostAnchors(before, after, watch.anchors)
  if (watch.searched || watch.anchors.length)
    for (const line of policyChanges(before, after))
      reasons.push(`${line.startsWith("+ ") ? "新增" : "删除"}：${line.slice(2, 200)}`)
  return reasons
}
