import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadChanges } from "../src/changes"

const VERSION_A = "a".repeat(64)
const VERSION_B = "b".repeat(64)
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zdr-changes-"))

function write(root: string, provider: string, name: string, overrides: Record<string, unknown> = {}) {
  const dir = path.join(root, "changes", provider)
  fs.mkdirSync(dir, { recursive: true })
  const data = {
    provider,
    dimensions: ["retention"],
    direction: "weakened",
    observed_at: "2026-09-22",
    source_id: "0123456789abcdef",
    from_version: VERSION_A,
    to_version: VERSION_B,
    summary_zh: "默认保留期从 30 天延长到 90 天。",
    summary_en: "Default retention increased from 30 to 90 days.",
    issue: "https://github.com/example/zdr/issues/1",
    ...overrides,
  }
  fs.writeFileSync(path.join(dir, name), Object.entries(data).map(([k, v]) =>
    `${k} = ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(", ")}]` : JSON.stringify(v)}`,
  ).join("\n"))
}

test("只加载 agent 已确认的变化文件，并按观察日期倒序", () => {
  const root = tmp()
  write(root, "openai", "2026-09-22-retention.toml")
  write(root, "anthropic", "2026-09-20-zdr.toml", { provider: "anthropic", observed_at: "2026-09-20" })
  expect(loadChanges(root).map((x) => x.id)).toEqual([
    "openai/2026-09-22-retention",
    "anthropic/2026-09-20-zdr",
  ])
})

test("拒绝把同一版本伪装成政策变化", () => {
  const root = tmp()
  write(root, "openai", "2026-09-22-retention.toml", { to_version: VERSION_A })
  expect(() => loadChanges(root)).toThrow("不能相同")
})

test("provider 必须与目录一致", () => {
  const root = tmp()
  write(root, "openai", "2026-09-22-retention.toml", { provider: "anthropic" })
  expect(() => loadChanges(root)).toThrow("provider 必须是 openai")
})
