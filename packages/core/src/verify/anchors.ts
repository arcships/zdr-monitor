/** 锚点校验:在正文里重新定位一条条款。
 *  W3C Web Annotation 的 TextQuoteSelector 模型。
 *
 *  监控单位是锚点不是页面。实测:已发布结论引用的正文共 2628KB,真正被引用的
 *  原文 30.8KB——1.17%。拿整页 sha256 监控,等于用 297KB 的哈希盯 483 个字。 */
import type { Anchor } from "../registry"

export type AnchorState = "exact" | "reworded" | "gone"

export interface Resolution {
  anchor_id: string
  provider_id: string
  source_id: string
  state: AnchorState
  /** reworded 时是替换掉原句的新文本,供人判断政策改了什么。 */
  found?: string
}

/** 匹配基准:NFKC 归一、转小写、剥掉所有非字母数字。
 *  markdown 的 # * [] 和 jina 正文里的零宽空格在这一步都被抹平。 */
export const fold = (value: string) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")

/** 折叠后的偏移映射回原文偏移。折叠会丢掉字符,所以要边折边记。 */
function foldWithMap(text: string): { folded: string; map: number[] } {
  const out: string[] = []
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const piece = fold(text[i]!)
    for (const ch of piece) {
      out.push(ch)
      map.push(i)
    }
  }
  return { folded: out.join(""), map }
}

export function resolveAnchor(anchor: Anchor, text: string): Resolution {
  const base = { anchor_id: anchor.id, provider_id: anchor.provider_id, source_id: anchor.source_id }
  const { prefix, exact, suffix } = anchor.selector
  const { folded, map } = foldWithMap(text)
  const fExact = fold(exact)

  // 原句还在,位置可以变。绝大多数情况走这一支。
  if (fExact && folded.includes(fExact)) return { ...base, state: "exact" }

  // 空 prefix 或 suffix 是合法的——条款在文档开头或结尾时本来就没有上下文。
  // 但两边都空就无从定位,只能判 gone。
  const fPrefix = fold(prefix)
  const fSuffix = fold(suffix)
  if (!fPrefix && !fSuffix) return { ...base, state: "gone" }

  const start = fPrefix ? folded.indexOf(fPrefix) : 0
  if (fPrefix && start < 0) return { ...base, state: "gone" }
  const after = fPrefix ? start + fPrefix.length : 0
  const end = fSuffix ? folded.indexOf(fSuffix, after) : folded.length
  if (fSuffix && end < 0) return { ...base, state: "gone" }

  // 前后文都在,中间那句变了——这才是政策变化。
  const from = map[after] ?? 0
  const to = map[end] ?? text.length
  return { ...base, state: "reworded", found: text.slice(from, to).trim() }
}

export interface AnchorSummary {
  exact: number
  reworded: number
  gone: number
  /** 抓取失败时锚点不参与判定,状态保持上一次的值。 */
  skipped: number
  changes: Resolution[]
}

/** 只对本次 classify 判了 fetched 的源解析锚点。
 *
 *  跳过这道闸会出什么事,实测过:用一个只判「返回是否为空」的脚本验 54 个锚点,
 *  第一遍报了 4 条 gone,重跑 54/54 全中。那 4 条是 r.jina.ai 在并发下返回的
 *  HTTP 200 错误壳。没有这道闸,每天会随机产生假的 [anchor-lost] issue,
 *  而 issue-fixer 拿着同一个错误壳去「修」好锚点,很可能把它改坏。 */
export function resolveAll(
  anchors: Anchor[],
  documents: Map<string, string>,
): AnchorSummary {
  const summary: AnchorSummary = { exact: 0, reworded: 0, gone: 0, skipped: 0, changes: [] }
  for (const anchor of anchors) {
    const text = documents.get(anchor.source_id)
    if (text === undefined) {
      summary.skipped++
      continue
    }
    const result = resolveAnchor(anchor, text)
    summary[result.state]++
    if (result.state !== "exact") summary.changes.push(result)
  }
  return summary
}
