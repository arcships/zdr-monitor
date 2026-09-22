import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveAll, resolveAnchor } from "../src/verify/anchors"
import { sourceId, writeProvider, type Anchor } from "../src/registry"
import { putDocument } from "../src/sync/store"
import { verifyAnchors } from "../src/verify"

const anchor = (selector: Anchor["selector"]): Anchor => ({
  id: "a1", provider_id: "volcengine", source_id: "s1", topics: ["zdr"], selector,
})

// 真实样本:火山方舟订阅套餐专用条款 §1.4,jina 抓回的 markdown 里带 ​。
const REAL = "相关内容和数据。​\n\n1.4 如您使用本服务企业版，包括 Coding Plan 企业版与Agent Plan 企业版，您的数据（您与本服务交互的数据）将不会被本服务留存，请您自行存储和备份。"
const SEL = {
  prefix: "1.4 如您使用本服务企业版，包括 Coding Plan 企业版与Agent Plan 企业版，",
  exact: "您的数据（您与本服务交互的数据）将不会被本服务留存",
  suffix: "，请您自行存储和备份。",
}

test("原句还在就是 exact", () => {
  expect(resolveAnchor(anchor(SEL), REAL).state).toBe("exact")
})

test("位置变了但原句还在,仍是 exact", () => {
  expect(resolveAnchor(anchor(SEL), "新增的一整节。\n\n" + REAL).state).toBe("exact")
})

test("markdown 标记不影响命中", () => {
  // direct 拿 HTML、jina 拿 markdown,同一句话的修饰符不同。
  const md = REAL.replace(SEL.exact, "**" + SEL.exact + "**")
  expect(resolveAnchor(anchor(SEL), md).state).toBe("exact")
})

test("前后文还在但中间改了词,是 reworded", () => {
  const changed = REAL.replace(SEL.exact, "您的数据将被本服务留存最长 30 天")
  const result = resolveAnchor(anchor(SEL), changed)
  expect(result.state).toBe("reworded")
  // found 要能让人看出政策改成了什么。
  expect(result.found).toContain("留存最长 30 天")
})

test("前后文都找不到,是 gone", () => {
  expect(resolveAnchor(anchor(SEL), "完全无关的一份文档。".repeat(50)).state).toBe("gone")
})

test("空 prefix 合法 — 条款在文档开头", () => {
  const sel = { prefix: "", exact: "我们不保留您的输入", suffix: "。后面还有很多内容" }
  expect(resolveAnchor(anchor(sel), "我们不保留您的输入。后面还有很多内容").state).toBe("exact")
  const changed = "我们保留您的输入 90 天。后面还有很多内容"
  expect(resolveAnchor(anchor(sel), changed).state).toBe("reworded")
})

test("空 suffix 合法 — 条款在文档结尾", () => {
  const sel = { prefix: "文档前面的内容。", exact: "我们不保留您的输入", suffix: "" }
  expect(resolveAnchor(anchor(sel), "文档前面的内容。我们不保留您的输入").state).toBe("exact")
})

test("前后文都空且原句找不到,只能判 gone", () => {
  const sel = { prefix: "", exact: "我们不保留您的输入", suffix: "" }
  expect(resolveAnchor(anchor(sel), "别的内容").state).toBe("gone")
})

test("抓取失败的源,锚点跳过而不是判 gone", () => {
  // 这是实测撞到的坑:jina 并发限流返回 HTTP 200 错误壳,
  // 不跳过就会产生假的 [anchor-lost],issue-fixer 会去「修」没坏的锚点。
  const summary = resolveAll([anchor(SEL)], new Map())
  expect(summary.skipped).toBe(1)
  expect(summary.gone).toBe(0)
  expect(summary.changes).toHaveLength(0)
})

test("汇总只报需要看的,exact 不进 changes", () => {
  const good = anchor(SEL)
  const bad = { ...anchor({ prefix: "", exact: "根本不存在的句子", suffix: "" }), id: "a2" }
  const summary = resolveAll([good, bad], new Map([["s1", REAL]]))
  expect(summary.exact).toBe(1)
  expect(summary.gone).toBe(1)
  expect(summary.changes.map((c) => c.anchor_id)).toEqual(["a2"])
})

test("所有历史版本都未命中时归为引文锚不住，不冒充政策变化", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-verify-"))
  const url = "https://example.com/policy"
  const id = sourceId(url)
  writeProvider(root, "example", {
    provider: { id: "example", name: "Example" },
    sources: [{ id, url, channel: "contract", tier: "core" }],
    products: [],
    anchors: [{ ...anchor(SEL), provider_id: "example", source_id: id }],
  })

  putDocument(root, id, { text: "首份抓取没有这条证据。", fetchedAt: "2026-09-21T00:00:00Z" })
  const baseline = verifyAnchors(root)
  expect(baseline.skipped).toBe(1)
  expect(baseline.gone).toBe(0)
  expect(baseline.changes).toHaveLength(0)

  putDocument(root, id, { text: "第二份正文仍然没有这条证据。", fetchedAt: "2026-09-22T00:00:00Z" })
  const changed = verifyAnchors(root)
  expect(changed.gone).toBe(0)
  expect(changed.unanchorable).toEqual(["example/a1"])
  expect(changed.changes).toHaveLength(0)
})

test("历史版本命中过而当前消失时才报告 gone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-verify-"))
  const url = "https://example.com/policy"
  const id = sourceId(url)
  writeProvider(root, "example", {
    provider: { id: "example", name: "Example" },
    sources: [{ id, url, channel: "contract", tier: "core" }],
    products: [],
    anchors: [{ ...anchor(SEL), provider_id: "example", source_id: id }],
  })

  putDocument(root, id, { text: REAL, fetchedAt: "2026-09-21T00:00:00Z" })
  expect(verifyAnchors(root).exact).toBe(1)

  putDocument(root, id, { text: "新版政策删除了原条款。", fetchedAt: "2026-09-22T00:00:00Z" })
  const changed = verifyAnchors(root)
  expect(changed.gone).toBe(1)
  expect(changed.unanchorable).toHaveLength(0)
  expect(changed.changes.map((change) => change.anchor_id)).toEqual(["a1"])
})
