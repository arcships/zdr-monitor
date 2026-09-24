/** 呈现层:把台账 derive 成可展示的目录。
 *
 *  这一层做三件判断,都是解析而不是渲染——所以在 core 里,不在站点脚本里:
 *    1. 受控词表把结构化判定翻成人话(vocabulary.ts)
 *    2. 依据按分号拆成条目——note 本来就是几件事串在一起的
 *    3. 聚合每家被监控的文档清单——证据条目里会提到「产品协议 §12.8」,
 *       不把文档列出来就没法照着查证
 *
 *  站点只负责渲染,不做这些判断。 */
import { loadAll, type Anchor, type Product } from "../registry"
import { loadSources } from "../sources"
import { loadChanges, type PolicyChange } from "../changes"
import { snapshotDates } from "../snapshot"
import { badgeEn, composeBadge, normalizeCodes, summarize, terse } from "./vocabulary"

export const DIMENSIONS = ["training", "zdr", "retention", "processing_region", "role"] as const
export type Dimension = (typeof DIMENSIONS)[number]

export interface Verdict {
  mark?: "yes" | "no" | "unknown"
  /** 表格里的极简标签,判断题列为空串(记号本身就是答案) */
  terse: string
  terse_en: string
  mode?: string
  codes?: string[]
  /** 保留性质和协议角色也发出去：筛选要按「不留存 / 固定期限 / 未公布」和
   *  「受托处理 / 独立控制者」分桶，拿中文标签去反推等于在渲染层做判断。 */
  basis?: string
  kind?: string
}

export interface Evidence {
  /** 回答列名那个问题,带限定条件。受控词表生成 */
  summary: string
  summary_en: string
  /** unknown 时为这个维度查过哪些页面。不导出的话，「查过没找到」这句话
   *  就没法验证——读者分不清是厂商没说还是我们没查。 */
  searched?: string[]
  /** 依据,一条一条列。agent 写进 TOML 的，代码不解析 */
  points: Array<{
    text: string
    text_zh?: string
    quote?: string
    source?: { url: string; channel: string }
  }>
  quote?: string
  source?: { url: string; channel: string }
}

export interface Row {
  id: string
  provider_id: string
  name: string
  name_en?: string
  tier: string | null
  tier_en: string | null
  /** 这一行归到哪个聚合页。多数情况就是 provider_id 本身。 */
  company: string
  category: string | null
  plan_level: string | null
  cells: Record<string, Verdict>
}

export interface Detail {
  id: string
  name: string
  name_en?: string
  kind: string | null
  homepage: string | null
  endpoint: string | null
  doc: string | null
  /** 这家拆成几个 provider 文件，就有几条产品线。entity 挂在产品线上而不是公司上：
   *  同一家的国内站和国际站是不同法律实体（阿里国内站=通义云启、国际站=Alibaba Cloud
   *  Singapore），合成一个值会让采购照着错的法人签合同。挖不到就是 null。 */
  lines: Array<{ id: string; line: string; line_en: string; site: string | null; entity: string | null }>
  sources: Array<{
    source_id: string
    /** 来源属于哪条产品线；公司详情页据此分组，避免把不同站点的合同混在一起。 */
    line_id: string
    line: string
    line_en: string
    url: string
    channel: string
    note: string
    tier: string
    /** 快照正文最后一次变化的日期（来自 git 历史）。抓取失败不动快照，
     *  所以这里始终是最后一份成功抓到的原文的日期；还没有快照是 null。 */
    snapshot_at: string | null
  }>
  changes: PolicyChange[]
  /** 这一档来自哪个 provider 文件。同一家公司拆成多个文件时，
   *  标签页得写清是哪条产品线的哪个版本。 */
  tiers: Array<{
    id: string
    line_id: string
    line: string
    line_en: string
    /** 这一档的站点与签约主体，来自它所属的 provider 文件。 */
    site: string | null
    entity: string | null
    tier: string | null
    tier_en: string | null
    tier_full: string | null
    tier_full_en: string | null
    /** 品类与档次跟着档位走：外部按 category / plan_level 取数，
     *  不该逼人先去 _catalog.json 里查一遍再回来。 */
    category: string | null
    plan_level: string | null
    cells: Record<string, Verdict>
    evidence: Record<string, Evidence>
  }>
}

