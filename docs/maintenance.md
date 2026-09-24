# 维护流程

照 models.dev 的维护方式：机器负责抓取和确定性校验，DimCode agent 负责政策语义；
所有改动都是 PR，一个 provider 一个 agent。

## 链路

```text
snapshot.yml（每天，按 provider 展开 matrix）
  抓这个 provider 引用的来源 → 规范化 → 写 snapshots/<source_id>.md
  有变化 → 固定分支 automation/snapshot-<provider>，原地更新同一个 PR
        → snapshot:auto-merge 判定安全就自动合并（引文成片失效时留给人），
          并判断变化碰没碰到五个维度：碰到了打 needs-review 标签
        ↓ 合并
review-issues.yml（只处理带 needs-review 的快照 PR）
  开 [policy-review] <provider>: snapshot #<PR>，派发 issue-fixer
        ↓
issue-fixer.yml（DimCode，一个 issue = 一个 provider = 一个 agent）
  只能改 providers/<provider>.toml 和 changes/<provider>/
  → workflow 为新来源抓快照 → validate + check:quotes --strict → PR dim/issue-<n>
  → 无需改动：评论理由并关闭 issue；证据不足：打 blocked
        ↓
pr-reviewer.yml（DimCode 只读，跳过快照 PR）→ 评论待办或打 reviewer: ready → 人合并
```

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

快照更新不等于叫 agent。`src/snapshot/relevance.ts` 只在变化碰到五个维度时才开复核：
原本能定位的引文失效，或者变化的句子里出现训练、保留、删除、角色、数据驻留、期限这类词。
相关文章推荐、页面标题、目录项、侧栏、cookie 横幅、示例代码不算；同一句话换缩写不算；
「do not use … to train」改成「may use … to train」这种只变了否定/情态词的算。

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

## 变化历史

快照的 git diff 只是线索。站点变化历史只来自 agent 确认记录
`changes/<provider_id>/<observed_at>-<slug>.toml`：provider、受影响维度、观察/生效日期、
变化方向（收紧、放宽、澄清）、中英文摘要、对应 issue。agent 判断无关的变化不创建记录。

## 人工操作边界

- 不手改 `snapshots/`，那是抓取 bot 的产物；CI 会拦非 bot 分支上的快照改动。
- provider 结论变更必须说明官方来源、适用产品档位和快照里的原句。
