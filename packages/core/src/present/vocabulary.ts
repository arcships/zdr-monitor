/** 受控词表:把结构化判定翻成人话,中英各一份。
 *
 *  为什么不让 agent 写自由文本:原来每个维度的结论是四个 agent 各写各的,
 *  结果 124 行用三种写法说「受托处理 / 受托处理方 / 厂商为受托处理方」同一件事。
 *  而 kind:"processor" 这个字段本来就在——查表一次,全站一种说法,顺带天然双语。
 *
 *  实测结构化字段覆盖 96%,剩下的回落到人工写的自由文本。 */

/** codes 各 agent 用了 [] / ["unknown"] / ["GLOBAL"] 等不同写法,在这里收敛。
 *  它是给按地域筛选用的——summary 是散文,筛不了。 */
export function normalizeCodes(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.length) return []
  return [
    ...new Set(
      raw
        .map((c) => String(c).trim())
        .filter((c) => c && c.toLowerCase() !== "unknown")
        .map((c) =>
          c.toLowerCase() === "global" ? "global" : c.toLowerCase() === "selected" ? "selected" : c.toUpperCase(),
        ),
    ),
  ]
}

const REGION: Record<string, [string, string]> = {
  CN: ["中国", "China"], US: ["美国", "US"], SG: ["新加坡", "Singapore"],
  EU: ["欧盟", "EU"], EEA: ["欧洲经济区", "EEA"], GB: ["英国", "UK"],
  JP: ["日本", "Japan"], KR: ["韩国", "Korea"], IN: ["印度", "India"],
  AU: ["澳洲", "Australia"], CA: ["加拿大", "Canada"], DE: ["德国", "Germany"],
  FR: ["法国", "France"], IE: ["爱尔兰", "Ireland"], NL: ["荷兰", "Netherlands"],
  FI: ["芬兰", "Finland"], HK: ["香港", "Hong Kong"], TW: ["台湾", "Taiwan"],
  global: ["全球", "Global"], selected: ["可选地域", "Customer-selected"],
}
const ROLE: Record<string, [string, string]> = {
  processor: ["受托处理", "Processor"],
  controller: ["独立控制者", "Controller"],
  subprocessor: ["次级受托", "Subprocessor"],
  unknown: ["未约定角色", "Not specified"],
}
/** 站点。是枚举不是自由文本——自由文本就得靠切词去翻，而且同一件事会有
 *  「国内站」「国内」「中国站」三种写法。 */
export const SITE: Record<string, [string, string]> = {
  cn: ["国内站", "China site"],
  global: ["国际站", "Global site"],
  us: ["美国站", "US site"],
  eu: ["欧洲站", "EU site"],
  sgp: ["新加坡", "Singapore"],
  ams: ["阿姆斯特丹", "Amsterdam"],
}

/** 档次。同一个套餐的个人版和企业版条款常常相反，这是编码订阅最大的坑 */
export const PLAN: Record<string, [string, string]> = {
  individual: ["个人版", "Individual"],
  team: ["团队版", "Team"],
  enterprise: ["企业版", "Enterprise"],
  free: ["免费层", "Free tier"],
}

/** 档位标签：站点 + 档次拼出来。badge 只在拼不通顺时当覆盖用——
 *  它是自由文本，一旦成为主力就会同时塞进产品线、站点、档次三件事，
 *  然后就得写个切词器去翻它。 */
export function composeBadge(site?: string, plan?: string): [string, string] | null {
  const parts = [site ? SITE[site] : null, plan ? PLAN[plan] : null].filter(Boolean) as [string, string][]
  if (!parts.length) return null
  return [parts.map((x) => x[0]).join(" · "), parts.map((x) => x[1]).join(" · ")]
}

const OBJECT: Record<string, [string, string]> = {
  input_output: ["输入输出", "Inputs & outputs"],
  cache: ["缓存", "Cache"],
  logs: ["日志", "Logs"],
  mixed: ["按对象分列", "Varies by object"],
}

