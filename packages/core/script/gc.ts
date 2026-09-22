#!/usr/bin/env bun
/** 清掉没人引用的抓取产物。
 *
 *  策展会把一些文档判为冗余（把 core 的话换个说法重复一遍、营销页），
 *  它们抓过的正文会留在 documents/ 里。留着会让人以为还在监控——
 *  而实际上下一轮 fetch 根本不会去抓它。
 *
 *  判据是「是否仍被某个 provider 声明」。研究阶段尚未写入 provider 的 baseline
 *  不在正式数据模型里；导入前不要运行 --apply。 */
import fs from "node:fs"
import path from "node:path"
import { loadSources } from "../src/sources"

const root = path.join(import.meta.dirname, "..", "..", "..")
const apply = process.argv.includes("--apply")

const needed = new Set(loadSources(root).map((source) => source.id))
let removed = 0
let bytes = 0

const base = path.join(root, "documents")
if (fs.existsSync(base))
  for (const id of fs.readdirSync(base)) {
    if (needed.has(id)) continue
    const p = path.join(base, id)
    for (const f of fs.readdirSync(p)) bytes += fs.statSync(path.join(p, f)).size
    console.log(`${apply ? "删除" : "[dry-run]"} documents/${id}`)
    if (apply) fs.rmSync(p, { recursive: true })
    removed++
  }

const health = path.join(root, "health")
if (fs.existsSync(health))
  for (const file of fs.readdirSync(health).filter((name) => name.endsWith(".toml"))) {
    if (needed.has(file.replace(/\.toml$/, ""))) continue
    const p = path.join(health, file)
    bytes += fs.statSync(p).size
    console.log(`${apply ? "删除" : "[dry-run]"} health/${file}`)
    if (apply) fs.rmSync(p)
    removed++
  }

console.log(`${apply ? "已删" : "待删"} ${removed} 项，${(bytes / 1024).toFixed(0)}KB`)
if (!apply && removed) console.log("加 --apply 执行")
