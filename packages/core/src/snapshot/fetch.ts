/** 三种抓取方式，产出都是「原始字节 + 类型」，正文抽取统一在 extract.ts 做。
 *
 *  换抓取方式不应该制造差异：jina 只当远程浏览器用，要它返回渲染后的 HTML，
 *  而不是它自己的 markdown——上一版 97% 的「正文变化」就是 jina markdown 的抖动。 */
import type { Browser } from "playwright-core"

export type Method = "direct" | "browser" | "jina"
export const METHODS: Method[] = ["direct", "browser", "jina"]

export type Kind = "html" | "pdf" | "docx" | "text"

export interface Raw {
  ok: boolean
  status: number
  kind: Kind
  body: Buffer
  final_url?: string
  error?: string
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const LIMIT = 16 * 1024 * 1024
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function kindOf(contentType: string, url: string, body: Buffer): Kind {
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  })()
  if (/application\/pdf/i.test(contentType) || body.subarray(0, 5).toString() === "%PDF-") return "pdf"
  if (/officedocument\.wordprocessingml/i.test(contentType) || /\.docx$/i.test(pathname)) return "docx"
  // jina 的 html 模式回的是 text/plain；有些站点也给 HTML 配错类型。看内容，不信头。
  if (/^\s*(?:<!doctype html|<html[\s>])/i.test(body.subarray(0, 512).toString())) return "html"
  if (/text\/(plain|markdown)/i.test(contentType) || /\.(md|txt)$/i.test(pathname)) return "text"
  return "html"
}

const failed = (status: number, error: string): Raw => ({ ok: false, status, kind: "html", body: Buffer.alloc(0), error })

async function read(response: globalThis.Response) {
  const chunks: Uint8Array[] = []
  let bytes = 0
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
  return Buffer.concat(chunks)
}

async function http(url: string, headers: Record<string, string>, timeout: number, kindUrl = url): Promise<Raw> {
  let last: Raw = failed(0, "not_attempted")
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(timeout) })
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel()
        await sleep(2000 * 2 ** attempt)
        continue
      }
      const body = await read(response)
      return {
        ok: response.ok,
        status: response.status,
        kind: kindOf(response.headers.get("content-type") || "", kindUrl, body),
        body,
        final_url: response.url,
      }
    } catch (e: any) {
      last = failed(0, String(e?.message || e))
      if (last.error === "response_too_large") return last
      if (attempt < 2) await sleep(2000 * 2 ** attempt)
    }
  }
  return last
}

export const direct = (url: string) =>
  http(url, { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, 30000)

/** Jina 在自己的机房里渲染，适合数据中心 IP 被挡的站点。
 *
 *  取它渲染后的 markdown，而不是 html：客户端渲染的站点，html 模式拿回的是还没
 *  hydrate 的外壳，正文只藏在脚本数据里。markdown 的头部元数据（Title、URL Source、
 *  Published Time）在这里切掉，链接和图片交给统一的规范化去掉——上一版的差异噪声
 *  正是这些东西。 */
export async function jina(url: string): Promise<Raw> {
  const headers: Record<string, string> = { "x-return-format": "markdown", "x-no-cache": "true" }
  if (process.env.JINA_API_KEY) headers.authorization = `Bearer ${process.env.JINA_API_KEY}`
  const raw = await http("https://r.jina.ai/" + url, headers, 60000, url)
  if (!raw.ok) return raw
  const text = raw.body.toString("utf8")
  const target = text.match(/^Warning: Target URL returned error (\d{3})/m)
  if (target) return failed(Number(target[1]), `target_http_${target[1]}`)
  const marker = text.match(/(?:^|\n)Markdown Content:\n/)
  const body = marker ? text.slice(marker.index! + marker[0].length) : text
  return { ...raw, kind: raw.kind === "pdf" ? "pdf" : "text", body: Buffer.from(body) }
}

let shared: Promise<Browser> | null = null
async function launch() {
  const { chromium } = await import("playwright-core")
  return chromium.launch({ headless: true, channel: "chromium" })
}

export async function closeBrowser() {
  if (!shared) return
  const browser = await shared
  shared = null
  await browser.close()
}

/** 无头 Chromium 渲染 JS 页面。PDF 等非 HTML 响应直接取响应体。 */
export async function browser(url: string): Promise<Raw> {
  if (!shared) {
    shared = launch()
    // 启动失败会在每次 newContext 时再抛，这里只防止未处理的 rejection 打断整个进程。
    shared.catch(() => {})
  }
  let context
  try {
    context = await (await shared).newContext({ userAgent: UA, locale: "en-US" })
  } catch (e: any) {
    return failed(0, "browser_launch: " + String(e?.message || e).split("\n")[0])
  }
  const page = await context.newPage()
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
    if (!response) return failed(0, "no_response")
    const contentType = (await response.headerValue("content-type")) || ""
    if (!/html/i.test(contentType)) {
      const body = await response.body()
      return { ok: response.ok(), status: response.status(), kind: kindOf(contentType, url, body), body, final_url: page.url() }
    }
    // 客户端渲染的正文在 domcontentloaded 之后才出现。networkidle 在有长连接的站点上
    // 永远等不到，所以只等一段有限时间，超时也照常取当前 DOM。
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    const body = Buffer.from(await page.content())
    return { ok: response.ok(), status: response.status(), kind: "html", body, final_url: page.url() }
  } catch (e: any) {
    const message = String(e?.message || e)
    // PDF 之类的链接在浏览器里会变成下载，goto 直接抛错。这种资源不需要渲染。
    if (/Download is starting|net::ERR_ABORTED/i.test(message)) return direct(url)
    return failed(0, message.split("\n")[0]!)
  } finally {
    await context.close()
  }
}

export function fetchWith(method: Method, url: string) {
  return method === "browser" ? browser(url) : method === "jina" ? jina(url) : direct(url)
}