/** 摘要用受控词表从结构化字段生成,不用自由文本。
 *
 *  原来每个维度的 summary 是 agent 各写各的,结果 124 行用三种写法说
 *  「受托处理 / 受托处理方 / 厂商为受托处理方」同一件事。
 *  而 kind:"processor" 这个字段本来就在——词表一查,全站一种说法,顺便天然双语。
 *
 *  实测结构化字段覆盖 96%,剩下的(主要是 processing_region 的复杂情形)
 *  回落到 agent 写的自由文本。 */
export function summarize(dim: string, v: any): [string, string] {
  if (dim === "role") return ROLE[v.kind] ?? ROLE.unknown!

  // 摘要回答的是列名那个问题,并带上限定条件——不要把列名复述一遍。
  // 「不用于训练 ✓ 承诺不用于训练」是三重重复;
  // 「不用于训练 ✓ 否，商业条款明确禁止」才有信息量。
  // mark 回答的就是列名那个问题「不用于训练?」——yes = 不训练。
  if (dim === "training") {
    if (v.mark === "yes")
      return v.mode === "by_contract"
        ? ["是，合同条款禁止", "Yes, prohibited by contract"]
        : v.mode === "opt_out"
          ? ["是，已退出训练", "Yes, opted out"]
          : v.mode === "by_tier"
            ? ["是，产品条款约定", "Yes, by product terms"]
          : v.mode === "by_deployment"
            ? ["是，但由部署形态决定而非承诺", "Yes, but by deployment, not a commitment"]
            : ["是，默认不训练", "Yes, not by default"]
    if (v.mark === "no")
      return v.mode === "opt_out"
        ? ["否，可申请退出", "No, opt-out available"]
        : v.mode === "opt_in"
          ? ["否，需你授权", "No, unless you opt in"]
          : v.mode === "not_disclosed"
            ? ["否，厂商未公开承诺", "No, no public commitment"]
            : ["否，条款允许训练", "No, permitted by terms"]
    // unknown 是技术债，清完就删这一支
    return ["否，厂商未公开承诺", "No, no public commitment"]
  }

  if (dim === "zdr") {
    if (v.mark === "yes")
      return v.mode === "by_deployment"
        ? ["是，但由部署形态决定而非承诺", "Yes, but by deployment, not a commitment"]
        : v.mode === "default"
        ? ["是，默认即零保留", "Yes, by default"]
        : v.mode === "opt_in"
          ? ["是，可自助开通", "Yes, self-serve"]
          : ["是，需向厂商申请", "Yes, on request"]
    if (v.mark === "no")
      return v.mode === "not_disclosed"
        ? ["否，厂商未公开方案", "No, no option disclosed"]
        : ["否，条款明示会留存", "No, terms state retention"]
    return ["否，厂商未公开方案", "No, no option disclosed"]
  }

  if (dim === "retention") {
    const obj = OBJECT[v.object] ?? OBJECT.mixed!
    if (v.basis === "fixed_period" && typeof v.days === "number") {
      const cn = v.days >= 365 ? `${Math.round(v.days / 365)} 年` : `${v.days} 天`
      const en = v.days >= 365 ? `${Math.round(v.days / 365)}y` : `${v.days} days`
      return [`${obj[0]}保留 ${cn}`, `${obj[1]} kept ${en}`]
    }
    if (v.basis === "none") return [`${obj[0]}不留存`, `${obj[1]} not retained`]
    if (v.basis === "until_termination") return [`${obj[0]}留至服务终止`, `${obj[1]} until termination`]
    if (v.basis === "as_needed") return [`${obj[0]}按需保留`, `${obj[1]} as needed`]
    return [`${obj[0]}未公布期限`, `${obj[1]}, period undisclosed`]
  }


  // processing_region:能列出国家码就用词表,列不出的回落自由文本
  const codes = normalizeCodes(v.codes)
  if (codes.length) {
    const cn = codes.map((c) => (REGION[c] ?? [c, c])[0])
    const en = codes.map((c) => (REGION[c] ?? [c, c])[1])
    return codes.length > 3
      ? [`${cn[0]} 等 ${codes.length} 地`, `${en[0]} +${codes.length - 1} more`]
      : [cn.join(" / "), en.join(" / ")]
  }
  // codes 列不出时回落自由文本。英文侧不要抄中文——宁可给一句准确的通用说法,
  // 也好过在英文界面上甩一段中文。
  return ["未披露处理地", "Region undisclosed"]
}

