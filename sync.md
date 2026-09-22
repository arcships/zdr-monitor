# 政策抓取与复核

这条流水线刻意把两件事分开：**机器保存可重复核验的原文，agent 解释政策含义**。
抓取器不判断页面是不是“像政策”，也不从正文自动生成 ZDR、训练、保留等结论。

## 职责边界

| 阶段 | 输入 | 输出 | 责任主体 |
| --- | --- | --- | --- |
| 来源策展 | 官方网站和产品范围 | provider 中的 URL、channel、tier | agent |
| 技术抓取 | 所有 provider 声明的来源 | 正文快照、版本指针、异常健康状态、完整行级 diff | 机器 |
| 锚点核验 | 当前正式快照 + `providers/*.toml` | `exact` / `reworded` / `gone` | 机器 |
| 语义复核 | 新旧正文、diff、已有结论 | 是否影响五个维度，必要时修改 provider | agent |
| 发布 | agent 确认后的 provider 数据 | 当前事实和已确认变化历史 | 站点 |

机器只回答“拿到了什么、字面是否变化、旧引文还能否定位”；agent 回答“来源是否权威、
变化是什么意思、结论是否要改”。

## 首次纳入

```diagram
agent 调研 .verify/*.json
          │
          ▼
research:fetch：用正式抓取器为已策展 URL 建立 baseline
          │
          ▼
research:import：确认每个 exact 都能在 baseline 中命中
          │
          ▼
providers/*.toml 成为正式结论和锚点
```

`.verify/` 是被 Git 忽略的研究暂存区，不是产品数据。新 provider 的研究文件在顶层同时写
`provider_id`、`name`，可选写 `name_en`、`endpoint`；导入完成后正式仓库不依赖该文件。

顺序不能反。浏览器里看到的文字可能和 Jina 生成的 Markdown 不同；先导入锚点再抓正式
快照，会得到一批从第一天起就无法验证的引用。`research:import` 因此会在缺 baseline 或
`exact` 不命中时整体失败。

```bash
bun run research:fetch -- <provider_id> --dry-run
bun run research:fetch -- <provider_id>
bun run research:import -- <provider_id> --dry-run
bun run research:import -- <provider_id>
```

已经导入的 provider 可以直接按 ID 抓，例如 `bun run fetch -- volcengine`；CLI 会把
provider ID 展开为它声明的全部 source ID。尚未导入的 provider 由 `research:fetch` 直接
读取 `.verify/` 中已通过 agent 策展的 URL，不会先创建半成品 provider。

## 每日流程

```diagram
providers/*.toml 中的来源
           │
           ▼
限速 fetch（429/5xx/网络错误重试）
     │
     ▼
技术响应判定
  ┌──┴───────────────────────┐
失败                        成功
  │                           │
更新 health/                 内容哈希比较
保留最后成功正文              │
不判锚点                 ┌────┴────┐
                         相同      不同
                          │         │
                        无写入   新快照 + current 指针 + 完整 diff
                                      │
                                      ▼
                               verify-anchors
                                      │
                         exact / reworded / gone
                                      │
                                      ▼
                       open-issues → agent 语义复核
```

CI 每天按 `fetch → verify:anchors → issues:open` 执行。抓取失败仍会运行后两步，然后让 job
变红。这样失败可见，但不会把错误页写成政策正文，也不会把失败误报成条款消失。

## 技术响应判定

`classifyFetchResult()` 只拦不能作为正文保存的技术响应：

- HTTP / 网络错误；
- Jina 自己返回的渲染错误壳；
- 人机验证页、软 404、空响应；
- 当前未支持的 PDF。

非空文本即进入快照层。导航很多、只有图片、措辞陌生、没有政策关键词，都不能由运行时
据此拒绝；URL 已由 agent 策展，正文是否有政策价值也由 agent 判断。

所有来源统一走 `r.jina.ai/<url>` 得到 Markdown，不在 direct HTML 和 Jina Markdown 之间
切换，避免抓取通道变化伪装成整页政策变化。默认串行且每次间隔 3.1 秒，以适配目前观察到
的 Jina 20 次/分钟限制。

## 存储模型

