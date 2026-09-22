#!/usr/bin/env bun
/** 把 agent 的研究产出（.verify/）导入正式记录。
 *
 *  导入后 providers/*.toml 是完整的:产品档位、五维判定、证据锚点都在里面。
 *  .verify/ 只是暂存区——agent 在那里读原文、下判断,导入后仓库自己就站得住,
 *  不依赖那批中间文件。 */
import fs from "node:fs"
import path from "node:path"
import { sourceId, writeProvider, type Anchor, type Product, type Source } from "../src/registry"
import { currentVersion, readDocument } from "../src/sync/store"
import { resolveAnchor } from "../src/verify/anchors"
import * as toml from "../src/toml"

const root = path.join(import.meta.dirname, "..", "..", "..")
const dir = path.join(root, ".verify")
const dryRun = process.argv.includes("--dry-run")
const requested = process.argv.slice(2).filter((value) => !value.startsWith("--"))
const DIMS = ["training", "zdr", "retention", "processing_region", "role"] as const
const files = fs.readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .filter((file) => {
    if (!requested.length) return true
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
    return requested.includes(data.provider_id)
  })
  .sort()

// 正式数据只能引用正式抓取器保存的正文。agent 在浏览器里看到的页面只是发现材料；
// 先抓基线,再确认 exact 能在同一份 Markdown 中命中,避免导入一批无法监控的锚点。
const preflight: string[] = []
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
  for (const source of data.sources || []) {
    if (source.verdict !== "ok" || source.tier === "drop") continue
    const sid = sourceId(source.url)
    const version = currentVersion(root, sid)
    const text = version ? readDocument(root, sid, version.version_id) : null
    if (!text) {
      preflight.push(`${data.provider_id}: ${source.url} 尚无正式抓取基线`)
      continue
    }
    for (const anchor of source.anchors || []) {
      if (!anchor.selector?.exact) continue
      const result = resolveAnchor({
        id: anchor.id,
        provider_id: data.provider_id,
        source_id: sid,
        topics: anchor.topics || [],
        selector: {
          prefix: anchor.selector.prefix ?? "",
          exact: anchor.selector.exact,
          suffix: anchor.selector.suffix ?? "",
        },
      }, text)
      if (result.state !== "exact") preflight.push(`${data.provider_id}/${anchor.id}: 引文未在正式快照中命中`)
    }
  }
}
if (preflight.length) {
  console.error(`导入前检查失败（${preflight.length}）：`)
  for (const problem of preflight.slice(0, 30)) console.error(`  ${problem}`)
  if (preflight.length > 30) console.error(`  … 另 ${preflight.length - 30} 个`)
  process.exit(1)
}

/** 显示名是人工维护的——中文厂商的官方英文名、去掉括号的规整写法，
 *  这些判断 agent 做不了。导入时保留 providers/<id>.toml 里已有的值，
 *  不另开一个数据源:provider 的信息就该在 provider 文件里。 */
function existingProvider(id: string) {
  const f = path.join(root, "providers", `${id}.toml`)
  if (!fs.existsSync(f)) return {}
  const raw = toml.parse(fs.readFileSync(f, "utf8")) as any
  return {
    name: raw.name as string | undefined,
    name_en: raw.name_en as string | undefined,
    endpoint: raw.endpoint as string | undefined,
    // 层级字段是人工维护的，而导入是覆盖写——不显式带过来就会被静默丢掉，
    // 连 company 一起丢，那会让同一家拆开的文件从详情页上散开。
    company: raw.company as string | undefined,
    company_name: raw.company_name as string | undefined,
    line: raw.line as string | undefined,
    site: raw.site as string | undefined,
    entity: raw.entity as string | undefined,
    kind: raw.kind as string | undefined,
    homepage: raw.homepage as string | undefined,
    products: (raw.product || []) as Product[],
  }
}

