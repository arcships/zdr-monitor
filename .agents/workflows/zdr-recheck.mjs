// 复核批量修改里 ✓/✗ 翻转的格子：每个 provider 一个只读子 agent，逐条对照快照判断改得对不对。
//
// 任务说明由 `bun run audit recheck` 生成在 .sync/recheck/tasks/；结果写到 .sync/recheck/<provider>.json。
export const meta = {
  name: "zdr-recheck",
  description: "Independently re-check flipped ZDR ledger verdicts against snapshots: one read-only child agent per provider.",
  argsSchema: {
    type: "object",
    required: ["providers"],
    properties: {
      providers: { type: "array", items: { type: "string" } },
      limit: { type: "integer" },
      timeoutMs: { type: "integer" }
    }
  }
};

export default async function workflow(api) {
  const providers = api.args.providers;
  const limit = api.args.limit || 20;
  const timeoutMs = api.args.timeoutMs || 3600000;

  api.phase("Recheck");
  return await api.mapLimit(providers, limit, async function (provider) {
    try {
      return await api.agent(
        "读取 .sync/recheck/tasks/" + provider + ".md，严格按其中的要求复核 provider " + provider + "。",
        {
          label: provider,
          phase: "Recheck",
          tools: ["read", "glob", "grep", "write"],
          timeoutMs: timeoutMs,
          schema: {
            type: "object",
            required: ["provider", "upheld", "revert"],
            properties: { provider: { type: "string" }, upheld: { type: "integer" }, revert: { type: "integer" } }
          }
        }
      );
    } catch (e) {
      return { provider: provider, error: String((e && e.message) || e) };
    }
  });
}
