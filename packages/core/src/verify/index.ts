/** 锚点校验层。读已保存的正文,判锚点三态。
 *
 *  **完全独立于抓取层。** 不发请求、不碰网络、不接收抓取层的任何传参。
 *  两层唯一的接口是磁盘上的 documents/ 和异常 health/。
 *
 *  所以它可以在没网的情况下跑,可以对历史版本重放,
 *  抓取挂了也不影响它判断已有数据。 */
import { loadAll } from "../registry"
import { readHealth } from "../sync/health"
import { currentVersion, listVersions, readDocument } from "../sync/store"
import { resolveAll, resolveAnchor, type AnchorSummary } from "./anchors"

export type { AnchorSummary, Resolution } from "./anchors"

export interface VerifyReport extends AnchorSummary {
  at: string
  providers: number
  anchors: number
  /** 最近一次抓取没成功的源。它们的锚点不参与判定。 */
  stale: string[]
  /** 引文在这个来源的所有历史快照里一次都没命中过——引文本身不可锚定，
   *  不是政策变化。agent 要么换一个抓得到这句话的来源，要么换一条依据。 */
  unanchorable: string[]
}

export function verifyAnchors(root: string, options: { only?: string[]; replay?: boolean } = {}): VerifyReport {
  const providers = loadAll(root).filter((p) => !options.only?.length || options.only.includes(p.provider.id))
  const anchors = providers.flatMap((p) => p.anchors)

  const documents = new Map<string, string>()
  const stale: string[] = []
  for (const sourceId of new Set(anchors.map((a) => a.source_id))) {
    // replay 模式忽略当前健康状态,直接用已存的当前正文。
    // 用于改了定位算法后对历史数据重跑,不需要联网。
    if (!options.replay && readHealth(root, sourceId)) {
      stale.push(sourceId)
      continue
    }
    const version = currentVersion(root, sourceId)
    if (!version) {
      stale.push(sourceId)
      continue
    }
    const text = readDocument(root, sourceId, version.version_id)
    if (text) documents.set(sourceId, text)
    else stale.push(sourceId)
  }

  const summary = resolveAll(anchors, documents)

  // 「条款找不到了」和「这句话从来就没在快照里出现过」是两回事：
  // 前者是政策变化，要开 issue 找 agent 复核；后者是引文本身有问题——
  // 常见于客户端渲染的 FAQ，agent 在浏览器里看得到，jina 抓下来的正文里没有，
  // 于是锚点从诞生起就无法命中。把后者报成 gone 会让 agent 去查一个
  // 根本没发生过的政策变化。
  //
  // 判据是「有没有在这个来源的任何一个历史版本里命中过」，不是版本数量：
  // 曾经命中过又不命中了 = 真变化；一次都没命中过 = 引文不可锚定。
  const anchorById = new Map(anchors.map((a) => [`${a.provider_id}/${a.id}`, a]))
  const baselineMismatch = new Set(
    summary.changes
      .filter((change) => {
        const anchor = anchorById.get(`${change.provider_id}/${change.anchor_id}`)
        if (!anchor) return false
        return !listVersions(root, change.source_id).some((version) => {
          const text = readDocument(root, change.source_id, version.version_id)
          return text ? resolveAnchor(anchor, text).state === "exact" : false
        })
      })
      .map((change) => `${change.provider_id}/${change.anchor_id}`),
  )
  const changes = summary.changes.filter((change) => !baselineMismatch.has(`${change.provider_id}/${change.anchor_id}`))

  return {
    at: new Date().toISOString(),
    providers: providers.length,
    anchors: anchors.length,
    stale,
    unanchorable: [...baselineMismatch],
    ...summary,
    reworded: changes.filter((change) => change.state === "reworded").length,
    gone: changes.filter((change) => change.state === "gone").length,
    skipped: summary.skipped + baselineMismatch.size,
    changes,
  }
}