/** 表格里的极简标签。和摘要同源——摘要是完整句,这里去掉主语只留答案。
 *  判断题列(✓/✗)不给字,记号本身就是答案。 */
export function terse(dim: string, v: any): [string, string] {
  // 判断题列只给限定条件，结论本身由 ✓/✗ 表达。
  // 「默认不训练」和「合同禁止」对采购是两回事——后者意味着消费档不适用。
  if (dim === "training") {
    if (v.mark === "yes")
      return v.mode === "by_contract"
        ? ["合同条款", "by contract"]
        : v.mode === "opt_out"
          ? ["已退出", "opted out"]
          : v.mode === "by_tier"
            ? ["产品条款", "by product terms"]
          : v.mode === "by_deployment"
            ? ["部署形态", "by deployment"]
            : ["默认", "by default"]
    // 没记 opt_out/opt_in 不等于「没有开关」——只能说到条款允许为止，
    // 不能从字段缺失反推成「无法退出」。
    if (v.mark === "no")
      return v.mode === "opt_out"
        ? ["可退出", "opt-out"]
        : v.mode === "opt_in"
          ? ["需授权", "opt-in"]
          : v.mode === "not_disclosed"
            ? ["未公开", "not disclosed"]
            : ["条款允许", "permitted"]
    return ["未公开", "not disclosed"]
  }
  if (dim === "zdr")
    return v.mark === "yes"
      ? v.mode === "by_deployment" ? ["部署形态", "by deployment"] : ["", ""]
      : v.mode === "not_disclosed" || v.mark !== "no"
        ? ["未公开", "not disclosed"]
        : ["明示留存", "retained"]
  if (dim === "role") return ROLE[v.kind] ?? ROLE.unknown!

  if (dim === "retention") {
    if (v.basis === "fixed_period" && typeof v.days === "number")
      return v.days >= 365
        ? [`${Math.round(v.days / 365)} 年`, `${Math.round(v.days / 365)}y`]
        : [`${v.days} 天`, `${v.days}d`]
    if (v.basis === "none") return ["不留存", "None"]
    if (v.basis === "until_termination") return ["至服务终止", "Until termination"]
    if (v.basis === "as_needed") return ["按需保留", "As needed"]
    return ["未公布", "Undisclosed"]
  }

  const codes = normalizeCodes(v.codes)
  if (!codes.length) return ["未披露", "Undisclosed"]
  const cn = codes.map((c) => (REGION[c] ?? [c, c])[0])
  const en = codes.map((c) => (REGION[c] ?? [c, c])[1])
  return codes.length > 2
    ? [`${cn[0]} 等 ${codes.length} 地`, `${en[0]} +${codes.length - 1}`]
    : [cn.join(" / "), en.join(" / ")]
}

interface Verdict {
  mark?: "yes" | "no" | "unknown"
  /** 表格显示的极简标签,可能为空(纯 ✓/✗ 的列) */
  terse: string
  terse_en: string
  mode?: string
  codes?: string[]
}

interface Evidence {
  /** 详情页卡头那句话。受控词表生成,全站同一件事一种说法 */
  summary?: string
  summary_en?: string
  /** 依据,一条一条列。由 note 按分号拆出 */
  points?: string[]
  quote?: string
  source?: { url: string; channel: string }
}

/** 版本名（badge）的英文。
 *
 *  badge 是 agent 在 providers/*.toml 里用中文写的产品档次名(「国内站 API」
 *  「Coding Plan 个人版」)。英文界面上直接甩中文,双语就只做了一半;但让 agent
 *  每条都补一个英文又会退回到「同一件事三种写法」。
 *
 *  这些名字其实是几十个词根拼出来的,所以按最长匹配切词再拼——新出现的组合
 *  (「国际站团队版」)不用改代码就能翻。词典里没有的原样保留,宁可露出中文
 *  也不要猜错一个产品名。 */
