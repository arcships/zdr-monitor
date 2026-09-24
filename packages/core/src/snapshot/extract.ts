/** 原始响应 → 规范化正文。快照里存的就是这里的输出，差异也在它上面算。
 *
 *  规范化只做与内容无关的清理：去掉页面外壳、链接地址和图片，一段一行。
 *  追踪像素的随机参数、Cloudflare 的邮箱混淆链接、导航栏——上一版的差异噪声
 *  几乎都来自这些，而它们都活在链接地址和页面外壳里。 */
import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import TurndownService from "turndown"
// @ts-expect-error 没有类型声明
import { gfm } from "turndown-plugin-gfm"
import type { Kind } from "./fetch"

export type Extractor = "readability" | "body" | "main"

// 只删确定不承载条款的外壳。header/aside/form/[hidden] 都不能删：ASP.NET 站点整页包在
// <form> 里，FAQ 的答案常常折叠在 hidden/aria-hidden 里，文章标题区也常在 <header>。
const CHROME = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "iframe",
  "canvas",
  "nav",
  "footer",
  "[role=navigation]",
  "[role=contentinfo]",
].join(",")

function turndown() {
  const service = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "*" })
  service.use(gfm)
  // 快照是给人和 agent 读的正文，不是要再渲染的 markdown。转义只会让
  // 「3. 违约责任」变成「3\\. 违约责任」，徒增和引文对不上的机会。
  service.escape = (text: string) => text
  // 链接只留文字，图片整个丢掉——地址里的随机参数是最大的噪声源。
  service.addRule("link", { filter: "a", replacement: (content) => content })
  service.addRule("image", { filter: ["img", "picture"], replacement: () => "" })
  return service
}

const service = turndown()

/** markdown 层面的兜底：原始 .md 来源和 turndown 漏网的链接、图片。 */
const stripLinks = (text: string) =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, "$1")

/** 同一行完整重复出现时只留第一次。桌面版/移动版各渲染一份、页眉页脚复制一份，
 *  都会让引文「出现多次」而无从定位。只对长行做——「是」「否」这类表格单元格
 *  本来就会重复。 */
const DEDUPE_MIN = 40

export function normalize(text: string) {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const raw of stripLinks(text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw
      .replace(/[​-‍⁠﻿]/g, "")
      .replace(/[ \t 　]+/g, " ")
      .trim()
    // 只剩标点、符号的行（表格分隔线、孤立的 * 或 |）不承载内容。
    if (!/[\p{L}\p{N}]/u.test(line)) continue
    if (lines.at(-1) === line) continue
    if (line.length >= DEDUPE_MIN) {
      if (seen.has(line)) continue
      seen.add(line)
    }
    lines.push(line)
  }
  return lines.join("\n")
}

/** linkedom 解析缺 <html>/<body> 的片段时 document.body 是空的；mammoth 转 docx 出来的就是片段。 */
function parse(html: string) {
  if (/<html[\s>]/i.test(html)) return parseHTML(html)
  return parseHTML(`<!doctype html><html>${/<body[\s>]/i.test(html) ? html : `<body>${html}</body>`}</html>`)
}

function bodyOf(html: string) {
  const { document } = parse(html)
  for (const el of [...document.querySelectorAll(CHROME)]) el.remove()
  return document.body?.innerHTML || ""
}

/** 页面自己声明的正文区域。只有唯一的 main（或唯一的 article）时才用，
 *  结构性的判断，不按文字多少临时决定——那样同一页面会在两种抽法之间来回跳。 */
function mainOf(html: string) {
  const { document } = parse(html)
  for (const el of [...document.querySelectorAll(CHROME)]) el.remove()
  const mains = [...document.querySelectorAll("main,[role=main]")]
  const articles = [...document.querySelectorAll("article")]
  const pick = mains.length === 1 ? mains[0] : articles.length === 1 ? articles[0] : document.body
  return pick?.innerHTML || ""
}

function readabilityOf(html: string) {
  const { document } = parse(html)
  for (const el of [...document.querySelectorAll("script,style,noscript,template")]) el.remove()
  try {
    return new Readability(document as any, { charThreshold: 200 }).parse()?.content || ""
  } catch {
    return ""
  }
}

export function htmlToText(html: string, extractor: Extractor = "body") {
  const content = extractor === "readability" ? readabilityOf(html) : extractor === "main" ? mainOf(html) : bodyOf(html)
  return normalize(service.turndown(content || ""))
}

export async function toText(kind: Kind, body: Buffer, extractor: Extractor = "body"): Promise<string> {
  if (kind === "text") return normalize(body.toString("utf8"))
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(body))
    const { text } = await extractText(pdf, { mergePages: false })
    return normalize((text as string[]).join("\n"))
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth")
    const { value } = await mammoth.convertToHtml({ buffer: body })
    return htmlToText(value, "body")
  }
  return htmlToText(body.toString("utf8"), extractor)
}

const NOT_FOUND = /^(?:.{0,300})(?:Page not found|This page could not be found|404 Not Found|页面不存在|页面找不到)/is
const CHALLENGE =
  /^(?:.{0,300})(?:Just a moment|Checking your browser|Attention Required|Access denied|verify (?:that )?you are human|enable javascript and cookies to continue)/is

/** 抓到的东西能不能当正文。只拦技术上的失败，不判断「像不像政策」。 */
export function unusable(text: string): string | null {
  if (text.replace(/[^\p{L}\p{N}]/gu, "").length < 200) return "too_short"
  if (CHALLENGE.test(text)) return "challenge_page"
  if (NOT_FOUND.test(text)) return "not_found_page"
  return null
}