export interface Catalog {
  generated_at: string
  dimensions: readonly string[]
  rows: Row[]
  /** 已按 company 合并过：同一家公司拆在多个文件里的，这里只有一份，
   *  键是聚合后的 id。原来的 provider id 怎么映射到它，看 aliases。 */
  details: Map<string, Detail>
  /** provider id → 聚合后的 detail id。没配 company 的指向自己。 */
  aliases: Map<string, string>
  changes: PolicyChange[]
  monitoring: { sources: number; with_snapshot: number }
  /** 没有任何可展示结论的格子。界面上不该出现占位符,
   *  缺了是数据的问题,由这里暴露出来 */
  missing: string[]
}

function cell(product: Product, dim: Dimension) {
  const v: any = (product as any)[dim] || {}
  const [tz, te] = terse(dim, v)
  const [summary, summary_en] = summarize(dim, v)
  return {
    verdict: {
      mark: v.mark,
      terse: tz,
      terse_en: te,
      mode: v.mode,
      codes: dim === "processing_region" ? normalizeCodes(v.codes) : undefined,
      basis: dim === "retention" ? v.basis : undefined,
      kind: dim === "role" ? v.kind : undefined,
    } as Verdict,
    evidence: { summary, summary_en, searched: v.searched?.length ? v.searched : undefined, points: [] } as Evidence,
    raw: v,
    anchor: v.anchor as string | undefined,
    // 有没有结论看结构化字段，不看自由文本
    hasVerdict: !!(v.mark || v.basis || v.kind || v.codes?.length || typeof v.days === "number"),
  }
}

