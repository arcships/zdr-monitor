/** 从 provider 文件汇总抓取清单。
 *
 *  来源由使用它的 provider 持有；共享 URL 在这里按 URL 派生 id 后去重。
 *  抓取层仍然只看到 URL 元数据，不知道 topics 或政策含义。 */
import { loadAll, type Source } from "./registry"

export { sourceId, type Source } from "./registry"

export function loadSources(root: string): Source[] {
  const found = new Map<string, { source: Source; owner: string }>()
  for (const { provider, sources } of loadAll(root))
    for (const source of sources) {
      const previous = found.get(source.id)
      if (!previous) {
        found.set(source.id, { source, owner: provider.id })
        continue
      }
      // note/tier 是 provider 视角下的策展信息，可以不同；抓取去重只依赖 URL。
      // 只有截断哈希碰撞才会让同一份快照对应两个 URL，必须阻断。
      if (previous.source.url !== source.url)
        throw new Error(`来源 id ${source.id} 在 ${previous.owner} 和 ${provider.id} 对应不同 URL`)
    }
  return [...found.values()].map(({ source }) => source).sort((a, b) => a.url.localeCompare(b.url))
}
