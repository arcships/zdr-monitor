#!/usr/bin/env bun
/** 把上一版仓库首轮抓取的正文搬过来当基线。
 *
 *  只搬,不重抓。用途是让 453 个来源里已经抓过的那部分立刻可验证:锚点能判
 *  exact/reworded/gone,详情页不再一片「等待首份快照」。
 *
 *  三条门槛,过不了的宁可留空等真实抓取:
 *    1. URL 必须完全一致——归一化匹配会把不同页面当成同一个来源
 *    2. 正文 ≥ 500 字节——旧库里混着只抓到标题的壳
 *    3. 该来源的锚点必须全部 exact 命中——命中不了的快照当基线,
 *       verify-anchors 第一轮就会报一批假 gone
 *
 *  搬进来的版本记 origin="import"。下次真实抓取覆盖它时不产 diff:
 *  两条管线的空白、导航、语言都不一样,那种差异不是政策变化。 */
import path from "node:path"
import fs from "node:fs"
import { loadSources } from "../src/sources"
import { loadAll, type Anchor } from "../src/registry"
import { putDocument, currentVersion } from "../src/sync/store"
import { resolveAnchor } from "../src/verify/anchors"

const root = path.join(import.meta.dirname, "..", "..", "..")
const [store] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const dryRun = process.argv.includes("--dry-run")
if (!store) {
  console.error("用法: bun run import:baseline <旧仓库的 store/sources 目录> [--dry-run]")
  process.exit(2)
}

interface OldDocument {
  id: string
  url: string
  text?: string
  first_seen_at: string
}

// 旧库按 URL 哈希分目录,每个目录下若干版本。只要每个 URL 最新的那一份。
const newest = new Map<string, OldDocument>()
for (const dir of fs.readdirSync(store)) {
  const full = path.join(store, dir)
  if (!fs.statSync(full).isDirectory()) continue
  for (const file of fs.readdirSync(full)) {
    if (!file.endsWith(".json")) continue
    const doc = JSON.parse(fs.readFileSync(path.join(full, file), "utf8")) as OldDocument
    const seen = newest.get(doc.url)
    if (!seen || doc.first_seen_at > seen.first_seen_at) newest.set(doc.url, doc)
  }
}

const anchorsBySource = new Map<string, Anchor[]>()
for (const { anchors } of loadAll(root))
  for (const anchor of anchors as Anchor[]) {
    const list = anchorsBySource.get(anchor.source_id)
    if (list) list.push(anchor)
    else anchorsBySource.set(anchor.source_id, [anchor])
  }

const skipped = { 没有旧快照: 0, 正文过短: 0, 没有锚点: 0, 锚点对不上: 0, 已有正文: 0 }
let imported = 0
let anchorsCovered = 0

for (const source of loadSources(root)) {
  if (currentVersion(root, source.id)) {
    skipped.已有正文++
    continue
  }
  const doc = newest.get(source.url)
  if (!doc?.text) {
    skipped.没有旧快照++
    continue
  }
  if (doc.text.length < 500) {
    skipped.正文过短++
    continue
  }
  const anchors = anchorsBySource.get(source.id) ?? []
  if (!anchors.length) {
    skipped.没有锚点++
    continue
  }
  if (!anchors.every((anchor) => resolveAnchor(anchor, doc.text!).state === "exact")) {
    skipped.锚点对不上++
    continue
  }
  if (!dryRun)
    putDocument(root, source.id, {
      text: doc.text,
      // 搬过来的正文保留它原本被抓到的时间,不冒充今天抓的
      fetchedAt: doc.first_seen_at,
      origin: "import",
    })
  imported++
  anchorsCovered += anchors.length
}

console.log(`${dryRun ? "（dry-run）" : ""}导入基线 ${imported} 个来源,覆盖 ${anchorsCovered} 个锚点`)
for (const [reason, count] of Object.entries(skipped)) if (count) console.log(`  跳过 ${reason}: ${count}`)
