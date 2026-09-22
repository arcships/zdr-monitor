/** 厂商 logo 的查表。文件名就是 id，Vite 打包时统一收口成带哈希的 URL。
 *
 *  找不到就返回 null，由调用方不渲染那个 span——别让它挂着一个 404 的 mask，
 *  那样 mask 失效，元素会退化成一个纯色方块，比没有图更糟。
 *
 *  回落链 provider_id → company：一家公司的多条产品线（Claude Code、Codex、
 *  Gemini CLI）用不着各存一份一模一样的图，但只要自己有牌子（Cursor、Zed），
 *  自己那份就优先。 */
const files = import.meta.glob("./assets/logos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>

const byId = new Map(
  Object.entries(files).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -4), url]),
)

/** 返回的 URL 必须**带引号**塞进 url("…")：Vite 会把 4KB 以下的 svg 内联成
 *  data:image/svg+xml,…，里面带单引号和逗号，不加引号的 url() 直接是无效值，
 *  整条 mask 声明被丢掉，元素就退化成一个纯色方块。 */
export function logo(...ids: Array<string | null | undefined>): string | null {
  for (const id of ids) if (id && byId.has(id)) return byId.get(id)!
  return null
}

/** 直接给 style 用，省得每个调用点自己拼引号拼错。 */
export const logoStyle = (...ids: Array<string | null | undefined>) => {
  const url = logo(...ids)
  return url ? { "--logo": `url("${url}")` } : undefined
}
