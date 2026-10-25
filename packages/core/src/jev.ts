/** TypeSafe 的 Jev：不生成文本，对一段 state 回答带类型的问题（是非、单选、评分），返回概率。
 *  用来做「这次正文变化算不算政策变化」「新抓的是不是同一份文档」这类二元判断——
 *  正则只能看关键词，Jev 看的是意思；生成式 agent 能判断但贵、慢，而且答案要再解析。
 *
 *    JEV_API_KEY    没有就不调用，调用方退回原来的规则
 *    JEV_BASE_URL   默认 https://api.typesafe.ai（经 OpenCode Zen 时用 https://opencode.ai/inference/systemone）
 *    JEV_MODEL      默认 jev-latest
 *
 *  接口见 https://docs.typesafe.ai/api：POST /v1/systemone，Authorization: Bearer <key>。 */

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> }

export interface JevResult {
  model: string
  answers: Record<string, Answer>
  usage?: { input_tokens: number; output_tokens: number }
}

export type Ask = (state: unknown, questions: Record<string, Question>) => Promise<JevResult>

export const jevEnabled = () => Boolean(process.env.JEV_API_KEY)

/** state 加问题总共 32k token 以内（再长要开 long-context 头）。按字符粗截，中文一个字约一个 token */
export const STATE_CHARS = 60_000

export const ask: Ask = async (state, questions) => {
  const key = process.env.JEV_API_KEY
  if (!key) throw new Error("JEV_API_KEY 未设置")
  const base = (process.env.JEV_BASE_URL || "https://api.typesafe.ai").replace(/\/+$/, "")
  const body = JSON.stringify({ model: process.env.JEV_MODEL || "jev-latest", state, questions })
  let last = ""
  // 429、5xx、网络抖动重试两次；4xx（key 错、请求不合法）重试也没用
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await Bun.sleep(2000 * attempt)
    try {
      const res = await fetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(60_000),
      })
      if (res.ok) return (await res.json()) as JevResult
      last = `http_${res.status}: ${(await res.text()).slice(0, 300)}`
      if (res.status !== 429 && res.status < 500) break
    } catch (e: any) {
      last = String(e?.message || e)
    }
  }
  throw new Error(`jev: ${last}`)
}

export const noul = (r: JevResult, id: string) => {
  const a = r.answers[id] as { noul?: unknown } | undefined
  if (typeof a?.noul !== "number") throw new Error(`jev 没有回答 ${id}`)
  return a.noul
}
