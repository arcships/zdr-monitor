# 收录范围

## 范围怎么定

**按实际用得上的供应商定,不按上一版做到哪定。**

这条是踩出来的。第一版曾经拿「上一版已复核发布的 N 家」当范围,结果漏掉了两家正在使用的
供应商。拿历史产出当范围,等于让历史遗漏决定今天该做什么。

所以范围来自两处,取并集:

1. 实际在用或正在评估的供应商
2. 有可能被采购、或客户会问到的主流 provider

## 当前覆盖

90 家 provider、211 个产品档位、453 份被监控的政策文档、2382 个锚点。

按类型分:

- **模型厂商自营 API** —— OpenAI、Anthropic、Google、Meta、xAI、Mistral、Cohere、
  DeepSeek、月之暗面、智谱、MiniMax、阶跃星辰、百川、商汤、讯飞、小米等
- **云厂商托管** —— Azure、Amazon Bedrock、Google Vertex、阿里云百炼、百度千帆、
  腾讯混元、火山方舟、OCI、watsonx、Databricks、Snowflake Cortex 等
- **推理平台** —— Groq、Cerebras、Together、Fireworks、Baseten、Modal、Nebius、
  DeepInfra、Novita、Crusoe、Friendli 等
- **聚合网关** —— OpenRouter、SiliconFlow、Poe、Vercel、GitHub Copilot、GitLab、
  HuggingFace、Cloudflare AI Gateway、PPIO、七牛云等

## 不收录的

### 自建和私有化部署

这几类端点不进台账:

| 类型 | 说明 |
| --- | --- |
| 自建算力 | 自己租的 GPU 集群 |
| 临时隧道 | `*.trycloudflare.com` 这类 |
| 私有化部署 | 部署在自己机房的模型服务 |
| 自家中转网关 | 内部统一入口 |

自建端点本身没有第三方数据处理问题。**但它们的上游仍需单独核实**——
自建域名后面如果接的是别人的模型服务,那一跳照样要查。

### 转售链路

A 转售 B 的模型时不单独建条目,**端到端结论以链上最弱一跳为准**。

比如某云厂商转售另一家的 DeepSeek,链路是 云厂商 → 上游 → DeepSeek,
三跳里任一跳明确为否,全链为否。

## 产品类型有四个

`category` 回答「这是卖给谁的什么东西」:

| 类型 | 是什么 | 例子 |
| --- | --- | --- |
| `api` | 按量调用的模型接口 | 百炼按量 API、Bedrock、OpenRouter、各家专属部署 |
| `coding_plan` | 面向开发者的编码订阅套餐 | Claude Code、Cursor、Codex、各家 Coding Plan |
| `web` | 网页或 App 里的对话入口 | ChatGPT 消费档、Poe、Perplexity 网页端 |
| `self_host` | 客户自己跑的那一档 | Cerebras 本地部署、watsonx software、W&B 自管 |

**「企业版」不在其中——那是档次。** 归 `api` 加 `plan_level = "enterprise"`。
把它当品类，同一条产品线的自助档和企业档会落进两个类型，横向对比就断了。

### 自托管为什么要单独收

因为**适用的往往是另一份合同**，而不是这家的在线服务条款:

| | 实际适用的文件 | 结论 |
| --- | --- | --- |
| Cerebras 本地部署 | Website ToS 明文排除硬件及随附软件，适用 Software EULA + Terms of Sale | EULA 里**没有数据处理条款** |
| Friendli 自管 / BYOG | ToS Ex.1 §1.1(d) | 把 Inputs/Outputs 的许可**排除**在自管档之外 |
| GitLab 自托管自选模型 | Duo AI Terms §1.5 | 明确这些**不是 GitLab Models 而是 Customer Models** |
| watsonx software 自管版 | 另一份软件文档 + CRA / Product Attachment | 有一句专给 software 档的不训练承诺 |
| W&B 自管 | MSA §4(a) + DPA Annex I | 授权文本仍在，但对象是「transferred to W&B」的数据 |

按「文件边界 = 政策边界」，这些就该单独一行。「买了机器之后适用的合同里没有
数据条款」本身就是采购要的结论。

### 但它的 ✓ 要标明来路

自托管档的「不训练 ✓ 零保留 ✓」常常来自架构——数据根本没出客户机房——
而不是厂商的承诺。这种要写 `mode = "by_deployment"`，表格上显示「部署形态」。
不标的话它会比任何托管档都绿，读起来像是这家给了更强的承诺。

