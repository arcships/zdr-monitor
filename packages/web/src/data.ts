/** 数据按用途拆分，照 models.dev 的做法：
 *    _catalog.json  只有判定，构建时 import 进 bundle——首页不该为 5 个 ✓/✗ 拉 780KB
 *    _changes.json  agent 已确认的变化时间线
 *    p/<id>.json    单家详情：说明、原文摘录、来源。占 94% 体积，点进去才拉
 */
import catalogJson from "../public/_catalog.json"
import changesJson from "../public/_changes.json"

export type Mark = "yes" | "no" | "unknown"

export interface Verdict {
  mark?: Mark
  /** 表格显示的极简标签，纯 ✓/✗ 的列是空串 */
  terse: string
  terse_en?: string
  mode?: string
  codes?: string[]
  basis?: string
  kind?: string
}

export interface Row {
  id: string
  provider_id: string
  company: string
  name: string
  name_en?: string
  tier: string | null
  tier_en: string | null
  category: string | null
  plan_level: string | null
  cells: Record<string, Verdict>
}

export interface Evidence {
  /** 受控词表生成的完整结论。表格用 terse，详情用它 */
  summary?: string
  summary_en?: string
  /** unknown 时为这个维度查过哪些页面 */
  searched?: string[]
  /** 依据，一条一条列。agent 写进 TOML 的，代码不解析 */
  points?: Array<{
    text: string
    text_zh?: string
    quote?: string
    source?: { url: string; channel: string }
  }>
  quote?: string
  source?: { url: string; channel: string }
}

export interface Detail {
  id: string
  name: string
  name_en?: string
  kind: string | null
  homepage: string | null
  endpoint: string | null
  doc: string | null
  /** 一家拆成几个 provider 文件就有几条产品线。签约主体挂在产品线上——
   *  同一家的国内站和国际站是不同法人，合成一个值会让采购照错的法人签合同。 */
  lines: Array<{ id: string; line: string; line_en: string; site: string | null; entity: string | null }>
  /** 这家全部被监控的文档。判定只引用其中几份，但证据条目里会提到别的
   *  （「产品协议 §12.8」「通用条款 §6.6」），不列出来就没法查证。 */
  sources: Array<{
    source_id: string
    line_id: string
    line: string
    line_en: string
    url: string
    channel: string
    note: string
    note_en: string
    tier: string
    snapshot_at: string | null
  }>
  changes: PolicyChange[]
  dimensions: string[]
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
    category: string | null
    plan_level: string | null
    cells: Record<string, Verdict>
    evidence: Record<string, Evidence>
  }>
}

export const catalog = catalogJson as {
  generated_at: string
  dimensions: string[]
  rows: Row[]
  monitoring: { sources: number; with_snapshot: number }
}

export type ChangeDirection = "weakened" | "strengthened" | "clarified"
export interface PolicyChange {
  id: string
  provider: string
  dimensions: string[]
  direction: ChangeDirection
  observed_at: string
  effective_at?: string
  source_id: string
  summary_zh: string
  summary_en: string
  issue: string
}

export const changes = (changesJson as { changes: PolicyChange[] }).changes

export const DIRECTION: Record<ChangeDirection, [string, string]> = {
  weakened: ["承诺减弱", "Weakened"],
  strengthened: ["承诺增强", "Strengthened"],
  clarified: ["表述澄清", "Clarified"],
}

const cache = new Map<string, Promise<Detail | null>>()
export function detail(id: string) {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(`${import.meta.env.BASE_URL}p/${id}.json`)
        .then(async (r) => {
          if (!r.ok) return null
          const value = (await r.json()) as Detail | { alias: string }
          return "alias" in value ? detail(value.alias) : value
        })
        .catch(() => null),
    )
  return cache.get(id)!
}

/** 表格列名。✓ 表示对用户有利,所以列名要让 ✓ 读起来是对的:
 *  「不用于训练」配 ✓ 才是「是的不训练」。 */
export const LABELS: Record<string, [string, string]> = {
  training: ["不用于训练", "Doesn't train"],
  zdr: ["零保留", "Zero retention"],
  retention: ["保留", "Retention"],
  processing_region: ["处理地", "Processing region"],
  role: ["协议角色", "Contract role"],
}

/** 详情页的列名是问句,配「是/否 + 限定」的完整回答。
 *  问句与 mark=yes 的有利语义保持一致。 */
export const QUESTIONS: Record<string, [string, string]> = {
  training: ["是否承诺不用于训练？", "Committed not to use data for training?"],
  zdr: ["能否零保留？", "Zero data retention?"],
  retention: ["保留多久？", "Retention"],
  processing_region: ["在哪处理？", "Processing region"],
  role: ["协议角色", "Contract role"],
}

/** 列宽按内容实测定死。极简标签后最长只有 6-7 字 */
export const WIDTHS: Record<string, string> = {
  training: "128px",
  zdr: "132px",
  retention: "116px",
  processing_region: "140px",
  role: "96px",
}

/** 两列是判断题，只画 ✓/✗；其余是事实描述，显示值 */
export const BOOLEAN_DIMS = new Set(["training", "zdr"])

export const MODE: Record<string, [string, string]> = {
  default: ["默认", "By default"],
  opt_in: ["自助开通", "Self-serve"],
  by_agreement: ["需申请", "On request"],
  by_deployment: ["部署形态使然", "By deployment"],
}
/** 表格里的零保留获取方式。「默认就有」和「要申请」对采购是两回事，
 *  单字太隐晦，用最短的完整词 */
export const MODE_SHORT: Record<string, [string, string]> = {
  default: ["默认", "default"],
  opt_in: ["自助", "self-serve"],
  by_agreement: ["申请", "on request"],
  by_deployment: ["部署形态", "by deployment"],
}

/** 厂商角色。聚合网关和转售商的承诺盖不住上游，标出来读者才知道结论要怎么打折 */
export const KIND: Record<string, [string, string]> = {
  model_vendor: ["自研模型", "Model vendor"],
  cloud: ["云平台", "Cloud platform"],
  aggregator: ["聚合网关", "Gateway"],
  reseller: ["转售", "Reseller"],
  self_host: ["自托管", "Self-hosted"],
}

export const CHANNEL: Record<string, [string, string]> = {
  contract: ["合同条款", "Contract"],
  developer_data: ["开发者文档", "Developer docs"],
  enterprise_privacy_faq: ["企业隐私 FAQ", "Enterprise privacy FAQ"],
  consumer_privacy: ["隐私政策", "Privacy policy"],
  official_blog: ["官方页面", "Official page"],
  trust_center: ["信任中心", "Trust center"],
  third_party: ["第三方", "Third party"],
}

/** 编码工具页按采购档次分组。数据里只存稳定枚举，展示不泄露 snake_case。 */
export const PLAN_LEVEL: Record<string, [string, string]> = {
  individual: ["个人版", "Individual"],
  team: ["团队版", "Team"],
  enterprise: ["企业版", "Enterprise"],
  free: ["免费版", "Free"],
  any: ["全档通用", "All tiers"],
}

/** ✓ 表示「对用户有利」。
 *  training 问的是「会不会拿你的输入去训练」，所以 no 才是好事。
 *  zdr 问的是「能不能零保留」，yes 是好事。 */
export function good(dim: string, mark?: Mark): boolean | null {
  if (!mark || mark === "unknown") return null
  // 五个维度统一：yes 就是对用户有利。
  // 以前 training 是反的（mark 回答「会不会训练」，列名问的却是「不用于训练」），
  // 人看反一次、agent 写反一次就是一条错数据。
  return mark === "yes"
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}
