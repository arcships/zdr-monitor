/** provider 的来源、锚点和结论。解析层的输入。 */
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import * as toml from "./toml"

export const sourceId = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16)

export interface Source {
  /** 运行时由 URL 派生，不写进 TOML。 */
  id: string
  url: string
  channel: string
  /** core = 结论挂在它上面。contradiction = 查清原因后仍与 core 冲突的官方表述。 */
  tier: "core" | "contradiction"
  note?: string
  note_en?: string
}

export interface Anchor {
  id: string
  provider_id: string
  source_id: string
  topics: string[]
  selector: { prefix: string; exact: string; suffix: string }
}

/** 一个产品档位的完整记录:标识、判定、指向证据的锚点。
 *  同一家的不同档位条款可能完全相反(火山企业版承诺不留存、个人版授权训练),
 *  所以判定挂在档位上而不是 provider 上。 */
/** 一条依据。text 是 agent 写的事实，anchor 指向支撑它的原文摘录。
 *  拆条是 agent 的活——代码不解析文本，只渲染。 */
export interface Point {
  /** 英文为主。台账覆盖全球供应商，而且 OpenAI、Anthropic 这些的
   *  政策原文本来就是英文，写中文等于翻译一遍再翻回去 */
  text?: string
  text_zh?: string
  anchor?: string
}

export interface Verdict {
  /** 回答的是列名那个问题，五个维度一律「yes 就是对用户有利」。
   *  training 列问的是「不用于训练?」，所以 yes = 不训练、no = 会训练。
   *  别按「会不会训练」去写——那个方向和列名正好相反，写反一次就是一条错数据。
   *
   *  三种「没有」要分清：no 是厂商明确表态会做，unknown 是翻遍官方文档没找到
   *  这条承诺。两者在页面上都是 ✗（保守假设），但对采购是两回事——前者是已知
   *  风险，后者是未公开。 */
  mark?: "yes" | "no" | "unknown"
  /** 怎么达成这个结论——对采购是两回事，不能只给一个 ✓/✗。
   *
   *  training + mark=yes（不训练）：default 默认就不训练 / by_contract 靠商业条款禁止
   *    （消费档可能不适用）/ opt_out 有开关且已关 / by_tier 该档公开的产品条款写明
   *  training + mark=no（会训练）：opt_out 有开关可关 / opt_in 授权了才训练。
   *    条款授权即训练又没开关的留空——「没有退路」靠 mark=no + 无 mode 表达，
   *    不为它造一个值。
   *  zdr：default 默认即零保留 / opt_in 自助开通 / by_agreement 需向厂商申请

   *
   *  mark=unknown 时不写 mode——没找到表述就没有「怎么达成」可言，
   *  但必须在 searched 里列出为这个维度查过哪些页面。 */
  mode?: string
  /** 保留的性质。没有这个就得拿中文结论去做关键词匹配——
   *  既锁死语言，又是在渲染层做判断 */
  basis?: "fixed_period" | "none" | "until_termination" | "as_needed" | "undisclosed"
  point?: Point[]
  days?: number
  object?: string
  codes?: string[]
  kind?: string
  anchor?: string
  searched?: string[]
}

export interface Product {
  id: string
  badge?: string
  /** 这个档位属于哪个品类。用来做横向对比——「所有厂商的编码订阅放一起看」
   *  是采购真正会问的问题，而档位名五花八门（Coding Plan / Muse Code /
   *  Fire Pass / Code Assist），靠名字匹配挑不出来。
   *    api 按量调用 / coding_plan 编码订阅套餐 / web 网页端对话入口
   *    self_host 客户自己跑的那一档
   *
   *  「企业版」不在其中——那是档次，归 api 加 plan_level=enterprise。把它当品类
   *  会让同一条产品线的自助档和企业档落进两个类型，横向对比就断了。
   *
   *  self_host 收，因为**适用的往往是另一份合同**：Cerebras 的 Website ToS 明文
   *  排除硬件及随附软件，实际适用的 EULA 里根本没有数据处理条款；Friendli 的
   *  ToS 把 Inputs/Outputs 的许可排除在自管档之外；GitLab 的 Duo AI Terms §1.5
   *  专门定义这些不是 GitLab Models。按「文件边界 = 政策边界」，这就该单独一行。
   *  但这一档的 ✓ 常常来自架构而不是承诺，那种要写 mode = "by_deployment"，
   *  否则表格上它会比任何托管档都绿。
   *
   *  厂商替客户跑的专属实例（Dedicated Endpoint、专属集群）不是自托管：
   *  数据仍在厂商机房，算 api 的企业档。判据是谁的机器在跑。 */
  category?: "api" | "coding_plan" | "web" | "self_host"
  /** 订阅套餐的档次。同一个 Coding Plan 的个人版和企业版条款常常相反
   *  （火山个人版授权训练、企业版承诺不留存），横向对比时要能按档次筛。 */
  /** 这一档卖给谁。any 是明确表态「这份条款不分档，谁开通都一样」——
   *  多数按量 API 就是这样，一份开发者条款覆盖所有调用方。
   *  字段缺席则是「还没核」，两者不能混：前者可以筛，后者是待办。 */
  plan_level?: "individual" | "team" | "enterprise" | "free" | "any"
  /** 站点写在档位上的情况：同一套政策文档同时覆盖国内外（商汤 Token Plan
   *  就是这样），这时不拆文件，用这个字段区分。 */
  site?: string
  entity?: string
  label?: string
  /** 英文界面用。没有时界面回落中文——宁可露出中文也好过空白。 */
  label_en?: string
  training: Verdict
  zdr: Verdict
  retention: Verdict
  processing_region: Verdict
  role: Verdict
}

