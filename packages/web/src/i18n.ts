// 双语。只有两种语言、几十个词，引 vue-i18n 是拿 20KB 换一个 40 行的问题。
// 做法照 dim-status。
import { ref, watch } from "vue"

const KEY = "zdr-lang"
export type Lang = "zh" | "en"

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === "zh" || saved === "en") return saved
  } catch {
    // 隐私模式下 localStorage 会抛异常。猜一个就好，不该因此白屏。
  }
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en"
}

export const lang = ref<Lang>(initial())

const apply = (v: Lang) => (document.documentElement.lang = v === "zh" ? "zh-CN" : "en")
watch(lang, (v) => {
  try {
    localStorage.setItem(KEY, v)
  } catch {
    // 存不下就算了，这一次会话内仍然生效。
  }
  apply(v)
})
apply(lang.value)

export const toggleLang = () => (lang.value = lang.value === "zh" ? "en" : "zh")

/** 取一对中英文里对应当前语言的那个。 */
export const t = (zh: string, en: string) => (lang.value === "zh" ? zh : en)

/** 取数据里的本地化字段：英文缺失时回落中文。
 *
 *  回落是刻意的：台账的原文摘录本来就是各家政策的原始语言，不该翻译——
 *  翻译过的引文不能拿去跟厂商对质。英文界面上显示中文结论，
 *  也好过显示空白或者 "undefined"。 */
export function pick<T extends Record<string, any>>(obj: T | undefined, field: string): string {
  if (!obj) return ""
  if (lang.value === "en") return obj[field + "_en"] || obj[field] || ""
  return obj[field] || ""
}
