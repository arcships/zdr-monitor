/** 抓取层只判断响应在技术上能不能作为正文保存。
 *
 * URL 已经由 agent 策展过。这里不再用关键词猜「像不像政策」；政策权威性和语义
 * 属于 agent。这里只拦 HTTP 错误、Jina 错误壳、挑战页、软 404 和空响应。 */

export type Verdict =
  | "fetched"
  | "render_error"
  | "challenge_page"
  | "empty_response"
  | "not_found_page"
  | "pdf_unsupported"
  | "network_error"
  | `http_${number}`
  | `target_http_${number}`

export interface Response {
  ok: boolean
  http_status: number
  pdf?: boolean
  text?: string
}

const NOT_FOUND =
  /Uh oh\. That page doesn.t exist|(?:^|\n)\s*(?:#+\s*)?(?:404|Page not found|Page Not Found|This page could not be found)(?:\s|$)/i

const CHALLENGE =
  /^(?:.{0,200})(?:Just a moment|Checking your browser|Attention Required|Access denied)|verify (?:that )?you are human|requiring CAPTCHA|enable javascript and cookies to continue/i

// r.jina.ai 自己失败时也返回 HTTP 200,套一个错误壳。上一版系统就是在这里
// 把 "Something went wrong!" 当成百度千帆的政策原文存了进去,覆盖了正常版本,
// 还制造了整个数据集里唯一一条(假的)「条款消失」告警。
const RENDER_ERROR = /(?:^|\n)#{0,3}\s*(?:Something went wrong!?|Try again)\s*(?:\n|$)/i

/** Jina 有时会把动态页面的标题壳、甚至广告追踪跳转当成成功正文返回。
 *  这些响应仍是 HTTP 200，但 Markdown Content 为空或只有一句探针说明。
 *  只按整段非空判断会把它们保存成新版本，随后所有锚点一起误报 gone。 */
function incompleteMarkdown(text: string) {
  if (/^Title:\s*https?:\/\/match\.adsrvr\.org\//im.test(text)) return true
  if (/^Title:\s*IBM Terms\s*$/im.test(text) && /## Welcome to IBM Terms/i.test(text)) return true
  if (/Warning: This page maybe not yet fully loaded/i.test(text)) return true
  const marker = text.match(/(?:^|\n)Markdown Content:\s*\n/i)
  if (!marker) return false
  return text.slice((marker.index ?? 0) + marker[0].length).trim().length < 120
}

export function classifyFetchResult(response: Response): Verdict {
  if (!response.ok)
    return response.http_status === 403
      ? "http_403"
      : response.http_status
        ? (`http_${response.http_status}` as Verdict)
        : "network_error"
  if (response.pdf) return "pdf_unsupported"
  const text = response.text || ""
  const target = text.match(/Warning: Target URL returned error (\d{3})/i)
  if (target) return `target_http_${target[1]}` as Verdict
  if (NOT_FOUND.test(text)) return "not_found_page"
  if (CHALLENGE.test(text)) return "challenge_page"
  if (RENDER_ERROR.test(text) || incompleteMarkdown(text)) return "render_error"
  if (!text.trim()) return "empty_response"
  return "fetched"
}

/** 只有这个判定能产生正文版本。 */
export const isUsable = (verdict: Verdict) => verdict === "fetched"