const BADGE_WORDS: Array<[string, string]> = [
  ["自托管官方模型", "self-hosted, official models"],
  ["自托管自选模型", "self-hosted, BYO models"],
  ["经 OpenRouter 转售", "resold via OpenRouter"],
  ["多租户付费版", "multi-tenant paid"],
  ["免费学术版", "free academic"],
  ["客户自有云", "customer-owned cloud"],
  ["会员订阅", "membership subscription"],
  ["微调与数据集", "fine-tuning & datasets"],
  ["第三方模型", "third-party models"],
  ["自营模型", "first-party models"],
  ["专属部署", "dedicated deployment"],
  ["私有部署", "private deployment"],
  ["部署平台", "deployment platform"],
  ["认知服务", "Cognitive Services"],
  ["训练微调", "training & fine-tuning"],
  ["助手功能", "assistant features"],
  ["专属端点", "dedicated endpoint"],
  ["共享端点", "shared endpoint"],
  ["订阅套餐", "subscription plan"],
  ["网页对话", "web chat"],
  ["网关路由", "gateway routing"],
  ["路由聚合", "routing aggregation"],
  ["创作者平台", "creator platform"],
  ["社区平台", "community platform"],
  ["计算平台", "compute platform"],
  ["模型托管", "model hosting"],
  ["上游模型", "upstream models"],
  ["伙伴模型", "partner models"],
  ["自带模型", "BYO models"],
  ["算力服务", "compute service"],
  ["旧版条款", "legacy terms"],
  ["预览功能", "preview feature"],
  ["统一计费", "unified billing"],
  ["有状态", "stateful"],
  ["对照行", "reference row"],
  ["消费端", "web app"],
  ["网页端", "web app"],
  ["免费层", "free tier"],
  ["自助版", "self-serve"],
  ["自托管", "self-hosted"],
  ["专属云", "dedicated cloud"],
  ["专属集群", "dedicated cluster"],
  ["新加坡集群", "Singapore cluster"],
  ["欧洲集群", "EU cluster"],
  ["中国集群", "China cluster"],
  ["国内站", "CN site"],
  ["国际站", "global site"],
  ["企业版", "enterprise"],
  ["团队版", "team"],
  ["个人版", "individual"],
  ["企业订阅", "enterprise subscription"],
  ["标准", "standard"],
  ["按量", "pay-as-you-go"],
  ["混元", "Hunyuan"],
  ["国内", "CN"],
  ["国际", "global"],
  ["试用", "trial"],
  ["订阅", "subscription"],
  ["对照", "reference"],
  ["微调", "fine-tuning"],
  ["网关", "gateway"],
  ["平台", "platform"],
  ["服务", "service"],
  ["功能", "feature"],
  ["集群", "cluster"],
  ["转发", "proxy"],
  ["官网", "website"],
  ["社区", "community"],
  ["个人", "individual"],
  ["模型", "models"],
  ["档", "tier"],
  ["版", "edition"],
  ["云", "cloud"],
]

export function badgeEn(badge: string): string {
  const out: string[] = []
  let rest = badge
  let buffer = ""
  // 首段是原样带过来的专名时不要动它的大小写——"xAI Grok" 首字母大写就成了别的东西
  let translatedFirst = false
  while (rest.length) {
    const hit = BADGE_WORDS.find(([cn]) => rest.startsWith(cn))
    if (hit) {
      if (buffer.trim()) out.push(buffer.trim())
      else if (!out.length) translatedFirst = true
      buffer = ""
      out.push(hit[1])
      rest = rest.slice(hit[0].length)
    } else {
      buffer += rest[0]
      rest = rest.slice(1)
    }
  }
  if (buffer.trim()) out.push(buffer.trim())
  const text = out.join(" ").replace(/\s+/g, " ").trim()
  if (!text) return badge
  return translatedFirst ? text[0]!.toUpperCase() + text.slice(1) : text
}
