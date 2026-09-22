import { expect, test } from "bun:test"
import { classifyFetchResult } from "../src/sync/fetch-result"

const long = (s: string) => s + "x".repeat(600)

test("jina 渲染失败的壳不是政策正文", () => {
  // 真实样本:百度千帆社区页,HTTP 200、2449 字。上一版只查 len>=500,
  // 把它当成政策原文存了进去,覆盖了正常版本,还制造了一次假的「条款消失」告警。
  const shell = "Title: 千帆大模型平台安全白皮书\n\n## Something went wrong!\nTry again\n" + "关于百度智能云千帆社区 ".repeat(100)
  expect(classifyFetchResult({ ok: true, http_status: 200, text: shell })).toBe("render_error")
})

test("动态页面空壳和广告追踪跳转不是正文", () => {
  const emptySpa = "Title: Trust Center\n\nURL Source: https://trust.example.com/\n\nMarkdown Content:\n"
  const loading = "Title: Policy\n\nURL Source: https://example.com/policy\n\nWarning: This page maybe not yet fully loaded, consider explicitly specify a timeout.\n\nMarkdown Content:\n"
  const tracker = "Title: https://match.adsrvr.org/track/cmf/generic\n\nURL Source: https://example.com/terms\n\nMarkdown Content:\nA 1x1 image, likely be a tracker probe"
  const shortShell = "Title: Legal Center\n\nURL Source: https://legal.example.com/\n\nMarkdown Content:\nLegal Center\nCopyright © 2026"
  const ibmViewer = "Title: IBM Terms\n\nURL Source: https://www.ibm.com/support/customer/csol/terms/?id=Z126\n\nMarkdown Content:\n## Welcome to IBM Terms\nFilter by country"

  for (const text of [emptySpa, loading, tracker, shortShell, ibmViewer])
    expect(classifyFetchResult({ ok: true, http_status: 200, text })).toBe("render_error")
})

test("抓取层不再根据政策关键词拒绝正文", () => {
  // 文档是否权威、是否包含政策含义由 agent 判断；抓取层只保存技术上有效的正文。
  const nav = "火山方舟 二级导航功能 导航栏会按照模块拆分文档内容 " + "![Image](blob:http://localhost/abc) ".repeat(80)
  expect(classifyFetchResult({ ok: true, http_status: 200, text: nav })).toBe("fetched")
})

test("不同语言和措辞的非空正文都由 agent 判断语义", () => {
  expect(classifyFetchResult({ ok: true, http_status: 200, text: long("未经您的单独同意，火山引擎不会存储和使用您的数据来训练或优化模型。") })).toBe("fetched")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: long("We do not retain your inputs after the response is returned. ") })).toBe("fetched")
})

test("限流不能被当成内容变化", () => {
  // 这条是实测撞到的:并发抓取时 jina 返回 429,若不拦住就会让锚点误判为 gone。
  expect(classifyFetchResult({ ok: false, http_status: 429, text: "" })).toBe("http_429")
})

test("其余失败各归各类", () => {
  expect(classifyFetchResult({ ok: false, http_status: 403, text: "" })).toBe("http_403")
  expect(classifyFetchResult({ ok: false, http_status: 0, text: "" })).toBe("network_error")
  expect(classifyFetchResult({ ok: true, http_status: 200, pdf: true, text: "" })).toBe("pdf_unsupported")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: "" })).toBe("empty_response")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: "loading" })).toBe("fetched")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: long("# 404\nPage not found\n") })).toBe("not_found_page")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: long("Just a moment... verify you are human ") })).toBe("challenge_page")
  expect(classifyFetchResult({ ok: true, http_status: 200, text: "Warning: This page maybe requiring CAPTCHA, please make sure you are authorized." })).toBe("challenge_page")
})
