import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compile } from "../src/present"
import { writeProvider, type Product, type Provider } from "../src/registry"
import * as toml from "../src/toml"

const verdict = { mark: "unknown" as const }
const product = (id: string): Product => ({
  id,
  training: verdict,
  zdr: verdict,
  retention: verdict,
  processing_region: verdict,
  role: verdict,
})

function write(root: string, provider: Provider, item: Product) {
  writeProvider(root, provider.id, { provider, sources: [], products: [item], anchors: [] })
}

test("同一公司的多个 provider 在呈现层合成一页", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-present-"))
  write(root, { id: "parent", name: "主产品", company_name: "同一家公司" }, product("api"))
  write(root, { id: "child", name: "另一站点", company: "parent" }, product("team"))

  const catalog = compile(root)
  const detail = catalog.details.get("parent")

  expect(catalog.details.size).toBe(1)
  expect(catalog.aliases.get("child")).toBe("parent")
  expect(catalog.rows.find((row) => row.provider_id === "child")?.company).toBe("parent")
  expect(detail?.name).toBe("同一家公司")
  expect(detail?.tiers.map((tier) => tier.line_id).sort()).toEqual(["child", "parent"])
})

test("合并公司的变化历史按日期倒序，同日按 id 排序", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-present-"))
  try {
    write(root, { id: "parent", name: "主产品" }, product("api"))
    write(root, { id: "child", name: "另一产品线", company: "parent" }, product("team"))
    const addChange = (provider: string, date: string, slug: string) => {
      const dir = path.join(root, "changes", provider)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, `${date}-${slug}.toml`), toml.stringify({
        provider,
        dimensions: ["zdr"],
        direction: "clarified",
        observed_at: date,
        source_id: "0123456789abcdef",
        summary_zh: "澄清零保留范围",
        summary_en: "Clarify ZDR scope",
        issue: "https://example.com/issues/1",
      }))
    }
    addChange("child", "2026-10-01", "older")
    addChange("child", "2026-11-14", "latest")
    addChange("parent", "2026-11-13", "middle")
    addChange("parent", "2026-11-14", "same-day")

    const detail = compile(root).details.get("parent")
    expect(detail?.changes.map((change) => change.id)).toEqual([
      "child/2026-11-14-latest",
      "parent/2026-11-14-same-day",
      "parent/2026-11-13-middle",
      "child/2026-10-01-older",
    ])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
