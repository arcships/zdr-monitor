import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { compile } from "../src/present"
import { writeProvider, type Product, type Provider } from "../src/registry"

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
