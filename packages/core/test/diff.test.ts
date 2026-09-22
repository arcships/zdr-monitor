import { expect, test } from "bun:test"
import { diffDocuments } from "../src/sync/diff"

test("新增的条款要被看见", () => {
  // 这是锚点看不见的场景:厂商加了一节我们没有锚点的内容。
  // 实测锚点只覆盖正文 1%,剩下 99% 全靠 diff。
  const before = "我们不会使用您的数据训练模型。\n保留期为 30 天。"
  const after = "我们不会使用您的数据训练模型。\n保留期为 30 天。\n企业客户可申请零数据保留。"
  const added = diffDocuments(before, after).filter((h) => h.kind === "added")
  expect(added).toHaveLength(1)
  expect(added[0]!.text).toContain("零数据保留")
})

test("删除的条款也要被看见", () => {
  const before = "我们不会使用您的数据训练模型。\n企业客户可申请零数据保留。"
  const after = "我们不会使用您的数据训练模型。"
  const removed = diffDocuments(before, after).filter((h) => h.kind === "removed")
  expect(removed).toHaveLength(1)
  expect(removed[0]!.text).toContain("零数据保留")
})

test("条款挪位置不算变化", () => {
  const before = "第一条内容在这里说明。\n第二条内容在这里说明。"
  const after = "第二条内容在这里说明。\n第一条内容在这里说明。"
  expect(diffDocuments(before, after)).toHaveLength(0)
})
