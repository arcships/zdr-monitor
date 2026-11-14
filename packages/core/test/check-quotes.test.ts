import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { sourceId, writeProvider } from "../src/registry"

const roots: string[] = []
const script = path.resolve(import.meta.dirname, "../script/check-quotes.ts")
const snapshot = path.resolve(import.meta.dirname, "../src/snapshot/index.ts")

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

function check(options: { prefix?: string; exact?: string; noSnapshot?: boolean }, args: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-check-quotes-"))
  roots.push(root)
  const url = "https://example.com/policy"
  const id = sourceId(url)
  writeProvider(root, "demo", {
    provider: { id: "demo", name: "demo" },
    sources: [{ id, url, channel: "contract", tier: "core" }],
    products: [],
    anchors: [{
      id: "policy",
      provider_id: "demo",
      source_id: id,
      topics: ["zdr"],
      selector: { prefix: options.prefix || "", exact: options.exact || "We do not store data", suffix: "" },
    }],
  })
  if (!options.noSnapshot) {
    fs.mkdirSync(path.join(root, "snapshots"))
    fs.writeFileSync(path.join(root, "snapshots", `${id}.md`),
      "Personal: We do not store data. Enterprise: We do not store data.")
  }

  // 单独进程运行真实 CLI；只把数据根目录切到 fixture，避免 mock 影响其他测试。
  const bootstrap = `
    import { mock } from "bun:test";
    import { checkQuotes } from ${JSON.stringify(snapshot)};
    const realCheckQuotes = checkQuotes;
    mock.module(${JSON.stringify(snapshot)}, () => ({
      checkQuotes: (_root, only) => realCheckQuotes(${JSON.stringify(root)}, only),
    }));
    process.argv = [process.execPath, ${JSON.stringify(script)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(script)});
  `
  const result = Bun.spawnSync([process.execPath, "--eval", bootstrap], { timeout: 10000 })
  return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() }
}

test.each([false, true])("strict 拒绝无法唯一定位的引文（markdown=%s）", (markdown) => {
  const args = markdown ? ["--md"] : []
  const result = check({}, ["demo", "--strict", ...args])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain("ambiguous 1")
  expect(result.output).toContain("demo/policy")
})

test("strict 接受用上下文唯一定位的引文", () => {
  const result = check({ prefix: "Enterprise:" }, ["demo", "--strict"])
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain("ok 1")
})

test("strict 继续拒绝缺失引文", () => {
  const result = check({ exact: "We retain all data" }, ["demo", "--strict"])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain("missing 1")
})

test("strict 对尚无快照的来源保留非阻断行为", () => {
  const result = check({ noSnapshot: true }, ["demo", "--strict"])
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain("no_snapshot 1")
})

test("非 strict 模式报告歧义但不阻断", () => {
  const result = check({}, ["demo"])
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain("ambiguous 1")
  expect(result.output).toContain("demo/policy")
})
