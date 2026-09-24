// ZDR 台账的只读审核：每个 provider 两个子 agent，一个审核、一个复核。
//
// 任务说明由 `bun run audit prepare` 生成在 .sync/audit/tasks/ 和 .sync/audit/review-tasks/；
// 子 agent 各自把结果写到 .sync/audit/<provider>.json 和 .sync/audit/<provider>.review.json。
// 脚本只做编排，返回每个 provider 的计数。
//
// 安装：拷到 $DIMCODE_HOME/data/workflows/saved/（`bun run audit` 会自动做）。
export const meta = {
  name: "zdr-audit",
  description: "Read-only audit of ZDR ledger providers: one auditor and one reviewer child agent per provider.",
  argsSchema: {
    type: "object",
    required: ["providers"],
    properties: {
      providers: { type: "array", items: { type: "string" } },
      limit: { type: "integer" },
      timeoutMs: { type: "integer" },
      skipAudit: { type: "boolean" }
    }
  }
};

const TOOLS = ["read", "glob", "grep", "write"];

export default async function workflow(api) {
  const providers = api.args.providers;
  const limit = api.args.limit || 20;
  const timeoutMs = api.args.timeoutMs || 3600000;

  const run = async function (label, phase, prompt, properties) {
    try {
      return await api.agent(prompt, {
        label: label,
        phase: phase,
        tools: TOOLS,
        timeoutMs: timeoutMs,
        schema: { type: "object", required: Object.keys(properties), properties: properties }
      });
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  };

  api.phase("Audit");
  return await api.mapLimit(providers, limit, async function (provider) {
    const audit = api.args.skipAudit
      ? { skipped: true }
      : await run(provider, "Audit",
          "读取 .sync/audit/tasks/" + provider + ".md，严格按其中的要求完成对 provider " + provider + " 的只读审核。",
          { provider: { type: "string" }, correct: { type: "integer" }, wrong: { type: "integer" }, weak: { type: "integer" }, unverifiable: { type: "integer" } });
    if (audit.error) return { provider: provider, audit: audit };
    const review = await run(provider + " review", "Review",
      "读取 .sync/audit/review-tasks/" + provider + ".md，严格按其中的要求完成对 provider " + provider + " 审核结果的复核。",
      { provider: { type: "string" }, confirmed: { type: "integer" }, rejected: { type: "integer" }, uncertain: { type: "integer" } });
    return { provider: provider, audit: audit, review: review };
  });
}
