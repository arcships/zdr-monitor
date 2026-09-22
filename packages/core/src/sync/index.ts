/** 抓取层。读爬取清单,抓,判,存。
 *
 *  **不认识锚点、不解释 provider 政策。** 清单里有什么就抓什么。
 *  哪些文档该在清单里是策展决定,不是运行时过滤。 */
import { classifyFetchResult, isUsable, type Verdict } from "./fetch-result"
import { fetchDocument } from "./fetch"
import { clearFailure, recordFailure } from "./health"
import { currentVersion, putDocument, readDocument, sha256 } from "./store"
import { diffDocuments, type Hunk } from "./diff"
import { loadSources, type Source } from "../sources"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface Result {
  source_id: string
  url: string
  verdict: Verdict
  bytes: number
  version_id: string | null
  /** 正文和上次不同才为 true。同一份正文重复抓到不算变化。 */
  changed: boolean
  supersedes: string | null
  /** 变了的话,完整列出行级增删。机器不判断哪些变化有政策意义；
   *  锚点只覆盖正文 1%,这是让 agent 看见「新增条款」的入口。 */
  hunks?: Hunk[]
}

export interface Report {
  started_at: string
  finished_at: string
  sources: number
  counts: Record<string, number>
  changed: Result[]
  failed: Result[]
  results: Result[]
}

async function captureOne(root: string, source: Source, dryRun: boolean): Promise<Result> {
  const fetchedAt = new Date().toISOString()
  const response = await fetchDocument(source.url)
  const verdict = classifyFetchResult(response)
  const base = { source_id: source.id, url: source.url, verdict, bytes: response.text.length }

  // 只有 fetched 能产生正文版本。失败在结构上写不进 documents/。
  if (!isUsable(verdict)) {
    if (!dryRun)
      recordFailure(root, source.id, {
        verdict,
        http_status: response.http_status,
        failed_at: fetchedAt,
        error: response.error,
      })
    return { ...base, bytes: 0, version_id: null, changed: false, supersedes: null }
  }

  if (dryRun) {
    const previous = currentVersion(root, source.id)
    const versionId = sha256(response.text)
    return {
      ...base,
      version_id: versionId,
      changed: previous?.version_id !== versionId,
      supersedes: previous?.version_id ?? null,
    }
  }

  // 先取当前正文,再移动指针。
  const previous = currentVersion(root, source.id)
  const before = previous ? readDocument(root, source.id, previous.version_id) : null
  const stored = putDocument(root, source.id, { text: response.text, fetchedAt })
  clearFailure(root, source.id)
  return {
    ...base,
    version_id: stored.version_id,
    changed: stored.changed,
    supersedes: stored.supersedes,
    hunks: stored.changed && before ? diffDocuments(before, response.text) : undefined,
  }
}

export async function sync(
  root: string,
  options: { only?: string[]; dryRun?: boolean; intervalMs?: number; sources?: Source[] } = {},
): Promise<Report> {
  const startedAt = new Date().toISOString()
  const queue = (options.sources || loadSources(root)).filter(
    (s) => !options.only?.length || options.only.some((o) => s.id === o || s.url.includes(o)),
  )
  const results: Result[] = []
  const intervalMs = options.intervalMs ?? 3100
  for (const [index, source] of queue.entries()) {
    results.push(await captureOne(root, source, !!options.dryRun))
    if (index < queue.length - 1 && intervalMs > 0) await sleep(intervalMs)
  }
  results.sort((a, b) => a.url.localeCompare(b.url))
  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    sources: queue.length,
    counts: results.reduce<Record<string, number>>((all, r) => ((all[r.verdict] = (all[r.verdict] || 0) + 1), all), {}),
    // 首次抓到不算变化,那只是我们刚开始盯它。
    changed: results.filter((r) => r.changed && r.supersedes),
    failed: results.filter((r) => !isUsable(r.verdict)),
    results,
  }
}
