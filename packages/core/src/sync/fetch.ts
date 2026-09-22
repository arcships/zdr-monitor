/** 抓取只有一条路:r.jina.ai,拿回 markdown。
 *
 *  不做 direct 抓取。理由是版本可比性:同一个页面 direct 拿回 HTML、
 *  jina 拿回 markdown,正文完全不同,version_id 会整体变化。混用两条路,
 *  换一次路就伪装成一次政策大改。统一形式比省下那点请求重要。 */

const LIMIT = 8 * 1024 * 1024
const AGENT = "zdr-policy-monitor/0.1"
const RETRIES = 3

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function retryDelay(response: globalThis.Response | null, attempt: number) {
  const value = response?.headers.get("retry-after")
  const seconds = value ? Number(value) : NaN
  return Number.isFinite(seconds) ? seconds * 1000 : 1000 * 2 ** attempt
}

export interface Fetched {
  ok: boolean
  http_status: number
  final_url?: string
  content_type?: string
  pdf: boolean
  text: string
  error?: string
}

export async function fetchDocument(url: string, timeout = 25000): Promise<Fetched> {
  for (let attempt = 0; attempt < RETRIES; attempt++) {
    let response: globalThis.Response | null = null
    try {
      response = await fetch("https://r.jina.ai/" + url, {
        signal: AbortSignal.timeout(timeout),
        redirect: "follow",
        headers: { "user-agent": AGENT, accept: "text/markdown,text/plain,text/html" },
      })
      if ((response.status === 429 || response.status >= 500) && attempt < RETRIES - 1) {
        await response.body?.cancel()
        await sleep(retryDelay(response, attempt))
        continue
      }

      let bytes = 0
      const chunks: Uint8Array[] = []
      const reader = response.body?.getReader()
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.length
        if (bytes > LIMIT) {
          await reader.cancel()
          throw new Error("response_too_large")
        }
        chunks.push(value)
      }
      const raw = Buffer.concat(chunks)
      const contentType = response.headers.get("content-type") || ""
      const pdf = /application\/pdf/i.test(contentType) || raw.subarray(0, 5).toString() === "%PDF-"
      return {
        ok: response.ok,
        http_status: response.status,
        final_url: response.url,
        content_type: contentType,
        pdf,
        // jina 返回的就是 markdown,不要再剥标签——剥了会把 [](链接) 弄坏。
        text: pdf ? "" : raw.toString("utf8"),
      }
    } catch (e: any) {
      if (attempt < RETRIES - 1 && e.message !== "response_too_large") {
        await sleep(retryDelay(response, attempt))
        continue
      }
      return { ok: false, http_status: 0, pdf: false, text: "", error: e.message }
    }
  }
  return { ok: false, http_status: 0, pdf: false, text: "", error: "retry_exhausted" }
}
