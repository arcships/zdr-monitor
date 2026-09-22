/** 筛选分面。一页表格 + 一列可勾的分面，不再靠多开一个页面来「专题」。
 *
 *  三条规矩，和 models.dev 一样：
 *    · 同一组内多选是「或」，跨组是「且」——勾了个人版和团队版，是要这两档，
 *      再勾「承诺不训练」，才是在这两档里挑承诺不训练的。
 *    · 每个选项都带计数，而且计数是「其他组已经勾完之后」还剩多少，
 *      不是全表的静态数量。点进去是空的比没这个选项更气人。
 *    · 状态全写进地址栏，一条链接就能把「企业版 + 零保留 + 中国处理」发出去。
 */
import type { Row } from "./data"

export type Selection = Record<string, string[]>

export interface Option {
  v: string
  label: [string, string]
  match: (row: Row) => boolean
}
export interface Facet {
  key: string
  label: [string, string]
  options: Option[]
}

const mark = (dim: string, want: string) => (row: Row) => row.cells[dim]?.mark === want
const EU = new Set(["EU", "DE", "NL", "IE", "FR", "PL", "SE", "FI", "GB"])
const APAC = new Set(["SG", "JP", "KR", "IN", "AU"])
const region = (test: (code: string) => boolean) => (row: Row) =>
  (row.cells.processing_region?.codes ?? []).some(test)

export const FACETS: Facet[] = [
  {
    key: "cat",
    label: ["产品类型", "Product type"],
    options: [
      { v: "coding_plan", label: ["编码订阅", "Coding plan"], match: (r) => r.category === "coding_plan" },
      { v: "api", label: ["按量 API", "Pay-as-you-go API"], match: (r) => r.category === "api" },
      { v: "web", label: ["网页端", "Web app"], match: (r) => r.category === "web" },
      { v: "self_host", label: ["自托管", "Self-hosted"], match: (r) => r.category === "self_host" },
    ],
  },
  {
    key: "plan",
    label: ["档次", "Plan tier"],
    // 选某一档时，「全档通用」那些也算数：一份不分档的开发者条款对企业客户同样
    // 生效，把它们藏起来会让人以为这家没有企业可用的东西。想单看不分档的，
    // 勾「全档通用」那一项。
    options: [
      { v: "free", label: ["免费版", "Free"], match: (r) => r.plan_level === "free" || r.plan_level === "any" },
      { v: "individual", label: ["个人版", "Individual"], match: (r) => r.plan_level === "individual" || r.plan_level === "any" },
      { v: "team", label: ["团队版", "Team"], match: (r) => r.plan_level === "team" || r.plan_level === "any" },
      { v: "enterprise", label: ["企业版", "Enterprise"], match: (r) => r.plan_level === "enterprise" || r.plan_level === "any" },
      { v: "any", label: ["全档通用", "All tiers"], match: (r) => r.plan_level === "any" },
    ],
  },
  {
    key: "training",
    label: ["不用于训练", "No training"],
    options: [
      { v: "yes", label: ["有承诺", "Committed"], match: mark("training", "yes") },
      { v: "no", label: ["会训练", "Trains on your data"], match: mark("training", "no") },
      { v: "unknown", label: ["未公开", "Not disclosed"], match: mark("training", "unknown") },
    ],
  },
  {
    key: "zdr",
    label: ["零保留", "Zero retention"],
    options: [
      { v: "yes", label: ["可零保留", "Available"], match: mark("zdr", "yes") },
      { v: "no", label: ["明示留存", "Retained"], match: mark("zdr", "no") },
      { v: "unknown", label: ["未公开", "Not disclosed"], match: mark("zdr", "unknown") },
    ],
  },
  {
    key: "region",
    label: ["处理地", "Processing region"],
    options: [
      { v: "CN", label: ["中国", "China"], match: region((c) => c === "CN") },
      { v: "US", label: ["美国", "United States"], match: region((c) => c === "US") },
      { v: "EU", label: ["欧洲", "Europe"], match: region((c) => EU.has(c)) },
      { v: "APAC", label: ["其他亚太", "Other APAC"], match: region((c) => APAC.has(c)) },
      { v: "selected", label: ["可选地域", "Customer-selected"], match: region((c) => c === "selected") },
      { v: "global", label: ["全球不定", "Global"], match: region((c) => c === "global") },
    ],
  },
  {
    key: "retention",
    label: ["保留期限", "Retention"],
    options: [
      { v: "none", label: ["不留存", "None"], match: (r) => r.cells.retention?.basis === "none" },
      { v: "fixed_period", label: ["固定期限", "Fixed period"], match: (r) => r.cells.retention?.basis === "fixed_period" },
      { v: "until_termination", label: ["至服务终止", "Until termination"], match: (r) => r.cells.retention?.basis === "until_termination" },
      { v: "as_needed", label: ["按需保留", "As needed"], match: (r) => r.cells.retention?.basis === "as_needed" },
      { v: "undisclosed", label: ["未公布", "Undisclosed"], match: (r) => r.cells.retention?.basis === "undisclosed" },
    ],
  },
  {
    key: "role",
    label: ["合同角色", "Contract role"],
    options: [
      { v: "processor", label: ["受托处理", "Processor"], match: (r) => r.cells.role?.kind === "processor" },
      { v: "subprocessor", label: ["次级受托", "Sub-processor"], match: (r) => r.cells.role?.kind === "subprocessor" },
      { v: "controller", label: ["独立控制者", "Controller"], match: (r) => r.cells.role?.kind === "controller" },
      { v: "unknown", label: ["未约定", "Not defined"], match: (r) => !r.cells.role?.kind || r.cells.role.kind === "unknown" },
    ],
  },
]

const passes = (facet: Facet, sel: Selection, row: Row) => {
  const picked = sel[facet.key]
  if (!picked?.length) return true
  return facet.options.some((o) => picked.includes(o.v) && o.match(row))
}

export function apply(rows: Row[], sel: Selection, needle: string): Row[] {
  const q = needle.trim().toLowerCase()
  return rows.filter((row) => {
    if (
      q &&
      !row.name.toLowerCase().includes(q) &&
      !row.provider_id.includes(q) &&
      !(row.tier ?? "").toLowerCase().includes(q) &&
      !(row.name_en ?? "").toLowerCase().includes(q)
    )
      return false
    return FACETS.every((f) => passes(f, sel, row))
  })
}

/** 计数排除自己这一组：勾「个人版」之后，档次那一组仍然要显示「团队版还有几条」，
 *  否则一勾就把别的选项归零，看起来像没得选了。 */
export function counts(rows: Row[], sel: Selection, needle: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const facet of FACETS) {
    const rest: Selection = { ...sel, [facet.key]: [] }
    const base = apply(rows, rest, needle)
    out[facet.key] = Object.fromEntries(facet.options.map((o) => [o.v, base.filter(o.match).length]))
  }
  return out
}

export const parse = (query: Record<string, any>): Selection =>
  Object.fromEntries(
    FACETS.map((f) => [f.key, typeof query[f.key] === "string" && query[f.key] ? query[f.key].split(",") : []]),
  )

export const toQuery = (sel: Selection): Record<string, string> =>
  Object.fromEntries(Object.entries(sel).filter(([, v]) => v.length).map(([k, v]) => [k, v.join(",")]))

export const activeCount = (sel: Selection) => Object.values(sel).reduce((n, v) => n + v.length, 0)