let providers = 0, anchors = 0, sourceCount = 0, dropped = 0, droppedTier = 0, contradictions = 0, products = 0

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
  const id = data.provider_id
  const existing = existingProvider(id)
  const kept: Anchor[] = []
  const sources = new Map<string, Source>()
  let doc = ""
  for (const source of data.sources || []) {
    // 两道闸。一、四步验证:not_policy / dead / rejected / render_error 不是政策文档。
    if (source.verdict !== "ok") { dropped++; continue }
    // 二、策展:drop 的是把 core 的话换个说法重复一遍,或营销页、操作指南。
    if (source.tier === "drop") { droppedTier++; continue }
    const sid = sourceId(source.url)
    if (source.tier === "contradiction") contradictions++
    sources.set(sid, {
      id: sid,
      url: source.url,
      channel: source.channel || "developer_data",
      tier: source.tier === "contradiction" ? "contradiction" : "core",
      note: source.tier === "contradiction" && source.contradiction_note ? source.contradiction_note : source.scope_note || "",
    })
    if (!doc) doc = source.url
    for (const anchor of source.anchors || []) {
      const sel = anchor.selector || {}
      if (!sel.exact) continue
      kept.push({
        id: anchor.id,
        provider_id: id,
        source_id: sid,
        topics: (anchor.topics || []).slice().sort(),
        selector: { prefix: sel.prefix ?? "", exact: sel.exact, suffix: sel.suffix ?? "" },
      })
    }
  }
  if (!kept.length) { console.log(`跳过 ${id}:没有可用锚点`); continue }

  const keptIds = new Set(kept.map((a) => a.id))
  const tiers = (data.products || []).length
    ? data.products.map((p: any) => ({ id: p.product, badge: p.badge, label: p.label, dims: p.dimensions || {} }))
    : [{ id: "api", badge: null, label: null, dims: data.dimensions || {} }]

  const list: Product[] = tiers.map((t: any) => {
    const verdicts: Record<string, any> = {}
    const existingProduct = existing.products?.find((product) => product.id === t.id)
    for (const dim of DIMS) {
      const d = t.dims[dim] || {}
      const v = d.verdict || {}
      const previous = existingProduct?.[dim]
      const basis = dim === "retention"
        ? d.duration_kind === "no_persistent_storage" || d.duration_kind === "no_persistent_storage_for_conversation_data"
          ? "none"
          : d.duration_kind === "termination_window_30d"
            ? "until_termination"
            : typeof v.days === "number"
              ? "fixed_period"
              : "undisclosed"
        : undefined
      verdicts[dim] = {
        // mark 只对判断题有意义;事实列靠 text 说话。
        ...(v.mark || d.status === "not_found" ? { mark: v.mark ?? "unknown" } : {}),
        ...(v.mode ? { mode: v.mode } : {}),
        ...(basis ? { basis } : {}),
        ...(typeof v.days === "number" ? { days: v.days } : {}),
        ...(v.object ? { object: v.object } : {}),
        ...(Array.isArray(v.codes) && v.codes.length ? { codes: v.codes } : {}),
        ...(v.kind ? { kind: v.kind } : {}),
        // 锚点可能因来源被 drop 而不存在,悬空引用不写进去
        ...(d.anchor_id && keptIds.has(d.anchor_id) ? { anchor: d.anchor_id } : {}),
        ...(Array.isArray(d.searched) && d.searched.length ? { searched: d.searched } : {}),
        // 研究中间格式没有 point；更新既有 provider 时保留已经人工拆好的依据，
        // 但不保留指向本轮已删除锚点的悬空引用。
        ...(previous?.point?.length
          ? { point: previous.point.filter((point) => !point.anchor || keptIds.has(point.anchor)) }
          : {}),
      }
    }
    return {
      id: t.id,
      ...(t.badge ? { badge: t.badge } : {}),
      ...(t.label ? { label: t.label } : {}),
      ...verdicts,
    } as Product
  })

  writeProvider(root, id, {
    provider: {
      id,
      name: existing.name || data.name || id,
      ...(existing.name_en || data.name_en ? { name_en: existing.name_en || data.name_en } : {}),
      // 研究产出可以补 line / site / entity（签约主体就是从合同原文里挖出来的），
      // 但已有文件里的值优先——导入不该改写人工整理过的层级字段。
      ...(existing.company || data.company ? { company: existing.company || data.company } : {}),
      ...(existing.company_name || data.company_name ? { company_name: existing.company_name || data.company_name } : {}),
      ...(existing.line || data.line ? { line: existing.line || data.line } : {}),
      ...(existing.site || data.site ? { site: existing.site || data.site } : {}),
      ...(existing.entity || data.entity ? { entity: existing.entity || data.entity } : {}),
      ...(existing.kind || data.kind ? { kind: existing.kind || data.kind } : {}),
      ...(existing.homepage || data.homepage ? { homepage: existing.homepage || data.homepage } : {}),
      endpoint: existing.endpoint || data.endpoint || "",
      doc,
    },
    sources: [...sources.values()],
    products: list,
    anchors: kept,
  }, { dryRun })
  providers++; anchors += kept.length; sourceCount += sources.size; products += list.length
}

console.log(`${dryRun ? "[dry-run] " : ""}provider ${providers} · 档位 ${products} · 来源引用 ${sourceCount} · 锚点 ${anchors}`)
console.log(`丢弃 ${dropped} 条未通过验证 · ${droppedTier} 条策展判为冗余`)
console.log(`其中 ${contradictions} 条是查清原因后仍与 core 冲突的官方表述`)
