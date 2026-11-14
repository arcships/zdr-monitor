import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadAll, loadProvider, writeProvider, type Anchor, type Product } from "../src/registry"

const roots: string[] = []
const tmp = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-registry-"))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

const product = (id: string): Product => ({
  id,
  training: { mark: "unknown" },
  zdr: { mark: "unknown" },
  retention: { mark: "unknown" },
  processing_region: { mark: "unknown" },
  role: { mark: "unknown" },
})

const anchor = (id: string, exact: string): Anchor => ({
  id,
  provider_id: "demo",
  source_id: "0123456789abcdef",
  topics: ["training"],
  selector: { prefix: "", exact, suffix: "" },
})

function write(root: string, id: string, products: Product[], anchors: Anchor[]) {
  writeProvider(root, id, { provider: { id, name: id }, sources: [], products, anchors })
}

test.each(["anchor", "product"] as const)("同一 provider 的重复 %s id 不能静默覆盖", (kind) => {
  const root = tmp()
  write(root, "demo",
    kind === "product" ? [product("shared"), product("shared")] : [product("api")],
    kind === "anchor" ? [anchor("shared", "First policy"), anchor("shared", "Different policy")] : [],
  )

  expect(() => loadProvider(root, "demo")).toThrow(`providers/demo.toml: 重复的 ${kind} id shared`)
})

test("不同 provider 和不同类型之间可以复用 id", () => {
  const root = tmp()
  write(root, "alpha", [product("shared")], [anchor("shared", "Alpha policy")])
  write(root, "beta", [product("shared")], [anchor("shared", "Beta policy")])

  const tree = loadAll(root)
  expect(tree.map(({ provider }) => provider.id)).toEqual(["alpha", "beta"])
  expect(tree.map(({ anchors }) => anchors[0]!.selector.exact)).toEqual(["Alpha policy", "Beta policy"])
})
