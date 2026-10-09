# 维护流程

照 models.dev 的维护方式：机器负责抓取和确定性校验，DimCode agent 负责政策语义；
所有改动都是 PR，一个 provider 一个 agent。

## 链路

```text
snapshot.yml（每天，按 provider 展开 matrix）
  抓这个 provider 引用的来源 → 规范化 → 写 snapshots/<source_id>.md
  有变化 → 固定分支 automation/snapshot-<provider>，原地更新同一个 PR
        → snapshot:auto-merge 判定安全就自动合并（引文成片失效时留给人，原因和处理办法写在 PR 正文）
        ↓ 合并
review-issues.yml
  开 [policy-review] <provider>: snapshot #<PR>，派发 issue-fixer
  共用这份快照、引文也坏了的其他 provider 各开一个；这家上一个复核还开着就记到它下面，
  它的 agent PR 已经开出来的，在 PR 上提醒快照又变了
        ↓
issue-fixer.yml（DimCode，一个 issue = 一个 provider = 一个 agent）
  只能改 providers/<provider>.toml 和 changes/<provider>/
  → workflow 为新来源抓快照 → validate + check:quotes --strict → PR dim/issue-<n>
  → 无需改动：评论理由并关闭 issue；证据不足：打 blocked
        ↓
pr-reviewer.yml（DimCode 只读，跳过快照 PR）
  agent PR：reviewer 没有待办，且合进最新 main 后 validate、check:quotes --strict、
  check:change-record 都过 → bot 自动合并，评论写明依据 → Pages 重新部署，时间线更新
  （只有变化记录、没动 providers/ 的 PR 也照常合并；合并时 main 变了就重新合进再查，最多五次）
  否则评论原因（打回）→ 重新派发 issue-fixer，带上打回意见和上一版 diff，原地更新同一个 PR
  打回从第三轮起换更强的模型（`vars.DIMCODE_STRONG_MODEL`，默认 gpt-6-sol）
  五轮都不过、或删改了已有来源（sources-changed）→ needs-human，等人
```

结论（mark、mode、basis、days、object、codes、kind 或档位增删）变了，agent 必须二选一表态，
否则 `check:change-record` 不过、PR 被打回：

- 厂商改了条款 → 在 `changes/<provider>/` 记一条。网站的政策变化时间线只读这里。
- 我们补证据、换来源、改正旧判断 → 在 PR 描述里写「非厂商变化」并说明理由，不进时间线
  （`docs/judgment.md`「判定不是政策变化」），由 reviewer 核实这个说法。

`retry-issue-fixer.yml` 每六小时重新派发创建超过一小时、还没有 PR 的 issue，每轮最多三条。
`dimcode-auth.yml` 每十二小时检查 DimCode 登录态，剩不到三天就续期并写回 secret（见「仓库配置」）。

全量复核：手动触发 `review-issues.yml`（可指定 provider），每个 provider 开一个
`[full-review] <provider>: <年-月>` issue，由 issue-fixer 逐个处理。

## 全量审核

`bun run audit run [provider...]` 开一个 DimAgent 会话，运行保存好的 workflow
`.agents/workflows/zdr-audit.mjs`（自动拷进 `~/.dimcode/v2/data/workflows/saved/`）。
每个 provider 两个只读子 agent：

1. 审核：对照快照逐档位、逐维度判断 correct / wrong / weak / unverifiable，找出漏收条款，
   写 `.sync/audit/<provider>.json`；
2. 复核：逐条核实前者的 wrong、weak 和漏收条款，给出 confirmed / rejected / uncertain，
   写 `.sync/audit/<provider>.review.json`。

`bun run audit report` 汇总到 `.sync/audit/report.md`，两道都确认的排在最前。`--limit` 控制并发
（默认 20；并发太高会被限流，子 agent 超时）。

