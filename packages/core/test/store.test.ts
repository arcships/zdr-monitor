import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { clearFailure, readHealth, recordFailure } from "../src/sync/health"
import { currentVersion, latestVersion, putDocument, sourceId } from "../src/sync/store"
import * as toml from "../src/toml"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zdr-"))
const history = (root: string, id: string) => path.join(root, "documents", id, "history.toml")
/** 整个来源目录的逐字节快照。断言「没被改动」只能这么断言:
 *  比对文件名和大小会放过原地改写。 */
const snapshot = (root: string, id: string) =>
  fs
    .readdirSync(path.join(root, "documents", id))
    .sort()
    .map((name) => `${name}\n${fs.readFileSync(path.join(root, "documents", id, name), "utf8")}`)
    .join("\n---\n")

test("同一份正文重复抓到不产生新版本", () => {
  const root = tmp(), id = sourceId("https://x.test/terms")
  const first = putDocument(root, id, { text: "我们不会保留您的输入。", fetchedAt: "2026-09-21T00:00:00Z" })
  const again = putDocument(root, id, { text: "我们不会保留您的输入。", fetchedAt: "2026-09-22T00:00:00Z" })
  expect(first.created).toBe(true)
  expect(again.created).toBe(false)
  expect(again.changed).toBe(false)
  expect(again.version_id).toBe(first.version_id)
})

test("旧基线没有 current 指针时，同正文抓取会补齐指针", () => {
  const root = tmp(), id = sourceId("https://x.test/terms")
  const first = putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-21T00:00:00Z" })
  // 搬进来的基线只有版本记录、没有指针三件套
  const file = history(root, id)
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^(current|previous|changed_at) =.*\n/gm, ""))
  expect(fs.readFileSync(file, "utf8")).not.toContain("current =")

  const repeated = putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-22T00:00:00Z" })

  expect(repeated.changed).toBe(false)
  expect(fs.readFileSync(file, "utf8")).toContain(`current = "${first.version_id}"`)
  expect(currentVersion(root, id)?.version_id).toBe(first.version_id)
})

test("正文变了才记 supersedes", () => {
  const root = tmp(), id = sourceId("https://x.test/terms")
  const first = putDocument(root, id, { text: "我们保留您的输入 30 天。", fetchedAt: "2026-09-21T00:00:00Z" })
  const next = putDocument(root, id, { text: "我们保留您的输入 90 天。", fetchedAt: "2026-09-22T00:00:00Z" })
  expect(first.supersedes).toBe(null)
  expect(next.supersedes).toBe(first.version_id)
  expect(latestVersion(root, id)!.version_id).toBe(next.version_id)
  expect(currentVersion(root, id)!.version_id).toBe(next.version_id)
})

test("正文 A → B → A 时当前指针回到 A", () => {
  const root = tmp(), id = sourceId("https://x.test/terms")
  const a = putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-21T00:00:00Z" })
  const b = putDocument(root, id, { text: "版本 B", fetchedAt: "2026-09-22T00:00:00Z" })
  const reverted = putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-23T00:00:00Z" })
  expect(reverted.created).toBe(false)
  expect(reverted.changed).toBe(true)
  expect(reverted.supersedes).toBe(b.version_id)
  expect(currentVersion(root, id)!.version_id).toBe(a.version_id)
})

test("putDocument 拒绝空正文", () => {
  // 签名里没有「失败」这个概念。调用方拿不到把错误页写成正文的入口——
  // 上一版靠调用方记得传 text:'',忘一次 jina 的错误壳就成了政策原文。
  const root = tmp()
  expect(() => putDocument(root, "abc", { text: "", fetchedAt: "2026-09-21T00:00:00Z" })).toThrow()
})

test("失败只保留当前健康状态,恢复后清除", () => {
  const root = tmp(), id = "def456"
  const stored = putDocument(root, id, {
    text: "最后一次成功正文",
    fetchedAt: "2026-09-20T00:00:00Z",
  })
  // 只数正文:history.toml 和正文同处一个目录,但它是可变索引,不是版本本身
  const documents = () => fs.readdirSync(path.join(root, "documents", id)).filter((n) => n.endsWith(".md")).length

  recordFailure(root, id, { failed_at: "2026-09-21T00:00:00Z", verdict: "render_error", http_status: 200 })
  recordFailure(root, id, { failed_at: "2026-09-22T00:00:00Z", verdict: "http_429", http_status: 429 })
  expect(currentVersion(root, id)?.version_id).toBe(stored.version_id)
  expect(documents()).toBe(1)
  expect(readHealth(root, id)?.consecutive_failures).toBe(2)

  // 下一次成功只清掉异常状态；同一正文不会制造新版本。
  putDocument(root, id, {
    text: "最后一次成功正文",
    fetchedAt: "2026-09-23T00:00:00Z",
  })
  clearFailure(root, id)
  expect(readHealth(root, id)).toBe(null)
  expect(currentVersion(root, id)?.version_id).toBe(stored.version_id)
  expect(documents()).toBe(1)
})

test("抓取失败不改动 history.toml 和 documents/", () => {
  // 产品边界:失败的那一轮在磁盘上必须什么痕迹都不留(除了 health/)。
  // 上一版靠调用方记得传 text:'' 来表达失败,忘一次就把错误页写成了政策原文。
  const root = tmp(), id = sourceId("https://x.test/terms")
  putDocument(root, id, { text: "政策正文", fetchedAt: "2026-09-20T00:00:00Z" })
  const before = snapshot(root, id)

  recordFailure(root, id, { failed_at: "2026-09-21T00:00:00Z", verdict: "render_error", http_status: 200 })
  expect(() =>
    putDocument(root, id, { text: "", fetchedAt: "2026-09-21T00:00:00Z" }),
  ).toThrow()

  expect(snapshot(root, id)).toBe(before)
  expect(readHealth(root, id)?.consecutive_failures).toBe(1)
})

test("A → B → A 回退后 B 的 supersedes 不变", () => {
  // supersedes 是「这份正文首次出现时接替了谁」,是历史事实,写定不再动。
  // 回退只动指针；把它当成「上一版是谁」去覆盖,历史链就会自指成环。
  const root = tmp(), id = sourceId("https://x.test/terms")
  const a = putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-21T00:00:00Z" })
  const b = putDocument(root, id, { text: "版本 B", fetchedAt: "2026-09-22T00:00:00Z" })
  putDocument(root, id, { text: "版本 A", fetchedAt: "2026-09-23T00:00:00Z" })

  const saved = toml.parse(fs.readFileSync(history(root, id), "utf8")) as any
  expect(saved.current).toBe(a.version_id)
  expect(saved.previous).toBe(b.version_id)
  expect(saved.changed_at).toBe("2026-09-23T00:00:00Z")
  expect(saved.version.find((v: any) => v.id === b.version_id).supersedes).toBe(a.version_id)
  expect(saved.version.find((v: any) => v.id === a.version_id).supersedes).toBe("")
  // 回退没有制造新版本,也没有新正文文件
  expect(saved.version).toHaveLength(2)
  expect(fs.readdirSync(path.join(root, "documents", id)).filter((n) => n.endsWith(".md"))).toHaveLength(2)
})
