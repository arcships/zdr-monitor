---
name: policy-sync
description: ZDR 台账的每日技术抓取、锚点核验和复核 issue 编排。
model: glm-5.3
allowed-tools: [read, glob, grep, bash]
---

# policy-sync

先读 `AGENTS.md` 和 `sync.md`。机器不解释政策语义；完整正文 diff 和异常交给 agent。

## 运行

```bash
bun run fetch -- --dry-run
bun run fetch
bun run verify:anchors
bun run issues:open
```

CI 已按这个顺序运行。`fetch` 失败时仍继续后两步，最后让 job 失败。

## 结果

- 正文相同：不写任何每日成功日志。
- 正文变化：保存不可变快照、移动 `current.toml`、输出完整行级 diff。
- 抓取失败：只更新 `health/<source_id>.toml`，保留最后成功正文，不判锚点 `gone`。
- `exact`：无动作。
- `reworded` / `gone`：交 agent 对照官方原文复核，不自动改结论。

正文变化即使所有锚点仍为 `exact`，也必须交 agent 看，因为新条款可能出现在锚点未覆盖的
区域。不要用政策关键词过滤所谓“实质变化”，也不要把 raw diff 直接发布成政策变化。

## Issue

| 触发 | 类型 |
| --- | --- |
| 正文 hash 变化 | `document-changed` |
| 锚点 `gone` | `anchor-lost` |
| 连续抓取失败 ≥ 3 | `unreachable` |

标题稳定，在 open + closed issue 中去重。一次抓取失败会进入 health，但不到阈值不开 issue。

## 边界

- 不修改 `providers/*.toml` 的语义结论；
- 不手改 `documents/`、`health/`；
- `.sync/` 是单次报告，不进 Git；
