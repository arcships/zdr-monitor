/** 不确定的东西走 issue,不进数据。
 *
 *  台账里没有 needs_review 这类字段。正文变化、锚点丢失和来源连续不可达
 *  显式路由给调查 agent,而不是自动改结论。 */

export type IssueKind = "document-changed" | "anchor-lost" | "unreachable"

export interface Issue {
  kind: IssueKind
  provider_id: string
  subject: string
  title: string
  body: string
}

/** 标题必须稳定,否则去重就失效,同一个问题每天开一个新 issue。 */
export const titleOf = (kind: IssueKind, providerId: string, subject: string) =>
  `[${kind}] ${providerId}: ${subject}`

export function anchorLost(providerId: string, anchorId: string, url: string, exact: string): Issue {
  return {
    kind: "anchor-lost",
    provider_id: providerId,
    subject: anchorId,
    title: titleOf("anchor-lost", providerId, anchorId),
    body: [
      `锚点 \`${anchorId}\` 在最新正文里定位不到了。`,
      "",
      `来源:${url}`,
      "",
      "原条款:",
      "",
      "> " + exact,
      "",
      "去官方页面确认这条款是改了词、挪了位置、还是真的删了。",
      "",
      "**条款找不到不等于厂商撤销了承诺。**",
      "不要因为这个 issue 就改结论,也不要把锚点改绑到最新版本或伪造 prefix/suffix。",
      "把 issue 里的旧引文当线索,不当答案——那正是出问题的东西。",
    ].join("\n"),
  }
}

export function unreachable(providerId: string, url: string, verdicts: string[]): Issue {
  return {
    kind: "unreachable",
    provider_id: providerId,
    subject: url.replace(/^https?:\/\//, "").slice(0, 60),
    title: titleOf("unreachable", providerId, url.replace(/^https?:\/\//, "").slice(0, 60)),
    body: [
      `来源连续抓取失败:${url}`,
      "",
      `最近的判定:${verdicts.map((v) => "`" + v + "`").join(" · ")}`,
      "",
      "找现行的官方 URL 替换。如果页面确实下线了,把依赖它的结论一并处理。",
      "",
      "**抓取失败是关于我们的事实,不是关于厂商的结论。**",
      "不要因为抓不到就把对应维度写成「未披露」。",
    ].join("\n"),
  }
}

/** 连续失败多少次才开 issue。jina 偶尔抽风,一次失败不值得惊动 agent。 */
export const FAILURE_THRESHOLD = 3

/** 文档正文变了。
 *
 *  即使另有锚点 reworded/gone issue,完整 diff 仍要单独交给 agent；否则只修旧
 *  锚点时可能漏掉同一版本里新加的条款。机器判断不了「这段新内容要不要紧」。 */
export function documentChanged(
  providerIds: string[],
  url: string,
  fromVersion: string,
  toVersion: string,
  hunks: { kind: string; text: string }[],
): Issue {
  const owner = providerIds.join(", ") || "未归属"
  const added = hunks.filter((h) => h.kind === "added")
  const removed = hunks.filter((h) => h.kind === "removed")
  return {
    kind: "document-changed",
    provider_id: providerIds[0] || "unknown",
    subject: url.replace(/^https?:\/\//, "").slice(0, 60),
    title: titleOf("document-changed", owner, url.replace(/^https?:\/\//, "").slice(0, 60)),
    body: [
      `政策文档正文有变动,需要检查完整 diff 是否影响五个维度。`,
      "",
      `文档:${url}`,
      `影响:${owner}`,
      `版本:\`${fromVersion}\` → \`${toVersion}\``,
      "",
      `新增 ${added.length} 处,删除 ${removed.length} 处:`,
      "",
      "```diff",
      ...added.slice(0, 15).map((h) => "+ " + h.text.slice(0, 300)),
      ...removed.slice(0, 15).map((h) => "- " + h.text.slice(0, 300)),
      "```",
      "",
      "要判断的是:**这些变动里有没有影响五个维度的内容?**",
      "",
      "- 有 → 建新锚点,或修正已有结论",
      "- 没有 → 关掉这个 issue,并说明为什么无关",
      "",
      "锚点只覆盖正文约 1%,所以正文变了而锚点没动,不代表政策没变——",
      "可能是厂商新增了一条我们从没盯过的条款。",
    ].join("\n"),
  }
}
