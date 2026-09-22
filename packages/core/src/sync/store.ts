/** 一个来源一个目录,正文和元数据放在一起:
 *    documents/<sid>/<version_id>.md   抓到的正文,不可变,内容寻址
 *    documents/<sid>/history.toml      版本记录 + 当前版本指针,本目录唯一可变的文件
 *
 *  上一版把元数据单独放在 versions/ 下,于是一次成功抓取要写两棵树三个文件。
 *  中途断电就留下「有正文没记录」或「指针指向不存在的版本」的半成品,而这两棵树
 *  又永远一起被读、一起被 gc、一起被提交——分开只换来了多一份要对齐的状态。
 *
 *  抓取运行日志属于 CI 观测,不进入产品数据。来源连续失败时只在 health/
 *  保存一份当前异常状态,恢复后删除。 */
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import * as toml from "../toml"

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")
export const sourceId = (url: string) => sha256(url).slice(0, 16)

/** url / bytes / source_id 不在这里:它们分别等于 sources 表里按 id 查到的 URL、
 *  .md 的文件大小、目录名。存一份派生值,就得回答它和真值对不上时听谁的——
 *  而真值随时可用,这个问题不值得存在。 */
export interface VersionRecord {
  version_id: string
  first_seen_at: string
  supersedes: string
  /** fetch = 本仓库抓的；import = 从上一版仓库的首轮抓取搬过来的基线。
   *  只是出处记录,不参与任何判断——抓取、diff、锚点都一视同仁。 */
  origin: "fetch" | "import"
}

/** history.toml 的磁盘形状。version_id 在这里叫 id:它已经是 [[version]]
 *  这张表的主键,再叫一遍 version 是噪音。 */
interface Entry {
  id: string
  first_seen_at: string
  supersedes: string
  origin: "fetch" | "import"
}

interface History {
  /** 最近一次成功抓到的正文。空串 = 这个来源还没有基线。 */
  current: string
  previous: string
  changed_at: string
  version: Entry[]
}

const historyFile = (root: string, id: string) => path.join(root, "documents", id, "history.toml")

function writeAtomic(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temp, body)
  fs.renameSync(temp, file)
}

function readHistory(root: string, id: string): History | null {
  const file = historyFile(root, id)
  if (!fs.existsSync(file)) return null
  const raw = toml.parse(fs.readFileSync(file, "utf8")) as Partial<History>
  // 指针三件套按缺失处理,不按损坏处理:搬进来的基线可能只有版本记录。
  // 有正文就该能读到正文,不能因为少一个指针把整个来源判成没有基线。
  return {
    current: raw.current ?? "",
    previous: raw.previous ?? "",
    changed_at: raw.changed_at ?? "",
    version: raw.version ?? [],
  }
}

const records = (history: History): VersionRecord[] =>
  history.version
    .map((v) => ({ version_id: v.id, first_seen_at: v.first_seen_at, supersedes: v.supersedes, origin: v.origin }))
    .sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at))

/** 当前版本是最近一次成功抓到的内容,不是最后一次首次出现的内容。
 *
 * 页面可能 A → B → A。A 的不可变快照已经存在,但第三次抓取仍然是一次真实
 * 回退；只按 first_seen_at 排序会错误地继续把 B 当成当前正文。
 * 没有指针时只能退回这个猜测——那是搬进来的基线才会有的状态。 */
const currentOf = (history: History): VersionRecord | null => {
  const all = records(history)
  return (history.current ? all.find((v) => v.version_id === history.current) : all.at(-1)) ?? null
}

export function listVersions(root: string, id: string): VersionRecord[] {
  const history = readHistory(root, id)
  return history ? records(history) : []
}

export const latestVersion = (root: string, id: string) => listVersions(root, id).at(-1) ?? null

export function currentVersion(root: string, id: string): VersionRecord | null {
  const history = readHistory(root, id)
  return history ? currentOf(history) : null
}

/** 签名里没有「失败」这个概念。调用方拿不到把错误页写成正文的入口。
 *
 *  上一版的 saveObservation 同时管两件事,靠 result.text 是否为空隐式决定,
 *  调用方必须记得失败时传 text:''。忘一次,jina 的错误壳就成了政策原文。 */
export function putDocument(
  root: string,
  id: string,
  input: { text: string; fetchedAt: string; origin?: "fetch" | "import" },
): { version_id: string; created: boolean; changed: boolean; supersedes: string | null } {
  if (!input.text) throw new Error("putDocument 只接受非空正文")
  const versionId = sha256(input.text)
  const body = path.join(root, "documents", id, `${versionId}.md`)
  const history = readHistory(root, id) ?? { current: "", previous: "", changed_at: "", version: [] }
  const previous = currentOf(history)
  const existing = history.version.find((v) => v.id === versionId)
  const created = !existing
  const changed = previous?.version_id !== versionId

  if (!fs.existsSync(body)) writeAtomic(body, input.text)

  // supersedes 记的是这份正文**首次出现**时的前一版,写定就不再动。
  // A → B → A 的回退只是把指针移回 A,B 当初接替的仍然是 A。
  const version = created
    ? [
        ...history.version,
        {
          id: versionId,
          first_seen_at: input.fetchedAt,
          supersedes: previous?.version_id ?? "",
          origin: input.origin ?? "fetch",
        },
      ]
    : history.version

  // 搬进来的基线可能只有版本记录、没有指针。同一份正文再次抓到时(changed=false)
  // 也要把指针补上,否则「当前正文」永远要靠 first_seen_at 猜。
  // 正文没变又已有指针时整个文件一个字都不用动——每天一轮抓取,444 个来源,
  // 重写一遍只会让 mtime 全部翻新,看不出哪个来源今天真的动过。
  if (!changed && history.current) return { version_id: versionId, created, changed, supersedes: null }

  // 一次 rename 落盘。历史和指针在同一个文件里,读到的永远是自洽的一组,
  // 不存在「新版本已登记、指针还没动」的中间态。
  writeAtomic(
    historyFile(root, id),
    toml.stringify({
      current: versionId,
      previous: changed ? previous?.version_id ?? "" : existing?.supersedes ?? "",
      changed_at: changed ? input.fetchedAt : existing?.first_seen_at ?? input.fetchedAt,
      version,
    } satisfies History),
  )

  return { version_id: versionId, created, changed, supersedes: changed ? previous?.version_id ?? null : null }
}

export function readDocument(root: string, id: string, versionId: string): string | null {
  const body = path.join(root, "documents", id, `${versionId}.md`)
  return fs.existsSync(body) ? fs.readFileSync(body, "utf8") : null
}
