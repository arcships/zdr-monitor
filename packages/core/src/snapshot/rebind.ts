/** 把一条锚点的 selector 改成新句子，只动这一段文本，provider 文件其余部分（顺序、注释、多行字符串）原样保留。
 *  writeProvider 会重排来源、重写全文，diff 就看不出只改了引文。 */
import { str } from "../toml"

export function rebindAnchor(toml: string, anchorId: string, exact: string): string {
  const lines = toml.split("\n")
  const idLine = lines.findIndex((l, i) => l === `id = ${str(anchorId)}` && lines[i - 1] === "[[anchor]]")
  if (idLine < 0) throw new Error(`找不到锚点 ${anchorId}`)
  const start = lines.findIndex((l, i) => i > idLine && l === "[anchor.selector]")
  if (start < 0) throw new Error(`锚点 ${anchorId} 没有 [anchor.selector]`)
  // 到下一个表头为止；多行字符串里以 [ 开头的行（markdown 链接）不算表头
  let end = start + 1
  let multi = false
  for (; end < lines.length; end++) {
    const line = lines[end]!
    if (!multi && line.startsWith("[")) break
    if ((line.match(/"""/g)?.length ?? 0) % 2) multi = !multi
  }
  while (end > start + 1 && lines[end - 1] === "") end--
  return [...lines.slice(0, start + 1), `prefix = ""`, `exact = ${str(exact)}`, `suffix = ""`, ...lines.slice(end)].join("\n")
}
