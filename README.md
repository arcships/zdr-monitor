# zdr

各家 LLM 供应商的数据处理政策台账。**每个 ✓ / ✗ 都能点开看到官方原文那一句。**

站点 <https://arcships.github.io/zdr-monitor/> · 数据 <https://arcships.github.io/zdr-monitor/api.json> · agent 先读 [/llms.txt](https://arcships.github.io/zdr-monitor/llms.txt)

```
83 家 · 307 个档位 · 1535 条判定 · 2591 条引文 · 每天重抓比对
```

## 它回答五个问题

| 维度 | 问的是 |
| --- | --- |
| `training` | 是否承诺不用于训练？（拿去「改进服务质量」也算训练） |
| `zdr` | 能否做到零数据保留？ |
| `retention` | 推理输入输出保留多久 |
| `processing_region` | 在哪处理 |
| `role` | 合同角色：受托处理 / 独立控制者 / 次级受托 / 未约定 |

**档位是一等公民，不是厂商。** 同一家厂商的个人档和企业档常常条款相反——
Z.AI Coding Plan 国际站团队版承诺不训练且零保留，个人版两样都没有。
把一家折成一行结论，得到的一定是错的。

## 读一条结论要知道的三件事

1. **`mark` 回答的是列名那个问题。** `training` 列问「是否不用于训练」，
   所以 `yes` = 不训练、`no` = 会训练。按「会不会训练」的方向读会全反。
2. **`unknown` 是「翻遍官方文档没找到这条承诺」，不是「还没查」。**
   这类条目会列出查过哪些页面（`searched`，API 里也导出了）。
3. **`mode` 说的是这个结论怎么达成。** 同样是 ✓，`by_contract`（商业合同禁止）、
   `opt_out`（你得自己去关开关）、`by_deployment`（数据没出你的机房，不是厂商承诺）
   对采购是三件完全不同的事。

## 数据出口

静态 JSON，直接取用，不需要 key：

| 出口 | 内容 |
| --- | --- |
| `/api.json` | 全量。照 models.dev 的约定，顶层键是厂商 id：`api["cursor"].plans["cursor/teams"].training.quote` 一路直取 |
| `/_catalog.json` | 只要表格：一行一个档位，五维结论加极简标签。一次性问答从它开始，别上来就拉 2MB |
| `/p/<company>.json` | 单家详情：档位、证据、全部受监控文档 |
| `/_changes.json` | 已确认的政策变化 |
| `/_meta.json` | 生成时间、维度列表、抓取健康度 |
| `/llms.txt` | 给 agent 的说明：字段级 schema、读取陷阱、收录边界 |

## 核心原则

1. **结论绑定保存下来的官方原文。** 每个锚点引用 `documents/` 中的不可变快照，厂商改页
   不会悄悄改写旧证据。
2. **抓取与解释分开。** 机器只抓正文、做技术校验、比较版本和匹配锚点；agent 负责来源
   策展、权威性和政策语义。
3. **抓取失败不是未披露。** 失败时保留最后成功正文，不移动锚点，只记录当前异常。
4. **原始页面变化不是政策变化。** 完整 diff 是待审线索；只有 agent 确认后才能出现在站点
   的变化历史里。

## 命令

```bash
bun run fetch                         # 抓全部已登记来源
bun run fetch -- volcengine           # 抓一家已导入 provider 引用的来源
bun run fetch -- <source_id> --dry-run
bun run verify:anchors                # 在当前正式快照上核验锚点
bun run issues:open -- --dry-run      # 查看会开的复核 issue
bun run validate
bun test
bun run typecheck
bun run build
```

首次纳入新 provider 使用 `research:fetch → research:import`，详见
[sync.md](sync.md)。

## 目录

```text
providers/<provider_id>.toml                  来源、产品档位、当前结论和证据锚点
documents/<source_id>/<version_id>.md         不可变 Markdown 快照
documents/<source_id>/history.toml            版本记录 + 当前版本指针
health/<source_id>.toml                       当前抓取异常，恢复后删除
changes/<provider_id>/<date>-<slug>.toml      agent 确认的政策变化
packages/core/src/sync/                       抓取、版本、diff、健康状态
packages/core/src/verify/                     纯文本锚点核验
packages/core/script/                         CLI
```

单次运行报告放在 `.sync/` 并由 CI artifact 保存，不用每日成功日志污染 Git。

## 站点发布

`bun run build` 生成 `packages/web/dist/`。合入 `main` 后，GitHub Actions 会构建并发布到
GitHub Pages。站点使用 hash 路由，详情页地址形如
`https://arcships.github.io/zdr-monitor/#/p/openai`，直接刷新不会依赖服务端 rewrite。

## 纠错

发现某一格和厂商现行条款对不上，开 issue 贴上**官方页面链接和那一句原文**即可——
台账的规矩是结论必须绑定引文，所以纠错也以引文为准，不接受「我听说」。

## 许可

代码与结构化数据：[MIT](LICENSE)。

引文本身不在此列——那是各家厂商政策原文的逐字摘录，著作权属于对应厂商，
这里按事实性引用收录并标明出处。转载结论时请一并带上来源链接，
读者才能自己回到原文核对。

## 文档

- [sync.md](sync.md) — 首次纳入、日常抓取、锚点核验和变化确认的完整流程
- [docs/scope.md](docs/scope.md) — provider 与产品档位的收录范围
- [docs/judgment.md](docs/judgment.md) — 五个维度的判定口径
- [docs/maintenance.md](docs/maintenance.md) — CI 与 agent 的实际维护方式
- [AGENTS.md](AGENTS.md) — 修改数据和证据时必须遵守的规则