### 别和「专属部署」看串

厂商替客户跑的独占实例（Dedicated Endpoint、专属集群、专属云）**不是自托管**:
数据仍在厂商机房，有真政策可判，算 `api` 的企业档。
中文名字很接近，判据是**谁的机器在跑**。

## 同一家的不同档位要分开

## 只收录厂商实际处理数据的档位

编码工具有三种数据链路,**只有第一种进台账**:

| 链路 | 例子 | 收不收 |
| --- | --- | --- |
| 厂商托管 | Cursor、Devin、Cline 的云端/企业版 | **收** |
| 自带 key(BYOK) | Cline / Aider / Continue 直连你配的模型 API | 不收 |
| 纯本地 | Ollama 本地跑 | 不收 |

理由:后两种情况下**数据根本不经过这家厂商,也就没有这家厂商的政策可追踪**。
真正适用的是你配的那家模型 API 的条款,而那家我们已经单独收录了。

硬记成一行「Cline 零保留 ✓」反而有害:它读起来像是对 Cline 的背书,而实际上
Cline 只是不在链路上——换个角度说,那一行的结论其实属于 OpenAI 或 Anthropic,
不属于 Cline。

BYOK 和本地运行是**缓解措施**,不是政策事实。要说明的话写进产品线的 `label`,
不要单独建 `[[product]]`。

## 三层结构:公司 → 产品线 → 档次

**不同层级适用的是不同的协议,所以层级必须在文件结构上就分开。**

```
公司      Anthropic
产品线    Claude API        → providers/anthropic.toml
          Claude Code 订阅   → providers/anthropic-claude-code.toml
档次      个人版 / 团队版 / 企业版 → 各一个 [[product]]
```

**产品线一线一个文件。** 编码订阅有自己的一整套政策文档——订阅专用条款、
自己的隐私说明、自己的 FAQ。塞进母公司文件里,`[[source]]` 就混了,引文会跨产品
串味:某一句话到底约束的是按量 API 还是订阅套餐,读者分不出来,agent 下次复核也
分不出来。

**档次一档一个 `[[product]]`,不许合成一行。**同一份文档相邻两节结论相反是常态。

**拆开不等于散开。**`company` 字段把同一家的多条产品线归并回一个详情页,读者眼里
还是一家;拆文件只是为了让政策文档和引文各归各位。

**这是最容易出错的地方。** 同一家 provider 的 API 和订阅套餐,政策常常完全相反。

火山引擎是最典型的例子:

| 档位 | 条款 | 结论 |
| --- | --- | --- |
| 按量 API | 方舟平台专用条款 §3.7.7 | 未经单独同意不存储不使用 |
| Coding Plan **企业版** | 订阅套餐专用条款 §1.4 | 「您的数据…**将不会被本服务留存**」 |
| Coding Plan **个人版** | 订阅套餐专用条款 §1.3 | 反过来**授权训练,且终止授权不追溯** |

同一家、同一份文档的相邻两节,结论完全相反。混成一行就全错了。

其他已单独建条目的档位:ChatGPT 消费档、Anthropic Claude Code 订阅、
Google Gemini Code Assist、阿里 Coding Plan 与 Token Plan(国内外各两档)、
腾讯 Coding Plan 与 Token Plan、智谱与 Z.AI 的 Coding Plan、Kimi Code、
阶跃 Step Plan、MiniMax Coding Plan、小米 Token Plan(中国 / 新加坡 / 阿姆斯特丹三集群)。

## 国内站和国际站要分开

同一品牌的国内站和国际站是不同法律实体、不同数据处理地、常常不同条款。
`moonshotai-cn` 和 `moonshotai`、`minimax-cn` 和 `minimax`、
`stepfun` 和 `stepfun-ai`、`zhipu-bigmodel` 和 `zai` 都是分开的条目。

国内站还有一条共性:按《网络安全法》相关网络日志至少留存六个月。
但**日志至少半年是下限,不等于半年后删除全部输入输出**——这两件事不能混。

## 重复条目的判据:看档位,不看文档

两个条目共用同一批政策文档是正常的——Coding Plan 档受平台条款约束,
再加自己的订阅条款,基础文档当然一样。

**判重看的是产品档位。** 曾经有两个条目指向同一批 `docs.z.ai` 文档、同一个法律实体、
同一个 API 档位,那是真重复,已合并。而 `zai` 与 `zai-coding-plan` 共用文档不算重复,
它们是不同档位。