批量落地用 `bun run audit fix`（workflow `zdr-fix`：每家一个修改者、一个只读检查者）和
`bun run audit verify`（确定性检查，没过的写进下一轮问题清单）。落地后 `bun run audit recheck`
（workflow `zdr-recheck`）让每家一个只读子 agent 独立重核 ✓/✗ 翻转的格子，报告在
`.sync/recheck/report.md`。

## 抓取

每个 `[[source]]` 可选 `fetch`，默认 `direct`：

| 方式 | 做法 | 适用 |
| --- | --- | --- |
| `direct` | 直接请求，本地抽正文（HTML、markdown、PDF、docx） | 服务端直出正文的页面 |
| `browser` | runner 上的无头 Chromium 渲染后抽正文 | 客户端渲染、或直接请求时好时坏的页面 |
| `jina` | Jina 渲染后的 markdown，头部元数据由我们切掉 | 数据中心 IP 被反爬挡住的页面 |

三种方式走同一套规范化：只留正文，去掉导航、页脚、链接地址和图片，一段一行，
重复长行只留一份。只有短行（菜单、按钮、「Updated 5 minutes ago」）变化不算正文变化，
不重写快照。抓取失败不写快照，只进 `.sync/snapshot-report.md`。

只要一个 provider 当天有一份快照被重写，就会走一轮快照 PR → CI → 复核 issue → agent
（按 provider 合并，每天最多一轮）。所以 diff 只认跟我们有关的变化（`src/snapshot/relevance.ts`）：

- 引文失效：原本能唯一定位的 `exact` 现在找不到或变成多处
- 页面有涉及五个维度的改动：我们引用过、或某条 unknown 结论查过的页面上，新增、删除或改写了
  碰到五个维度的句子（离引文再远也算）。改写只看真正变了的词；否定、情态、数字变了而整句讲的是
  这些维度，也算。`training`、`persist` 要同一句里有数据、内容、模型之类的对象才算
  （「training or technical assistance」是培训，「CLI choices persist」是界面设置）

都不沾的记为 `cosmetic`，不写快照：相关文章推荐、标题、目录、侧栏、cookie 横幅、示例代码、
同一句话换缩写都属于这一类。没有引文、也不在任何 `searched` 里的来源，正文怎么变都不触发。

`bun run calibrate` 对每个来源三种方式各抓一次、按引文命中数给出建议，用于新增来源
或换运行环境（本机和 GitHub runner 的出口 IP 不同）时重新确定 `fetch`。

## 本地命令

```bash
bun run snapshot [provider]          # 抓取，写 snapshots/ 和 .sync/snapshot-report.md
bun run check:quotes [provider...]   # 引文核对；--strict 有 missing 即失败，--md 输出 markdown
bun run review:issues --full [p...]  # 开全量复核 issue（需要 GH_TOKEN）；--dry-run 只打印
bun run audit run [provider...]      # 只读审核 + 复核，结果在 .sync/audit/
bun run validate                     # 数据结构
```

## 仓库配置

- bot 凭证（二选一）：用它推分支、开 PR，否则 GITHUB_TOKEN 触发的事件不会再触发其他 workflow。
  - GitHub App（推荐，对应 models.dev）：`vars.ZDR_APP_ID` + `secrets.ZDR_APP_PRIVATE_KEY`，
    App 权限 Contents / Pull requests / Issues / Secrets 读写。需要组织 owner 创建并安装。
  - 没有 App 时退回 `secrets.ZDR_BOT_TOKEN`（有本仓库 admin 权限的个人 token）。配了 App 就优先用 App。
  issue-fixer 在 agent 跑完、改动范围检查过之后才配置这个凭证，agent 运行时工作区里没有推送权限。
