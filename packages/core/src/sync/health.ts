/** 只持久化异常来源的当前健康状态。
 *
 * 每次成功抓取都写一条日志会让 Git 每天产生数百行无意义改动。完整运行记录由
 * CI 保存；仓库只需要跨运行记住连续失败次数,以便达到阈值时开 issue。 */
import fs from "node:fs"
import path from "node:path"
import * as toml from "../toml"

export interface SourceHealth {
  source_id: string
  consecutive_failures: number
  verdict: string
  http_status: number
  failed_at: string
  error?: string
}

const fileOf = (root: string, id: string) => path.join(root, "health", `${id}.toml`)

export function readHealth(root: string, id: string): SourceHealth | null {
  const file = fileOf(root, id)
  return fs.existsSync(file)
    ? (toml.parse(fs.readFileSync(file, "utf8")) as unknown as SourceHealth)
    : null
}

export function recordFailure(
  root: string,
  id: string,
  failure: Omit<SourceHealth, "source_id" | "consecutive_failures">,
) {
  const previous = readHealth(root, id)
  const file = fileOf(root, id)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    toml.stringify({
      source_id: id,
      consecutive_failures: (previous?.consecutive_failures ?? 0) + 1,
      ...failure,
    } satisfies SourceHealth),
  )
}

export function clearFailure(root: string, id: string) {
  const file = fileOf(root, id)
  if (fs.existsSync(file)) fs.rmSync(file)
}

export function loadFailures(root: string): SourceHealth[] {
  const dir = path.join(root, "health")
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".toml"))
    .map((name) => toml.parse(fs.readFileSync(path.join(dir, name), "utf8")) as unknown as SourceHealth)
    .sort((a, b) => a.source_id.localeCompare(b.source_id))
}
