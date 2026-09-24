import { expect, test } from "bun:test"
import { policyChanges } from "../src/snapshot/relevance"

const page = (...lines: string[]) =>
  ["# Data controls", "Some unrelated paragraph that stays exactly the same across both versions.", ...lines].join("\n")

test("页面装修不叫复核：相关文章换推荐、时间戳、侧栏", () => {
  const before = page(
    "Updated: yesterday",
    "* Data residency and inference residency for ChatGPT Learn how ChatGPT data residency and inference residency affect storage, model processing, eligibility, and supported regions.",
    "[进阶] 使用 Memory Store 构建有记忆的购物助手",
  )
  const after = page(
    "Updated: 3 days ago",
    "* ChatGPT Atlas - Data Controls and Privacy Understand ChatGPT Atlas browsing data, browser memories, privacy settings, and account data controls.",
  )
  expect(policyChanges(before, after)).toEqual([])
})

test("同一句话换缩写不叫复核", () => {
  const before = page(
    "### Zero Data Retention with Private Safety Processing",
    "Customers using Zero Data Retention with Private Safety Processing must configure customer-controlled storage and meet additional requirements described in the Zero Data Retention with Private Safety Processing guide.",
  )
  const after = page(
    "### ZDR with Private Safety Processing",
    "Customers using ZDR with PSP must configure customer-controlled storage and meet additional requirements described in the ZDR with Private Safety Processing guide.",
  )
  expect(policyChanges(before, after)).toEqual([])
})

test("期限变了要复核", () => {
  const hits = policyChanges(
    page("API inputs and outputs are retained for up to 30 days to identify abuse."),
    page("API inputs and outputs are retained for up to 60 days to identify abuse."),
  )
  expect(hits.length).toBe(2)
})

test("否定改成可以：只变了几个虚词也要复核", () => {
  const hits = policyChanges(
    page("We do not use data submitted through the API to train our models."),
    page("We may use data submitted through the API to train our models."),
  )
  expect(hits.length).toBe(2)
})

test("中文条款：不会留存改成会留存要复核", () => {
  const hits = policyChanges(
    page("您的数据（您与本服务交互的数据）将不会被本服务留存，请您自行存储和备份。"),
    page("您的数据（您与本服务交互的数据）将会被本服务留存六个月，请您知悉。"),
  )
  expect(hits.length).toBeGreaterThan(0)
})

test("新增一整节训练条款要复核", () => {
  const hits = policyChanges(page(), page("We may use your content to improve and train our foundation models unless you opt out."))
  expect(hits).toEqual(["+ We may use your content to improve and train our foundation models unless you opt out."])
})

test("挪位置不算变化", () => {
  const clause = "We will not retain any Content for longer than is necessary to provide the Service."
  expect(policyChanges(page(clause, "Another long paragraph about billing and invoices."), page("Another long paragraph about billing and invoices.", clause))).toEqual([])
})
