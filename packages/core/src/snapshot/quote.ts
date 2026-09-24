/** 引文核对：引文必须能在 bot 抓回的规范化正文里找到。
 *
 *  匹配在 NFKC 折叠、剥掉所有非字母数字之后做——markdown 符号、全半角标点、
 *  换行位置都不影响命中。旧锚点是从 jina markdown 里摘的，可能带着链接地址，
 *  所以引文也先去掉 markdown 链接地址再比。 */
export const fold = (value: string) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")

export const quoteKey = (quote: string) =>
  fold(quote.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\]\((?:[^()]|\([^)]*\))*\)/g, "]"))

export function occurrences(folded: string, quote: string) {
  const key = quoteKey(quote)
  if (!key) return 0
  let count = 0
  for (let i = folded.indexOf(key); i >= 0; i = folded.indexOf(key, i + 1)) count++
  return count
}

/** 引文出现多次时，用上下文把它定位到唯一一处。prefix 或 suffix 任一能唯一定位即可——
 *  两边都要求会让页面上无关的前后文改动误伤仍然成立的引文。 */
export function locate(folded: string, selector: { prefix?: string; exact: string; suffix?: string }) {
  const n = occurrences(folded, selector.exact)
  if (n <= 1) return n
  const key = quoteKey(selector.exact)
  const prefix = quoteKey(selector.prefix ?? "")
  const suffix = quoteKey(selector.suffix ?? "")
  const count = (needle: string) => {
    let c = 0
    for (let i = folded.indexOf(needle); i >= 0; i = folded.indexOf(needle, i + 1)) c++
    return c
  }
  if (prefix && count(prefix + key) === 1) return 1
  if (suffix && count(key + suffix) === 1) return 1
  return n
}
