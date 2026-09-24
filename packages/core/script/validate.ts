#!/usr/bin/env bun
/** 校验台账能编译、结构完整。CI 和提交前都跑这个。 */
import path from "node:path"
import { compile } from "../src/present"
import { loadAll } from "../src/registry"
import { loadSources } from "../src/sources"
import { loadChanges } from "../src/changes"
import { readSnapshot } from "../src/snapshot"

const root = path.join(import.meta.dirname, "..", "..", "..")
const problems: string[] = []

const sources = new Map(loadSources(root).map((s) => [s.id, s]))
const tree = loadAll(root)
const providerIds = new Set(tree.map(({ provider }) => provider.id))
const sourcesByProvider = new Map(tree.map(({ provider, sources }) => [provider.id, new Set(sources.map((source) => source.id))]))
let anchors = 0
let verdicts = 0
let unanchored = 0
let unsearched = 0
const unleveled: string[] = []
const undecidedBasis: string[] = []
let undeclaredLevels = 0
const missingLevels: string[] = []

for (const { provider, sources: ownedSources, products, anchors: list } of tree) {
  const ids = new Set(list.map((a) => a.id))
  const localSources = new Set(ownedSources.map((source) => source.id))
  anchors += list.length

  for (const a of list) {
    // 锚点只能引用本 provider 声明的来源，不能借用别家的来源碰巧通过全局校验。
    if (!localSources.has(a.source_id)) problems.push(`${provider.id}: 锚点 ${a.id} 指向本 provider 未声明的来源 ${a.source_id}`)
    if (!a.selector?.exact) problems.push(`${provider.id}: 锚点 ${a.id} 没有原文摘录`)
  }

  // 档次覆盖对账：plan_levels 声明这条产品线实际有哪几档，
  // 建了几个 [[product]] 是我们收录了几档。差额就是漏收。
  if (products.some((p: any) => p.category === "coding_plan")) {
    const declared = (provider as any).plan_levels as string[] | undefined
    if (!declared) undeclaredLevels++
    else {
      const built = new Set(products.map((p: any) => p.plan_level).filter(Boolean))
      const missing = declared.filter((lv) => !built.has(lv))
      if (missing.length) missingLevels.push(`${provider.id}: 声明有 ${missing.join("/")} 档，没建对应 product`)
    }
  }

  for (const product of products) {
    // 档次缺席是待办，不是「这家没有档次」。按量 API 也分档——不分档的那些要
    // 明确写 any，否则一筛档次就整片消失，看着像这家什么都没有。
    if (!(product as any).plan_level) unleveled.push(`${provider.id}/${product.id}`)
  }

  for (const product of products)
    for (const dim of ["training", "zdr", "retention", "processing_region", "role"] as const) {
      const v: any = (product as any)[dim]
      if (!v) {
        problems.push(`${provider.id}/${product.id}: 缺 ${dim}`)
        continue
      }
      verdicts++
      // 下了结论却没给这条结论本身绑原文：可能是依据挂在 point 上（可接受），
      // 也可能是「厂商私下说的、公开文本还没写」这种临时状态。后者不盯着就会
      // 悄悄变成永久——DimAgent 第三方模型档现在就欠这一笔。
      const decided =
        v.mark === "yes" ||
        v.mark === "no" ||
        (dim === "role" && v.kind && v.kind !== "unknown") ||
        (dim === "retention" && v.basis && v.basis !== "undisclosed")
      if (decided && !v.anchor) undecidedBasis.push(`${provider.id}/${product.id}/${dim}`)
      // 悬空引用比没有引用更糟——它看起来有依据
      if (v.anchor && !ids.has(v.anchor))
        problems.push(`${provider.id}/${product.id}/${dim}: anchor ${v.anchor} 不存在`)
      if (!v.anchor) unanchored++
      // unknown 是「没找到表述」，那就得交代为这个维度查过哪里，
      // 否则和「还没查」分不开
      if (v.mark === "unknown" && !(v.searched || []).length && !(v.point || []).length)
        unsearched++
      for (const pt of v.point || [])
        if (pt.anchor && !ids.has(pt.anchor))
          problems.push(`${provider.id}/${product.id}/${dim}: 依据的 anchor ${pt.anchor} 不存在`)
    }
}

for (const change of loadChanges(root)) {
  if (!providerIds.has(change.provider)) problems.push(`${change.id}: provider ${change.provider} 不存在`)
  if (!sourcesByProvider.get(change.provider)?.has(change.source_id))
    problems.push(`${change.id}: source ${change.source_id} 不属于 provider ${change.provider}`)
  if (readSnapshot(root, change.source_id) === null)
    problems.push(`${change.id}: 来源 ${change.source_id} 还没有快照`)
}

const { rows, details, missing } = compile(root)

console.log(`${details.size} 家 · ${rows.length} 档位 · ${verdicts} 条判定 · ${anchors} 个锚点 · ${sources.size} 份文档`)
console.log(`判定绑了原文 ${verdicts - unanchored}/${verdicts}（${Math.round((100 * (verdicts - unanchored)) / verdicts)}%）`)
if (missing.length) console.log(`⚠ ${missing.length} 个格子没有结论`)
if (undeclaredLevels) console.log(`⚠ ${undeclaredLevels} 条编码订阅产品线没声明 plan_levels，分不清是没这一档还是漏收`)
for (const m of missingLevels.slice(0, 10)) console.log(`⚠ ${m}`)
if (missingLevels.length > 10) console.log(`⚠ … 另 ${missingLevels.length - 10} 条漏收`)
if (unsearched) console.log(`⚠ ${unsearched} 条 unknown 既没列 searched 也没写依据，分不清是「厂商没说」还是「还没查」`)
if (undecidedBasis.length)
  console.log(
    `⚠ ${undecidedBasis.length} 条有结论但没给结论本身绑原文（${undecidedBasis.join("、")}）`,
  )
if (unleveled.length) console.log(`⚠ ${unleveled.length} 个档位没写 plan_level（${unleveled.slice(0, 5).join("、")}${unleveled.length > 5 ? " …" : ""}）`)

if (problems.length) {
  console.error(`\n${problems.length} 个问题：`)
  for (const p of problems.slice(0, 30)) console.error("  " + p)
  if (problems.length > 30) console.error(`  … 另 ${problems.length - 30} 个`)
  process.exit(1)
}
console.log("校验通过")
