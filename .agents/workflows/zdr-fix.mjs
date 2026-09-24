// 按审核结果修正 ZDR 台账：每个 provider 两个子 agent，一个修改、一个检查。
//
// 任务说明由 `bun run audit fix` 生成在 .sync/fix/tasks/ 和 .sync/fix/check-tasks/；
// 修改者只动 providers/<provider>.toml，检查者只读、把结论写到 .sync/fix/<provider>.check.json。
export const meta = {
  name: "zdr-fix",
  description: "Apply confirmed ZDR ledger audit findings: one fixer and one checker child agent per provider.",
  argsSchema: {
    type: "object",
    required: ["providers"],
    properties: {
      providers: { type: "array", items: { type: "string" } },
      limit: { type: "integer" },
      timeoutMs: { type: "integer" },
      skipFix: { type: "boolean" }
    }
  }
};

export default async function workflow(api) {
  const providers = api.args.providers;
  const limit = api.args.limit || 20;
  const timeoutMs = api.args.timeoutMs || 3600000;

  const run = async function (label, phase, prompt, tools, properties) {
    try {
      return await api.agent(prompt, {
        label: label,
        phase: phase,
        tools: tools,
        timeoutMs: timeoutMs,
        schema: { type: "object", required: Object.keys(properties), properties: properties }
      });
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  };

  api.phase("Fix");
  return await api.mapLimit(providers, limit, async function (provider) {
    const fix = api.args.skipFix
      ? { skipped: true }
      : await run(provider, "Fix",
          "读取 .sync/fix/tasks/" + provider + ".md，严格按其中的要求修改 providers/" + provider + ".toml。",
          ["read", "glob", "grep", "edit", "write"],
          { provider: { type: "string" }, applied: { type: "integer" }, skipped: { type: "integer" } });
    if (fix.error) return { provider: provider, fix: fix };
    const check = await run(provider + " check", "Check",
      "读取 .sync/fix/check-tasks/" + provider + ".md，严格按其中的要求检查 providers/" + provider + ".toml 的修改。",
      ["read", "glob", "grep", "write"],
      { provider: { type: "string" }, ok: { type: "integer" }, bad: { type: "integer" } });
    return { provider: provider, fix: fix, check: check };
  });
}
