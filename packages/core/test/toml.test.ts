import { expect, test } from "bun:test"
import * as toml from "../src/toml"

const anchor = {
  source_id: "9fa678c2f42aae99",
  topics: ["retention", "zdr"],
  selector: {
    prefix: "相关内容和数据。​\n\n1.4 如您使用本服务企业版，包括 Coding Plan 企业版与Agent Plan 企业版，",
    exact: "您的数据（您与本服务交互的数据）将不会被本服务留存",
    suffix: "，请您自行存储和备份。",
  },
}

test("序列化是确定性的", () => {
  // 整个按实体分文件的设计建立在「政策变了 = 三行 diff」上。
  // 格式一抖动,diff 就被噪声淹没,收益就没了。
  const a = toml.stringify(anchor)
  const b = toml.stringify(toml.parse(a))
  const c = toml.stringify(toml.parse(b))
  expect(b).toBe(a)
  expect(c).toBe(b)
})

test("含换行的字符串用多行形式,原文在 diff 里可读", () => {
  const out = toml.stringify(anchor)
  expect(out).toContain('prefix = """')
  expect(out).toContain("exact = \"您的数据（您与本服务交互的数据）将不会被本服务留存\"")
})

test("零宽空格等不可见字符原样保留", () => {
  // 锚点必须逐字取自正文。jina 的 markdown 里带 ​,
  // 归一化会在匹配时处理,但存储必须保真。
  const parsed = toml.parse(toml.stringify(anchor)) as unknown as typeof anchor
  expect(parsed.selector.prefix).toBe(anchor.selector.prefix)
})

test("标量先于子表,否则会被吞进子表", () => {
  const out = toml.stringify({ a: 1, t: { x: 1 }, b: 2 })
  expect(out.indexOf("b = 2")).toBeLessThan(out.indexOf("[t]"))
})

test("多行字符串里的控制字符必须转义", () => {
  // 真实样本:jina 抓回的 markdown 正文里带控制字符。
  // 漏掉这一步会写出读不回来的 TOML——这个 bug 在 91 家入库时才暴露,
  // 因为早期测试数据恰好不含控制字符。
  const value = { note: "第一行\n带控制字符\u0001和\u0007的\n第三行" }
  const out = toml.stringify(value)
  expect(toml.parse(out).note).toBe(value.note)
  expect(toml.stringify(toml.parse(out))).toBe(out)
})

test("多行字符串里的连续引号不会提前终止", () => {
  const value = { note: "他说\"\"\"这是引用\"\"\"\n然后结束于引号\"" }
  const out = toml.stringify(value)
  expect(toml.parse(out).note).toBe(value.note)
})

test("换行和制表符在多行形式里保持字面", () => {
  // 这正是用多行形式的意义:diff 里能直接读原文。
  const out = toml.stringify({ note: "第一行\n\t缩进的第二行" })
  expect(out).toContain("\n\t缩进的第二行")
  expect(out).not.toContain("\\n")
})