```text
providers/<provider_id>.toml                  agent 策展的来源、结论和锚点
documents/<source_id>/<version_id>.md         不可变正文，version_id = sha256(content)
documents/<source_id>/history.toml            版本记录 + 当前版本指针，目录里唯一可变的文件
health/<source_id>.toml                       仅当前异常；恢复后删除
changes/<provider_id>/<date>-<slug>.toml      agent 确认的政策变化
.sync/fetch.{json,md}                         单次 CI 报告，不进 Git
.sync/verify-anchors.{json,md}                单次锚点报告，不进 Git
```

每个 provider 在自己的文件中用 `[[source]]` 声明 `url`、`channel`、`tier` 和 `note`，不写
`id`；运行时以 `sha256(url)` 前 16 位派生 `source_id`。同一官方文档确实服务多个 provider
时可以在各自文件中声明，抓取队列会按 URL 去重，而页面仍保留各 provider 自己的适用范围说明。

`history.toml` 里的 `current` 不能由 `first_seen_at` 推导。页面可能 A → B → A；第三次抓取
必须把当前版本指回 A，而不是因为 B 较晚首次出现就继续把 B 当当前正文。`supersedes` 记的
是每份正文首次出现时接替了谁，写定不再变；回退只移动 `current`/`previous`/`changed_at`。

元数据和正文同在一个目录，一次成功抓取只 rename 一次 history.toml，读到的永远是自洽的
一组；分成两棵树时中途中断会留下「有正文没记录」或「指针指向不存在的版本」。

每天成功抓取不写 Git 日志。完整运行记录由 CI artifact 保存；只有连续失败计数需要跨运行
保留，所以仓库只保存当前异常的 `health/` 文件，恢复即删除。

## diff 和锚点解决不同问题

锚点只覆盖我们已经知道的条款，实测约占正文 1%。因此必须同时保留两种信号：

- **完整正文 diff**：发现未覆盖区域新增或删除了什么；只是一条待 agent 审阅的线索。
- **锚点核验**：判断支撑现有结论的原句是否还站得住。

机器不得用政策关键词过滤所谓“实质 diff”。版权年份、导航变化等噪声由 agent 看过后关闭；
否则同一个过滤器也会悄悄过滤掉新出现但措辞未知的重要条款。

锚点使用 TextQuoteSelector：

```toml
[[anchor]]
id = "zdr-enterprise"
source_id = "9fa678c2f42aae99"
topics = ["zdr", "retention"]

[anchor.selector]
prefix = "前文"
exact = "支撑结论的官方原句"
suffix = "后文"
```

| 状态 | 含义 | 动作 |
| --- | --- | --- |
| `exact` | 原句仍在，位置可变 | 无动作 |
| `reworded` | 上下文仍在，中间文字变化 | 交给 agent 对比语义 |
| `gone` | 上下文也无法定位 | 开 issue，agent 查官方现状 |

来源当前异常或尚无 baseline 时，锚点是 `skipped`，不是 `gone`。`verify:anchors --replay`
用于忽略健康状态、在已存正文上重放定位算法。

## 从原始变化到网站变化历史

变化历史已经按以下边界发布到站点：

1. fetch 保存新旧 version ID 和完整 diff；
2. issue 把 source、旧/新 version、受影响 provider 交给 agent；
3. agent 对照两份不可变快照，判断是否影响五个维度；
4. 无关变化关闭 issue，不发布；有政策意义的变化随 provider 修改一起写一条人工确认记录；
5. 站点只读取该确认记录，不直接读取 raw diff 或 Git commit。

确认记录字段是：`provider`、`observed_at`（可选 `effective_at`）、`dimensions`、
`direction`（`weakened` / `strengthened` / `clarified`）、`source_id`、`from_version`、
`to_version`、中英文摘要和复核 issue。`validate` 要求前后快照真实存在。不要把每次抓取尝试
或未经确认的页面变化包装成“政策变化”。

## 命令

```bash
bun run fetch                         # 全部来源
bun run fetch -- volcengine           # 已导入 provider 引用的来源
bun run fetch -- <source_id> --dry-run
bun run verify:anchors                # 核验当前快照
bun run verify:anchors -- --replay    # 对已存快照重放
bun run issues:open -- --dry-run      # 查看将开的 issue
bun run validate
bun test
```
