#!/usr/bin/env bun
/** 把编译好的目录导出成站点吃的 JSON。
 *
 *  这个脚本只做导出——判断都在 src/present/ 里。分开导出是因为
 *  实测 94% 的体积是说明和原文,首页根本用不上:
 *    _catalog.json  只有判定,构建时内联进 bundle
 *    _changes.json  agent 已确认的变化时间线
 *    p/<id>.json    单家详情,点进去才拉
 *    api.json       全量,给外部消费
 *
 *  api.json 照 models.dev 的约定来:顶层就是对象,键是厂商 id,不套 envelope,
 *  一次 fetch 之后全是按 id 直取。它和站点自己吃的那几个文件分开——站点要的是
 *  「一行一个档位」的扁平表，外部消费要的是「按厂商和档位钻取」。 */
import fs from "node:fs"
import path from "node:path"
import { compile } from "../src/present"

const root = path.join(import.meta.dirname, "..", "..", "..")
const out = path.join(root, "packages/web/public")
const { generated_at, dimensions, rows, details, aliases, changes, monitoring, missing } = compile(root)

fs.mkdirSync(path.join(out, "p"), { recursive: true })
const write = (file: string, value: unknown) => fs.writeFileSync(path.join(out, file), JSON.stringify(value))

write("_catalog.json", { generated_at, dimensions, rows, monitoring })
for (const [id, detail] of details) write(`p/${id}.json`, { generated_at, dimensions, ...detail })
for (const [id, target] of aliases) if (id !== target) write(`p/${id}.json`, { alias: target })
write("_changes.json", { generated_at, changes })
// 顶层键是厂商 id，值里 plans 的键是档位 id——两层都能直取，别让人先 filter 一遍
const api: Record<string, unknown> = {}
for (const [id, detail] of details) {
  const plans: Record<string, unknown> = {}
  for (const tier of detail.tiers) {
    const dims: Record<string, unknown> = {}
    for (const dim of dimensions) {
      const cell = tier.cells[dim]
      const evidence = tier.evidence[dim]
      if (!cell && !evidence) continue
      dims[dim] = {
        ...cell,
        summary: evidence?.summary,
        summary_en: evidence?.summary_en,
        quote: evidence?.quote,
        source: evidence?.source,
        searched: evidence?.searched,
        points: evidence?.points?.length ? evidence.points : undefined,
      }
    }
    plans[tier.id] = {
      id: tier.id,
      line: tier.line,
      line_en: tier.line_en,
      tier: tier.tier,
      tier_en: tier.tier_en,
      site: tier.site,
      entity: tier.entity,
      category: tier.category,
      plan_level: tier.plan_level,
      ...dims,
    }
  }
  api[id] = {
    id,
    name: detail.name,
    name_en: detail.name_en,
    kind: detail.kind,
    homepage: detail.homepage,
    doc: detail.doc,
    lines: detail.lines,
    sources: detail.sources.map((source) => ({
      id: source.source_id,
      url: source.url,
      channel: source.channel,
      line: source.line,
      current_version: source.current_version,
      observed_at: source.version_observed_at,
    })),
    changes: detail.changes,
    plans,
  }
}
write("api.json", api)
write("_meta.json", { generated_at, dimensions, monitoring, changes })

const size = (f: string) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0)
console.log(`${rows.length} 行 · ${details.size} 家`)
console.log(`_catalog.json ${size("_catalog.json")}KB（内联）· ${details.size} 份详情 · api.json ${size("api.json")}KB`)
console.log(`${changes.length} 条已确认变化 · ${monitoring.with_snapshot}/${monitoring.sources} 个来源有快照 · ${monitoring.failing} 个异常`)
if (missing.length)
  console.log(`⚠ ${missing.length} 个格子没有结论：${missing.slice(0, 6).join(" ")}${missing.length > 6 ? " …" : ""}`)