export function compile(root: string): Catalog {
  const sourceList = loadSources(root)
  const byId = new Map(sourceList.map((s) => [s.id, s]))
  const changes = loadChanges(root)
  const snapshotAt = snapshotDates(root)
  const changesByProvider = new Map<string, PolicyChange[]>()
  for (const change of changes)
    changesByProvider.set(change.provider, [...(changesByProvider.get(change.provider) || []), change])
  const rows: Row[] = []
  const details = new Map<string, Detail>()
  const companyOf = new Map<string, string>()
  const companyName = new Map<string, string>()
  const missing: string[] = []

  for (const { provider, sources, products, anchors } of loadAll(root)) {
    const company = provider.company || provider.id
    companyOf.set(provider.id, company)
    if (provider.company_name) companyName.set(company, provider.company_name)
    const anchorById = new Map(anchors.map((a: Anchor) => [a.id, a]))
    const sourceById = new Map(sources.map((source) => [source.id, source]))
    const tiers: Detail["tiers"] = []
    // 产品线显示名。line_id 仍是 provider id（文件身份），不跟着显示名走——
    // 同一家两条产品线可能落到同一个站点枚举值上，详情页的分组和档位过滤
    // 都靠 line_id 区分，换成 slug 会让两条线混成一组。
    const line = provider.name
    const line_en = provider.name_en || provider.name

    for (const product of products) {
      const cells: Record<string, Verdict> = {}
      const evidence: Record<string, Evidence> = {}

      for (const dim of DIMENSIONS) {
        const c = cell(product, dim)
        if (!c.hasVerdict) missing.push(`${provider.id}/${product.id}/${dim}`)
        cells[dim] = c.verdict
        const anchor = c.anchor ? anchorById.get(c.anchor) : undefined
        const source = anchor ? sourceById.get(anchor.source_id) : undefined
        // 每条依据可以绑自己的锚点；没绑的沿用维度级的
        const points = ((c.raw.point || []) as Array<{ text?: string; text_zh?: string; anchor?: string }>).map((pt) => {
          const a = pt.anchor ? anchorById.get(pt.anchor) : undefined
          const s = a ? sourceById.get(a.source_id) : undefined
          return {
            // 英文缺失时回落中文——宁可在英文界面显示中文，也好过显示空白
            text: pt.text || pt.text_zh || "",
            text_zh: pt.text_zh,
            quote: a?.selector.exact,
            source: s ? { url: s.url, channel: s.channel } : undefined,
          }
        })
        evidence[dim] = {
          ...c.evidence,
          points,
          quote: anchor?.selector.exact,
          source: source ? { url: source.url, channel: source.channel } : undefined,
        }
      }

      const id = products.length > 1 ? `${provider.id}/${product.id}` : provider.id
      // badge 从必填降成可选：站点和档次都是枚举，能拼就自动拼「国内站 · 个人版」。
      // 只在拼出来不通顺时才写 badge 覆盖——它是自由文本，一旦成为主力就会
      // 同时塞进产品线、站点、档次三件事，然后就得写个切词器去翻它。
      // 拼不出来又不止一档时回落档位 id：压掉的话表格上会出现几行一模一样的名字，
      // 读者没法知道某一行的限定条件是挂在哪一档上。
      const composed = composeBadge(product.site || provider.site, product.plan_level)
      const badge = product.badge || composed?.[0] || (products.length > 1 ? product.id : null)
      const badge_en = product.badge ? badgeEn(product.badge) : (composed?.[1] ?? (badge ? badgeEn(badge) : null))
      rows.push({
        id,
        provider_id: provider.id,
        company: provider.company || provider.id,
        category: product.category ?? null,
        plan_level: product.plan_level ?? null,
        name: provider.name,
        name_en: provider.name_en,
        tier: badge,
        tier_en: badge_en,
        cells,
      })
      tiers.push({
        id,
        line_id: provider.id,
        line,
        line_en,
        site: product.site || provider.site || null,
        entity: provider.entity || null,
        tier: badge,
        tier_en: badge_en,
        tier_full: product.label || null,
        // label 是 agent 写的适用范围说明(「按量 API(国内站,方舟大模型服务平台)」),
        // 是句子不是词组,切词翻会翻出胡话——只能等 agent 写 label_en。
        tier_full_en: product.label_en || null,
        category: product.category ?? null,
        plan_level: product.plan_level ?? null,
        cells,
        evidence,
      })
    }

    // 这家全部被监控的文档。判定只引用其中几份,但证据条目里会提到别的
    // （「产品协议 §12.8」「通用条款 §6.6」）,不列出来就没法查证。
    const docs = sources
      .map((x) => ({
        source_id: x.id,
        line_id: provider.id,
        line,
        line_en,
        url: x.url,
        channel: x.channel,
        note: x.note || "",
        note_en: x.note_en || "",
        tier: x.tier,
        snapshot_at: snapshotAt.get(x.id) ?? null,
      }))
      .sort((a, b) => a.channel.localeCompare(b.channel) || a.url.localeCompare(b.url))

    details.set(provider.id, {
      id: provider.id,
      name: provider.name,
      kind: provider.kind ?? null,
      homepage: provider.homepage ?? null,
      name_en: provider.name_en,
      endpoint: provider.endpoint || null,
      doc: provider.doc || null,
      lines: [{ id: provider.id, line, line_en, site: provider.site || null, entity: provider.entity || null }],
      sources: docs,
      changes: changesByProvider.get(provider.id) || [],
      tiers,
    })
  }

  // 同一家公司拆在多个文件里的，详情页合成一页：档位、来源、变化历史都并起来。
  // 合并发生在呈现层而不是数据层——providers/*.toml 该怎么拆还怎么拆，
  // 不同站点的引文不会因为「读者觉得是一家」就混进同一个文件。
  const merged = new Map<string, Detail>()
  const aliases = new Map<string, string>()
  for (const [id, detail] of details) {
    const target = companyOf.get(id) || id
    aliases.set(id, target)
    const head = merged.get(target)
    if (!head) {
      merged.set(target, { ...detail, id: target, name: companyName.get(target) || detail.name })
      continue
    }
    head.tiers = [...head.tiers, ...detail.tiers]
    head.changes = [...head.changes, ...detail.changes]
    const seenLine = new Set(head.lines.map((x) => x.id))
    head.lines = [...head.lines, ...detail.lines.filter((x) => !seenLine.has(x.id))]
    const seen = new Set(head.sources.map((x) => x.source_id))
    head.sources = [...head.sources, ...detail.sources.filter((x) => !seen.has(x.source_id))]
  }

  for (const detail of merged.values()) {
    detail.lines.sort((a, b) => a.line.localeCompare(b.line, "zh") || a.id.localeCompare(b.id))
    detail.tiers.sort((a, b) => a.line.localeCompare(b.line, "zh") || a.id.localeCompare(b.id))
    detail.sources.sort(
      (a, b) =>
        a.line.localeCompare(b.line, "zh") || a.channel.localeCompare(b.channel) || a.url.localeCompare(b.url),
    )
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, "zh") || a.id.localeCompare(b.id))
  const withSnapshot = sourceList.filter((source) => snapshotAt.has(source.id)).length
  return {
    generated_at: new Date().toISOString(),
    dimensions: DIMENSIONS,
    rows,
    details: merged,
    aliases,
    changes,
    monitoring: { sources: sourceList.length, with_snapshot: withSnapshot },
    missing,
  }
}