export interface Provider {
  id: string
  name: string
  /** 中文厂商的官方英文名。不对称是刻意的——英文厂商不需要中文名，
   *  "OpenAI" 比任何翻译都好认。 */
  name_en?: string
  /** 这家是什么角色。直接影响结论怎么读：走聚合网关时真正处理数据的是上游厂商，
   *  网关自己的承诺盖不住上游。
   *    model_vendor 自研模型厂商 / cloud 云平台 / aggregator 聚合网关
   *    reseller 转售 / self_host 自托管或专属部署 */
  kind?: "model_vendor" | "cloud" | "aggregator" | "reseller" | "self_host"
  /** 官网首页。doc 是主政策页，两者不是一回事。 */
  homepage?: string
  /** 同一家公司拆在多个文件里时，用它归并；只需写在非主文件里。
   *
   *  阿里一家就有 6 个文件：国内站/国际站 × 按量 API / Coding Plan / Token Plan。
   *  拆开是对的——不同站点的签约主体、政策页、条款都不一样，混在一个文件里
   *  会让引文跨站串味。但读者眼里那就是「阿里云百炼」一家，详情页得聚到一起。
   *
   *  值是归并到哪个 provider id；company_name 是聚合后页面的标题，写在主文件里。 */
  company?: string
  company_name?: string
  /** 产品线 slug。文件边界按政策文档划——一个文件一条产品线，母公司文件里塞
   *  订阅档会让引文跨产品串味（订阅有自己的条款和隐私说明）。
   *  显示名直接用 name，不另立 line_name：两个字段说同一件事，迟早会不一致。 */
  line?: string
  /** 站点。是枚举（cn / global / us / eu / sgp / ams），不是自由文本：
   *  国内站和国际站是不同法律实体、不同处理地，按站点筛要能筛得动。
   *  同一套文档同时覆盖多个站点时，改写在 [[product]] 上。 */
  site?: string
  /** 这条产品线**实际存在**的档次，不是我们收录了的档次。
   *
   *  没有它就分不清「漏收」和「这家真没这一档」——和 mark=unknown 当年那个坑
   *  一模一样：没有记录，缺席就说不清是厂商没有还是我们没查。
   *
   *  声明了却没建对应 [[product]] = 漏收，validate 会报；
   *  整个字段缺席 = 还没核过，validate 也会报。两种都藏不住。
   *  这家只有个人版就写 ["individual"]，报告里从此干净。 */
  plan_levels?: Array<"individual" | "team" | "enterprise" | "free" | "any">
  /** 签约主体。采购最先问的两个问题之一（另一个是数据存哪），只能从合同原文里挖——
   *  按公司名猜出来的值在采购那里就是错的。挖不到就留空。 */
  entity?: string
  endpoint?: string
  doc?: string
}

export function providerIds(root: string) {
  const dir = path.join(root, "providers")
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".toml")).map((f) => f.replace(/\.toml$/, "")).sort()
    : []
}

export function loadProvider(root: string, id: string) {
  const raw = toml.parse(fs.readFileSync(path.join(root, "providers", `${id}.toml`), "utf8")) as any
  return {
    provider: {
      id,
      name: raw.name,
      name_en: raw.name_en,
      company: raw.company,
      company_name: raw.company_name,
      line: raw.line,
      plan_levels: raw.plan_levels,
      site: raw.site,
      entity: raw.entity,
      kind: raw.kind,
      homepage: raw.homepage,
      endpoint: raw.endpoint,
      doc: raw.doc,
    } as Provider,
    sources: ((raw.source || []) as Omit<Source, "id">[]).map((source) => ({
      ...source,
      id: sourceId(source.url),
    })) as Source[],
    products: ((raw.product || []) as any[]) as Product[],
    anchors: ((raw.anchor || []) as any[]).map((a) => ({ ...a, provider_id: id })) as Anchor[],
  }
}

export const loadAll = (root: string) => providerIds(root).map((id) => loadProvider(root, id))

export function writeProvider(
  root: string,
  id: string,
  data: { provider: Provider; sources: Source[]; products: Product[]; anchors: Anchor[] },
  options: { dryRun?: boolean } = {},
) {
  const { id: _pid, ...provider } = data.provider
  const body = toml.stringify({
    ...provider,
    source: [...data.sources]
      .sort((a, b) => a.url.localeCompare(b.url))
      .map(({ id: _id, ...source }) => source),
    product: data.products,
    anchor: data.anchors.map(({ provider_id, ...rest }) => rest),
  })
  if (!options.dryRun) {
    fs.mkdirSync(path.join(root, "providers"), { recursive: true })
    fs.writeFileSync(path.join(root, "providers", `${id}.toml`), body)
  }
  return body
}
