import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadProvider, sourceId, writeProvider, type Source } from "../src/registry"
import { loadSources } from "../src/sources"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zdr-sources-"))
const source = (url: string, note: string): Source => ({
  id: sourceId(url),
  url,
  channel: "contract",
  tier: "core",
  note,
})

function write(root: string, id: string, sources: Source[]) {
  return writeProvider(root, id, {
    provider: { id, name: id },
    sources,
    products: [],
    anchors: [],
  })
}

test("provider 文件不重复存 source id，读取时由 URL 派生", () => {
  const root = tmp()
  const item = source("https://example.com/terms", "合同")
  const body = write(root, "example", [item])

  expect(body).not.toContain(`id = "${item.id}"`)
  expect(loadProvider(root, "example").sources).toEqual([item])
})

test("共享 URL 在全局抓取队列去重，provider 可保留各自的策展说明", () => {
  const root = tmp()
  const url = "https://example.com/terms"
  write(root, "alpha", [source(url, "适用于 alpha 产品")])
  write(root, "beta", [source(url, "适用于 beta 产品")])

  const sources = loadSources(root)
  expect(sources).toHaveLength(1)
  expect(sources[0]!.id).toBe(sourceId(url))
  expect(loadProvider(root, "beta").sources[0]!.note).toBe("适用于 beta 产品")
})

test("provider 的呈现元数据写入后能完整读回", () => {
  const root = tmp()
  writeProvider(root, "alibaba-cn", {
    provider: {
      id: "alibaba-cn",
      name: "阿里云百炼",
      name_en: "Alibaba Model Studio",
      kind: "cloud",
      homepage: "https://www.aliyun.com/product/bailian",
      company: "alibaba",
      company_name: "阿里云百炼",
    },
    sources: [],
    products: [],
    anchors: [],
  })

  expect(loadProvider(root, "alibaba-cn").provider).toMatchObject({
    kind: "cloud",
    homepage: "https://www.aliyun.com/product/bailian",
    company: "alibaba",
    company_name: "阿里云百炼",
  })
})
