import { expect, test } from "bun:test"
import { anchorLost, documentChanged, titleOf, unreachable } from "../src/sync/issues"

test("标题稳定,同一个问题每天算同一个", () => {
  // 标题一变去重就失效,同一个锚点会天天开新 issue,
  // issue-fixer 陷进死循环。
  const a = titleOf("anchor-lost", "volcengine", "zdr-enterprise")
  const b = titleOf("anchor-lost", "volcengine", "zdr-enterprise")
  expect(a).toBe(b)
  expect(a).toBe("[anchor-lost] volcengine: zdr-enterprise")
})

test("anchor-lost 明确告诉 agent 不要拿旧引文当答案", () => {
  const issue = anchorLost("volcengine", "zdr-enterprise", "https://x.test/terms", "您的数据将不会被本服务留存")
  expect(issue.body).toContain("当线索,不当答案")
  expect(issue.body).toContain("不等于厂商撤销了承诺")
  expect(issue.body).toContain("您的数据将不会被本服务留存")
})

test("unreachable 明确区分抓取失败和未披露", () => {
  const issue = unreachable("aliyun", "https://x.test/dpa", ["http_429", "http_429", "network_error"])
  expect(issue.body).toContain("关于我们的事实")
  expect(issue.body).toContain("不要因为抓不到就把对应维度写成「未披露」")
})

test("document-changed 带上可复核的前后版本", () => {
  const issue = documentChanged(
    ["volcengine"],
    "https://x.test/terms",
    "old-version",
    "new-version",
    [{ kind: "added", text: "新增条款" }],
  )
  expect(issue.body).toContain("`old-version` → `new-version`")
  expect(issue.body).toContain("新增条款")
})
