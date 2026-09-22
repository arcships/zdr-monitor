import { parse } from "smol-toml"

export { parse }

const BARE = /^[A-Za-z0-9_-]+$/

const key = (k: string) => (BARE.test(k) ? k : basic(k))

function basic(value: string) {
  let out = '"'
  for (const ch of String(value)) {
    const code = ch.codePointAt(0)!
    if (ch === '"') out += '\\"'
    else if (ch === "\\") out += "\\\\"
    else if (ch === "\n") out += "\\n"
    else if (ch === "\r") out += "\\r"
    else if (ch === "\t") out += "\\t"
    else if (code < 0x20 || code === 0x7f) out += "\\u" + code.toString(16).padStart(4, "0")
    else out += ch
  }
  return out + '"'
}

// 政策条文常常是整段中文,带换行。多行字符串在 diff 里可读得多。
//
// 换行和制表符照字面写(那正是多行形式的意义),其余控制字符必须转义——
// TOML 规范不允许它们裸露在字符串里。jina 抓回的 markdown 里确实有,
// 漏掉这一步会写出读不回来的文件。
function multiline(value: string) {
  let body = ""
  for (const ch of String(value)) {
    const code = ch.codePointAt(0)!
    if (ch === "\\") body += "\\\\"
    else if (ch === "\n" || ch === "\t") body += ch
    else if (code < 0x20 || code === 0x7f) body += "\\u" + code.toString(16).padStart(4, "0")
    else body += ch
  }
  // 连续三个引号会提前终止字符串;结尾的引号会和定界符连成四个。
  body = body.replace(/"""/g, '""\\"').replace(/"$/, '\\"')
  return '"""\n' + body + '"""'
}

const str = (value: string) => (value.includes("\n") ? multiline(value) : basic(value))

function scalar(value: unknown): string {
  if (typeof value === "string") return str(value)
  if (typeof value === "boolean") return String(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("TOML 不支持 " + value)
    return String(value)
  }
  if (value instanceof Date) return value.toISOString().replace(/\.\d{3}Z$/, "Z")
  throw new Error("无法序列化:" + typeof value)
}

const isTable = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
const isTableArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.length > 0 && v.every(isTable)

function inlineArray(values: unknown[]) {
  const parts = values.map(scalar)
  const oneLine = "[" + parts.join(", ") + "]"
  // 阈值固定,不看内容随机决定——否则同样的数据会写出不同的样子。
  if (oneLine.length <= 88 && !oneLine.includes("\n")) return oneLine
  return "[\n" + parts.map((p) => "  " + p + ",\n").join("") + "]"
}

function section(value: Record<string, unknown>, prefix: string, out: string[]) {
  const tables: [string, unknown][] = []
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue
    if (isTable(v) || isTableArray(v)) tables.push([k, v])
    else out.push(key(k) + " = " + (Array.isArray(v) ? inlineArray(v) : scalar(v)))
  }
  // 标量先、子表后。否则子表之后的标量会被 TOML 吞进子表里。
  for (const [k, v] of tables) {
    const name = prefix ? prefix + "." + key(k) : key(k)
    if (isTableArray(v))
      for (const item of v) {
        out.push("", "[[" + name + "]]")
        section(item, name, out)
      }
    else {
      out.push("", "[" + name + "]")
      section(v as Record<string, unknown>, name, out)
    }
  }
}

/** 确定性序列化:同样的数据写两次逐字节相同。整个按实体分文件的设计
 *  建立在「政策变了 = 三行 diff」上,格式一抖动这个收益就没了。 */
export function stringify(value: unknown): string {
  if (!isTable(value)) throw new Error("顶层必须是表")
  const out: string[] = []
  section(value, "", out)
  return out.join("\n").replace(/^\n+/, "") + "\n"
}
