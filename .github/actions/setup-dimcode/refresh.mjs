// 用刷新令牌换发 DimCode 访问令牌，原地更新 auth.json。
//
// dim 没有「强制续期」的命令：它只在令牌 30 秒内就要过期时自己续，`dim auth login` 在 runner 上
// 会等浏览器授权（9/28 实测超时）。这里照 dim 自己的做法（refreshDimOAuthTokens + withAuthLock）：
//   POST tokenEndpoint  grant_type=refresh_token, refresh_token, client_id
//   → 更新 access / refresh / expires / scope
//   → dimAccountState.tokenDigest = sha256(canonical(nextApiOauth))，credentialRevision + 1
// 不这样更新 tokenDigest，dim 读文件时会报 credential_store_incompatible。
//
//   node refresh.mjs <auth.json>
import { createHash } from "node:crypto"
import fs from "node:fs"

const file = process.argv[2]
if (!file) throw new Error("用法: node refresh.mjs <auth.json>")
const data = JSON.parse(fs.readFileSync(file, "utf8"))
const tokens = data.nextApiOauth
const state = data.dimAccountState
if (!tokens?.refresh || !tokens?.tokenEndpoint || !tokens?.clientId) throw new Error("auth.json 里没有可用的 nextApiOauth 刷新令牌")
if (state?.state !== "authenticated") throw new Error(`登录态不是 authenticated：${state?.state}`)

// dim 的 canonical：键排序、去掉 undefined 的 JSON
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
  return JSON.stringify(value)
}
const digest = (t) => createHash("sha256").update(canonical(t)).digest("hex")
if (state.tokenDigest !== digest(tokens)) throw new Error("auth.json 的 tokenDigest 对不上，文件可能被改过")

const response = await fetch(tokens.tokenEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "HTTP-Referer": "https://dimagent.com/", "X-Title": "DimCode" },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh, client_id: tokens.clientId }).toString(),
  signal: AbortSignal.timeout(30000),
})
const body = await response.json().catch(() => null)
if (!response.ok || !body || typeof body.access_token !== "string" || String(body.token_type).toLowerCase() !== "bearer" || !(body.expires_in > 0))
  // 不打印响应体：里面可能有令牌
  throw new Error(`续期失败：HTTP ${response.status}${body?.error ? `，${body.error}` : ""}`)

const next = {
  ...tokens,
  access: body.access_token,
  refresh: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : tokens.refresh,
  expires: Date.now() + body.expires_in * 1000,
  ...(typeof body.scope === "string" ? { scope: body.scope } : {}),
}
data.nextApiOauth = next
data.dimAccountState = { ...state, credentialRevision: state.credentialRevision + 1, tokenDigest: digest(next) }
fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 })
console.log(`已续期到 ${new Date(next.expires).toISOString()}${next.refresh !== tokens.refresh ? "（刷新令牌已轮换）" : ""}`)