- DimCode 凭证：对应 models.dev 的 `OPENCODE_API_KEY`，这里用 DimAgent 的 OAuth 登录态。
  - `secrets.DIMCODE_AUTH_JSON`：`~/.dimcode/v2/auth.json`
  - `secrets.DIMCODE_MODELS_JSON`：`~/.dimcode/v2/dim-oauth-models.json`（账号可用的模型目录，
    新环境靠它注册 `dimcode-api-oauth`）

  给 CI 单独登录一次，不要直接上传本机桌面端的登录态——刷新令牌会轮换，两边各自续期会互相顶掉：

  ```bash
  ci_home="$(mktemp -d)"
  HOME="$ci_home" dim auth login --device-login   # 登录时顺带写好模型目录
  gh secret set DIMCODE_AUTH_JSON < "$ci_home/.dimcode/v2/auth.json"
  gh secret set DIMCODE_MODELS_JSON < "$ci_home/.dimcode/v2/dim-oauth-models.json"
  rm -rf "$ci_home"
  ```

  访问令牌 7 天过期。agent job 只读 secret、不续期（令牌剩不到 6 小时就直接失败），续期只在
  `dimcode-auth.yml` 里串行做并写回 secret，所以 bot 凭证要能写 secret（App 的 Secrets 读写权限，或 admin 的个人 token）。
  默认模型 `deepseek-v4.1-flash`，可用 `vars.DIMCODE_MODEL` 覆盖。
- `secrets.JINA_API_KEY`（可选）：提高 jina 方式的限额。
- Actions 设置里开启「Allow GitHub Actions to create and approve pull requests」和 auto-merge。

## Dim 项目用量

Issue Fixer、PR Reviewer 和登录态续期的模型检查都会保存本任务的用量，即使任务失败。
每次 run/attempt/job 独立保存 `dim-usage-record-<run>-<attempt>-<job>` artifact，保留 90 天。
记录只含调用时间、模型、输入/输出及缓存 token 和价格快照，不保存 prompts、模型输出、
工具参数或 OAuth 凭证。成功任务也会保存，重跑不会覆盖上一轮。

Actions → **Dim 每日用量** 的 Summary 查看按北京时间汇总的表；默认每天 00:17 生成
最近 7 个完整日及今天的记录，也可手动运行并选择 1～90 天。
手动运行时勾选 `check` 会发起一次「只回复 OK」的真实模型调用，验证采集、上传和汇总；
该检查的少量用量也会作为 `metering-check` 计入项目，默认和定时运行均不发起模型调用。
`dim-usage-report-*` artifact 中的 `daily.md` / `daily.json` 是汇总，`records.json` 保留任务明细。
还可在每次 agent 任务的 Summary 查看当次用量。

Token 来自本任务的 Dim 事件，**不使用共享账号余额差**。Credits 是当次 `/v1/models?type=dim`
目录价格乘套餐倍率的估算，缓存命中按缓存单价计，按调用开始时刻应用北京时间分时倍率，
再按 `/api/status` 的 Credits 换算配置换算；**不是实际扣账**。目录价格可能与结算价、
渠道阶梯价、长上下文价格、额外模型倍率或计费取整有差异。缺价格、倍率或换算配置时显示
「未知」，不按零消耗处理。调用跨日按开始日期归属。

任务被强制中断、模型未返回 usage 时可能漏计，汇总会标出已识别的不完整任务。
下载失败的 artifact 会显示缺口数量；无事件的任务保留在明细但不视作已确认零消耗。
安装计量之前、已过保留期、或未能上传 artifact 的任务不在记录里；无记录的日期不代表零消耗。
历史失败任务的事件只能支持局部复核，不能补成完整历史日账单。

## 变化历史

快照的 git diff 只是线索。站点变化历史只来自 agent 确认记录
`changes/<provider_id>/<observed_at>-<slug>.toml`：provider、受影响维度、观察/生效日期、
变化方向（收紧、放宽、澄清）、中英文摘要、对应 issue。agent 判断无关的变化不创建记录。

## 人工操作边界

- 不手改 `snapshots/`，那是抓取 bot 的产物；CI 会拦非 bot 分支上的快照改动。
- provider 结论变更必须说明官方来源、适用产品档位和快照里的原句。
