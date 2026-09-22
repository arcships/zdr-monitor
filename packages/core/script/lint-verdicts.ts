#!/usr/bin/env bun
/** 结论和它引的那句话对不对得上——确定性那一半。
 *
 *  Amp 那条错了整整一轮：原文写的是「除非你显式打开训练，否则我们不训练」，
 *  我们记成了「会训练、可退出」，方向正好反。validate 抓不到这种错，因为字段
 *  本身合法、锚点也解析得上；错的是「结论」和「引文」之间的关系。
 *
 *  这里只做词典能判死的部分：引文里出现明确的否定训练措辞，结论却说会训练，
 *  反之亦然。判不死的交给 judge.ts 里的判别器。宁可漏报也不要误报——这个脚本
 *  一旦开始喊狼来了就没人看了。 */
import path from "node:path"
import { loadAll } from "../src/registry"

const root = path.join(import.meta.dirname, "..", "..", "..")
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"))

/** 明说不训练。注意都要求「训练/train」本身出现，别拿「不会泄露」之类凑数 */
const NO_TRAIN = [
  /\b(do(es)? not|will not|never|shall not)\b[^.。]{0,60}\btrain(s|ing|ed)?\b/i,
  /\bnot (be )?used\b[^.。]{0,40}\b(to |for )?train/i,
  /不(会|将)?[^。]{0,30}(用于|用作)[^。]{0,10}(模型)?训练/,
  /不(会|将)[^。]{0,30}训练/,
  /默认不用于(模型)?训练/,
]
/** 明说会训练/会拿去改进模型。用户口径：拿来提高模型质量就算训练 */
const TRAIN = [
  /\bwe (may )?use\b[^.]{0,120}\bto (help )?(develop|train|improve)\b[^.]{0,40}\b(model|ai)/i,
  /\b(may|will|do(es)?) use\b[^.]{0,80}\bfor (model )?training\b/i,
  /\bmay use\b[^.]{0,80}\bto train\b/i,
  /\b(including|such as) (by )?(training|fine-?tuning)\b[^.]{0,80}\bmodels?\b/i,
  /用(于|作)[^。]{0,20}(模型)?训练/,
  /(用于|用来)(改进|优化|提升)[^。]{0,10}模型/,
]
/** 零保留：明说做得到 / 明说会留 */
const ZDR_YES = [
  /\bzero[- ]data[- ]retention\b|\bzero retention\b/i,
  /\b(do(es)? not|will not|never)\b[^.]{0,60}\b(retain|store|log)\b/i,
  /零(数据)?保留|不(会)?(留存|保留|存储)/,
]
/** 「谁有资格」和「这里不适用」——这两种句子本身就是判 ✗ 的正当依据，别当矛盾报 */
const ZDR_SCOPED = [
  /\bavailable (to|for)\b/i,
  /\b(does|do) not apply\b|\bonly applies\b/i,
  /不适用|仅(向|对|为)?[^，。]{0,8}企业|为企业客户(提供|开放)/,
]

const ZDR_NO = [
  /\b(retain|store|keep)s?\b[^.]{0,60}\b(for|up to)\b[^.]{0,20}\d+\s*(day|month|year)/i,
  /保留(至|到|不超过)?\s*\d+\s*(天|日|个月|年)/,
  /\bwill (retain|store)\b/i,
]

/** 有例外的措辞。引文里带了例外，结论侧就得有第二条说明例外在哪 */
const EXCEPT = /\b(unless|except|other than)\b|除非|未经您?(的)?(事先)?(同意|授权)|另行同意/i

const hit = (res: RegExp[], t: string) => res.some((r) => r.test(t))

type Issue = { id: string; kind: string; why: string; quote: string }
const issues: Issue[] = []

for (const p of loadAll(root)) {
  if (only.length && !only.includes(p.provider.id)) continue
  const anchors = new Map(p.anchors.map((a) => [a.id, a.selector.exact]))
  for (const product of p.products ?? []) {
    // 零保留列会出同一类错：Baseten 的训练档判 ✗，引的却是「Baseten adheres to a
    // Zero Data Retention posture」——读者看到的第一句原文和结论正好相反。
    const z: any = (product as any).zdr
    const zq = z?.anchor ? anchors.get(z.anchor) : undefined
    if (zq) {
      const zid = `${p.provider.id}/${(product as any).id}`
      const yes = hit(ZDR_YES, zq)
      const no = hit(ZDR_NO, zq)
      if (z.mark === "no" && yes && !no && !hit(ZDR_SCOPED, zq))
        issues.push({ id: zid, kind: "方向存疑", why: "零保留判 ✗，引的却是一句「做得到零保留」的原文", quote: zq })
      if (z.mark === "yes" && no && !yes)
        issues.push({ id: zid, kind: "方向存疑", why: "零保留判 ✓，引的却是一句「会留存多久」的原文", quote: zq })
    }

    const v = (product as any).training
    if (!v) continue
    const id = `${p.provider.id}/${(product as any).id}`
    const main = v.anchor ? anchors.get(v.anchor) : undefined
    const quotes = [v.anchor, ...(v.point ?? []).map((pt: any) => pt.anchor)]
      .filter(Boolean)
      .map((a: string) => anchors.get(a))
      .filter(Boolean) as string[]
    if (!quotes.length) {
      if (v.mark && v.mark !== "unknown")
        issues.push({ id, kind: "无引文", why: `mark=${v.mark} 却没绑任何原文`, quote: "" })
      continue
    }
    const text = quotes.join(" ")
    // 方向只认这条判定自己绑的那句；point 上挂的锚点往往正是「另一面」
    // （Warp 消费档就同时引了「隐私政策允许训练」和「企业安全页说不训练」），
    // 混在一起读只会把两句互相抵消掉。
    const basis = main ?? text
    const saysNo = hit(NO_TRAIN, basis)
    const saysYes = hit(TRAIN, basis) && !saysNo
    // 引文本身在描述「退出之后」的状态，结论记「会训练、可退出」正是这个意思
    const aboutOptOut = /opt[- ]?out|退出/i.test(basis) && v.mode === "opt_out"

    // 「不训练，除非…」这种句子，结论判「会训练」往往正是因为那个例外落在这一档上。
    // 词典分不清例外适不适用，硬喊只会淹掉真错——留给判别器。
    if (v.mark === "no" && saysNo && !hit(TRAIN, basis) && !EXCEPT.test(basis) && !aboutOptOut)
      issues.push({ id, kind: "方向存疑", why: "引文只说了「不训练」，结论却是「会训练」，而且原文没写任何例外", quote: text })
    if (v.mark === "yes" && saysYes)
      issues.push({ id, kind: "方向存疑", why: "引文说的是「会拿去训练/改进模型」，结论却是「不训练」", quote: text })
    if (v.mark === "unknown")
      issues.push({ id, kind: "unknown 却有结论性引文", why: "绑了有明确表态的原文就不该判 unknown", quote: text })
    if (v.mark === "yes" && EXCEPT.test(basis) && (v.point ?? []).length < 1)
      issues.push({ id, kind: "例外没记", why: "引文里带了 unless/except/除非，但没有一条 point 说明例外是什么", quote: text })
  }
}

if (!issues.length) {
  console.log("训练列和零保留列的结论都和引文方向一致，没有词典能判死的矛盾。")
  process.exit(0)
}
console.log(`${issues.length} 条待核：\n`)
for (const i of issues)
  console.log(`- ${i.id}  【${i.kind}】${i.why}\n  « ${i.quote.replace(/\s+/g, " ").slice(0, 180)} »`)
console.log("\n词典判不死的部分交给 bun run judge。")
process.exit(1)
