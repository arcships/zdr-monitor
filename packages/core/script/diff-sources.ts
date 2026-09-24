#!/usr/bin/env bun
/** 比对一个 provider 的来源清单相对 base 的增删。
 *
 *  来源被删或被换是 agent 最危险的一类改动：新引文确实出现在新来源的快照里，
 *  check:quotes 全绿，却可能已经拿国内站条款替换了国际站条款。机器判断不了替换得
 *  对不对，只能把它标出来交给人。
 *
 *    bun run diff:sources <provider> [base=HEAD]   写 removed=<n> 到 GITHUB_OUTPUT，打印 markdown 提示 */
import { $ } from "bun"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "../src/toml"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [provider, base = "HEAD"] = process.argv.slice(2)
if (!provider) throw new Error("用法: diff:sources <provider> [base]")
const file = `providers/${provider}.toml`

const urls = (text: string) => new Set(((parse(text) as any).source ?? []).map((s: any) => s.url as string))
const before = await $`git show ${`${base}:${file}`}`.cwd(root).nothrow().quiet()
const was = before.exitCode === 0 ? urls(before.stdout.toString()) : new Set<string>()
const now = urls(await Bun.file(path.join(root, file)).text())
const removed = [...was].filter((u) => !now.has(u))
const added = [...now].filter((u) => !was.has(u))

if (removed.length)
  console.log(
    [
      `> [!WARNING]`,
      `> 这个 PR 删除或替换了 ${removed.length} 个已有来源，需要人工确认新来源和原来源针对的是同一档位、同一站点：`,
      ...removed.map((u) => `> - 删除 ${u}`),
      ...added.map((u) => `> - 新增 ${u}`),
      "",
    ].join("\n"),
  )
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `removed=${removed.length}\n`)
