/** 正文版本之间的差异。
 *
 *  为什么需要它:锚点只盯我们已经知道的条款,实测覆盖正文 1%。
 *  厂商在剩下 99% 里**新增**一条(比如原来没有 ZDR,某天加了一节),
 *  所有锚点照样 exact,我们永远不会知道。
 *
 *  所以抓取层的产出是「这份文档变了,变在这里」,让 agent 去判断要不要紧。
 *  锚点回答的是另一个问题:「我们已有的结论还站得住吗」。两者互补。 */

export interface Hunk {
  kind: "added" | "removed"
  text: string
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean)

/** 行级 diff。政策文档是散文,按行比对足够,不需要字符级。
 *  用集合而非 LCS:条款挪位置不算变化,内容增删才算。 */
export function diffDocuments(before: string, after: string): Hunk[] {
  const a = new Set(lines(before))
  const b = new Set(lines(after))
  const hunks: Hunk[] = []
  for (const line of b) if (!a.has(line)) hunks.push({ kind: "added", text: line })
  for (const line of a) if (!b.has(line)) hunks.push({ kind: "removed", text: line })
  return hunks
}
