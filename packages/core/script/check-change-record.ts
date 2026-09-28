#!/usr/bin/env bun
/** 结论变了，要么有变化记录，要么明说这不是厂商的变化。
 *
 *  网站的「政策变化」时间线只读 changes/。厂商改了条款、agent 改了结论却没记一笔，时间线上就
 *  永远看不到这次变化。但结论变了不一定是厂商变了：我们补了证据、换了更权威的来源、改正旧判断，
 *  都不算（docs/judgment.md「判定不是政策变化」），不能进时间线。脚本分不清这两种，所以要求
 *  agent 二选一、明确表态：写变化记录，或者在 PR 描述里写「非厂商变化」并说明理由（--correction），
 *  由 reviewer 核实。只是把失效的引文改绑、补充说明文字，结论没变，什么都不需要。
 *
 *  结论指每一档每个维度上会影响表格的字段（mark、mode、basis、days、object、codes、kind），
 *  以及档位的增删。锚点、说明文字、searched 不算。
 *
 *    bun run check:change-record <provider> [base] [--correction]
 *  base 默认 origin/main，比较 base 与工作区。--correction：PR 已声明结论变化是我们的改正 */
import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import * as toml from "../src/toml"

const root = path.join(import.meta.dirname, "..", "..", "..")
const correction = process.argv.includes("--correction")
const [provider, base = "origin/main"] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
if (!provider) throw new Error("用法: check:change-record <provider> [base]")
$.cwd(root)

const DIMENSIONS = ["training", "zdr", "retention", "processing_region", "role"]
const FIELDS = ["mark", "mode", "basis", "days", "object", "codes", "kind"]

const conclusions = (text: string | null) => {
  const out = new Map<string, string>()
  if (text === null) return out
  for (const product of ((toml.parse(text) as any).product ?? []) as any[])
    for (const dim of DIMENSIONS) {
      const v = product[dim] ?? {}
      out.set(`${product.id}/${dim}`, JSON.stringify(FIELDS.map((f) => v[f] ?? null)))
    }
  return out
}

const file = `providers/${provider}.toml`
const old = await $`git show ${`${base}:${file}`}`.nothrow().quiet()
const before = conclusions(old.exitCode === 0 ? old.stdout.toString() : null)
const after = conclusions(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : null)
const changed = [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort()

// 新增的记录：已提交的（base 之后）和还没提交的都算
const committed = (await $`git diff --name-only --diff-filter=A ${base} -- ${`changes/${provider}/`}`.nothrow().quiet().text()).split("\n")
const pending = (await $`git ls-files --others --exclude-standard -- ${`changes/${provider}/`}`.nothrow().quiet().text()).split("\n")
const records = [...committed, ...pending].filter((f) => f.endsWith(".toml"))

if (!changed.length) console.log(`${provider}：结论没变，不需要变化记录`)
else if (records.length) console.log(`${provider}：结论变了（${changed.join("、")}），有变化记录 ${records.join("、")}`)
else if (correction) console.log(`${provider}：结论变了（${changed.join("、")}），PR 声明是我们的改正、非厂商变化，不进时间线`)
else {
  console.error(
    `${provider}：结论变了（${changed.join("、")}），但 changes/${provider}/ 下没有新的变化记录。二选一：` +
      `厂商改了条款，就按 docs/maintenance.md「变化历史」记一条（网站的政策变化时间线只读这里）；` +
      `是我们补证据、换来源、改正旧判断，就在 PR 描述的 Review notes 里写「非厂商变化」并说明理由。`,
  )
  process.exit(1)
}
