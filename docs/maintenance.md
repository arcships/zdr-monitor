# 维护流程

机器负责可确定的抓取和校验；DimCode agent 负责来源策展和政策语义，并通过 PR 交付，
不能直接修改主分支。

## 目前实际运行的 CI

`.github/workflows/fetch.yml` 每天运行一次：

1. `bun run fetch`：汇总并限速抓取所有 provider 声明的 URL；
2. `bun run verify:anchors`：在已保存正文上核验锚点；
3. `bun run issues:open`：为正文变化、锚点丢失和连续失败开 issue；
4. 只允许提交 `documents/`、`health/`；
5. 上传 `.sync/fetch.json` 和 `.sync/verify-anchors.json` 作为 7 天 artifact；
6. 若有抓取失败，报告和 issue 处理完后仍让 job 失败。

`.github/workflows/validate.yml` 在 push 和 PR 上运行数据校验、测试、前后端类型检查与站点
构建。构建成功只证明产物可生成，不会自动部署。

机器抓取产物可以自动提交，因为它们是可复核的观察；`providers/*.toml` 是语义结论，必须由
agent 或人修改并通过 PR 复核。`issue-fixer.yml` 会直接在 GitHub Actions 中启动 DimCode，
处理三类同步 issue；它只允许改 provider 和已确认变化记录，workflow 负责校验、提交和开 PR。
`retry-issue-fixer.yml` 每六小时重新派发创建超过一小时、仍没有 PR 的任务，每轮最多三条。

DimCode workflow 需要仓库 secret `DIMCODE_API_KEY`。默认使用 `deepseek-v4-flash`，可通过
repository variable `DIMCODE_MODEL` 覆盖。密钥只供 runner 登录 DimCode，不写入仓库或 issue。

## 两条工作流

### 首次纳入 provider

```text
agent 调研官方来源
  → research:fetch 直接为已策展 URL 建立正式 baseline
  → agent 基于 baseline 写结论与锚点
  → research:import 强制检查 baseline 和 exact 命中，一次写入完整 provider
  → validate + test
```

### 每日监控

```text
fetch
  ├─ 成功且相同：无写入
  ├─ 成功且变化：新快照 + current 指针 + 完整 diff
  └─ 失败：更新 health，保留最后成功正文
        ↓
verify:anchors
  ├─ exact：无动作
  ├─ reworded/gone：待 agent 复核
  └─ health 存在/无 baseline：skip，不判 gone
        ↓
issues:open
  ├─ document-changed
  ├─ anchor-lost
  └─ unreachable（连续失败达到阈值）
        ↓
repository_dispatch
        ↓
DimCode 对照两份不可变快照，决定是否修改 provider 和记录已确认变化
  ├─ 有安全改动：validate + test + typecheck + build → PR
  ├─ 确认无实质变化：评论依据并关闭 issue
  └─ 证据不足/需要新 baseline：评论原因并标记 dim:blocked
```

完整正文 diff 不做政策关键词过滤。它是发现“既有锚点之外新增条款”的入口，不是直接发布
到网站的变化历史。页面装修等无关变化由 agent 审阅后关闭 issue，不产生确认记录。

## Agent 角色

`.agents/skills/` 提供四份角色提示，但目前只是操作规范，不代表 CI 已自动调用它们：

| 角色 | 工作 | 可修改范围 |
| --- | --- | --- |
| `policy-sync` | 运行并解释抓取/锚点报告 | 机器产物；不改 provider 结论 |
| `issue-fixer` | 查官方原文，处理复核 issue | `providers/*.toml` |
| `pr-reviewer` | 审证据、适用档位和结论 | 只读 |
| `ci-fixer` | 修格式、schema、代码检查失败 | 报错涉及的文件 |

所有 agent 共用 [AGENTS.md](../AGENTS.md) 的证据规则。issue 是线索，不是证据；每条结论
仍需回到官方来源和已保存正文验证。

## Issue 类型

| 类型 | 触发 | Agent 动作 |
| --- | --- | --- |
| `document-changed` | 正文 hash 变化且有行级 diff | 判断是否影响五个维度 |
| `anchor-lost` | 锚点为 `gone` | 查条款是改写、迁移还是删除 |
| `unreachable` | 同一来源连续失败 ≥ 3 次 | 找现行官方 URL 或修抓取路径 |

标题稳定，并在 open + closed issue 中去重。抓取失败不能写成“厂商未披露”；`gone` 也不能
自动改结论。

## 变化历史

原始 diff 只是机器线索。站点变化历史应来自 agent 确认记录，最小字段为：

- provider 和受影响维度；
- 观察日期/官方生效日期；
- `from_version` / `to_version`；
- 变化方向（收紧、放宽、澄清）和中英文摘要；
- 对应复核 issue。

agent 判断无关的 diff 不创建记录。有意义的变化写入
`changes/<provider_id>/<observed_at>-<slug>.toml`；`validate` 会检查 provider、source、前后
快照和字段约束，站点 `/changes` 只读取这些确认记录。Git commit、raw diff 和未关闭 issue
都不会自动展示成“厂商政策变化”。

## 人工操作边界

- 不手改 `documents/`、`health/`；
- provider 结论变更必须说明官方来源、适用产品档位和具体引文；
- 发布、推送、部署等外部动作仍需对应仓库权限与明确授权。
