/** 快照变化值不值得叫 agent 复核。
 *
 *  快照总是照常更新；这里只决定要不要开 [policy-review] issue。门槛是变化的正文行
 *  碰到了跟五个维度有关的内容。页面装修（相关文章换了推荐、时间戳、标题、侧栏）不算，
 *  同一句话换个缩写（Zero Data Retention → ZDR）也不算。 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import { loadProvider } from "../registry"
import { fold, locate } from "./quote"

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

export interface Assessment {
  /** 原本能定位、这次失效的引文 */
  lost: string[]
  /** 碰到五个维度的变化行 */
  hits: string[]
}

/** 比较 base..head 之间这个 provider 的快照变化。新来源的第一份快照不算变化：
 *  它的引文由加来源的那次复核负责。 */
export function assess(root: string, provider: string, base: string, head: string): Assessment {
  const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const show = (rev: string, file: string) => {
    const r = git("show", `${rev}:${file}`)
    return r.status === 0 ? r.stdout.replace(/^<!--.*?-->\n/, "") : null
  }
  const { anchors } = loadProvider(root, provider)
  const files = git("diff", "--name-only", "--no-renames", base, head, "--", "snapshots").stdout.split("\n").filter(Boolean)
  const lost: string[] = []
  const hits: string[] = []
  for (const file of files) {
    const id = path.basename(file, ".md")
    const [before, after] = [show(base, file), show(head, file)]
    if (before === null || after === null) continue
    for (const a of anchors.filter((a) => a.source_id === id))
      if (locate(fold(before), a.selector) === 1 && locate(fold(after), a.selector) !== 1)
        lost.push(`\`${file}\` 引文失效：「${a.selector.exact.slice(0, 120)}」`)
    for (const line of policyChanges(before, after)) hits.push(`\`${file}\` ${line.slice(0, 240)}`)
  }
  return { lost, hits }
}
