import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { htmlToText, normalize, unusable } from "../src/snapshot/extract"
import { fold, locate, occurrences } from "../src/snapshot/quote"
import { kindOf } from "../src/snapshot/fetch"
import { capture, checkQuotes, readSnapshot } from "../src/snapshot"
import { sourceId, writeProvider } from "../src/registry"

test("链接只留文字、图片丢掉——追踪参数不进快照", () => {
  const html = `<main><p>We <a href="https://x.com/?sid=123">never train</a> on your data.<img src="https://bat.bing.com/action/0?mid=abc"></p></main>`
  expect(htmlToText(html)).toBe("We never train on your data.")
})

test("去掉导航和页脚，保留 header/form/hidden 里的正文", () => {
  const html = `<body><nav>Docs Pricing</nav><form><header><h1>Terms</h1></header><div hidden>折叠的 FAQ 答案</div></form><footer>© 2026</footer></body>`
  const text = htmlToText(html)
  expect(text).not.toContain("Pricing")
  expect(text).not.toContain("2026")
  expect(text).toContain("# Terms")
  expect(text).toContain("折叠的 FAQ 答案")
})

test("不转义 markdown 字符", () => {
  expect(htmlToText("<p>3. 违约责任 [注]</p>")).toBe("3. 违约责任 [注]")
})

test("规范化：零宽字符、多余空白、纯符号行、相邻重复行", () => {
  expect(normalize("a​ b  c\n| --- |\n\nx\nx\n[文字](https://a.b/c?d=(1))")).toBe("a b c\nx\n文字")
})

test("太短、挑战页、404 不算正文", () => {
  expect(unusable("hello")).toBe("too_short")
  expect(unusable("Just a moment...\n" + "x".repeat(300))).toBe("challenge_page")
  expect(unusable("Page not found\n" + "y".repeat(300))).toBe("not_found_page")
  expect(unusable("正文".repeat(200))).toBeNull()
})

test("按 content-type 和扩展名判断类型", () => {
  expect(kindOf("application/pdf", "https://a/b", Buffer.from(""))).toBe("pdf")
  expect(kindOf("", "https://a/b", Buffer.from("%PDF-1.7"))).toBe("pdf")
  expect(kindOf("text/plain", "https://a/b", Buffer.from(""))).toBe("text")
  expect(kindOf("text/html", "https://a/terms.md", Buffer.from(""))).toBe("text")
  expect(kindOf("application/octet-stream", "https://a/DPA.docx", Buffer.from(""))).toBe("docx")
  expect(kindOf("text/html", "https://a/b", Buffer.from(""))).toBe("html")
})

test("引文匹配忽略标点和 markdown 链接地址", () => {
  const text = fold("您的数据（您与本服务交互的数据）将不会被本服务留存。")
  expect(occurrences(text, "您的数据(您与本服务交互的数据)将不会被本服务留存")).toBe(1)
  expect(occurrences(fold("see Privacy Center for details"), "see [Privacy Center](https://privacy.x/a) for")).toBe(1)
})

test("重复出现的引文靠 prefix 或 suffix 唯一定位", () => {
  const text = fold("个人版：数据将不会被本服务留存。企业版：数据将不会被本服务留存。")
  const exact = "数据将不会被本服务留存"
  expect(locate(text, { exact })).toBe(2)
  expect(locate(text, { prefix: "企业版：", exact })).toBe(1)
  expect(locate(text, { exact, suffix: "。企业版" })).toBe(1)
  expect(locate(text, { prefix: "不存在的上下文", exact })).toBe(2)
})

test("快照：抓取失败不写文件；正文没变不重写", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-snapshot-"))
  const server = Bun.serve({
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/ok"
        ? new Response(`<main><p>${"We do not train on API data. ".repeat(20)}</p></main>`, { headers: { "content-type": "text/html" } })
        : new Response("nope", { status: 500 }),
  })
  try {
    const ok = `http://localhost:${server.port}/ok`
    const bad = `http://localhost:${server.port}/bad`
    const first = await capture(root, { id: sourceId(ok), url: ok })
    expect(first.outcome).toBe("created")
    expect((await capture(root, { id: sourceId(ok), url: ok })).outcome).toBe("same")
    const failed = await capture(root, { id: sourceId(bad), url: bad })
    expect(failed.outcome).toBe("failed")
    expect(readSnapshot(root, sourceId(bad))).toBeNull()

    writeProvider(root, "demo", {
      provider: { id: "demo", name: "demo" },
      sources: [{ id: sourceId(ok), url: ok, channel: "contract", tier: "core" }],
      products: [],
      anchors: [
        { id: "hit", provider_id: "demo", source_id: sourceId(ok), topics: [], selector: { prefix: "", exact: "we do not train on API data", suffix: "" } },
        { id: "miss", provider_id: "demo", source_id: sourceId(ok), topics: [], selector: { prefix: "", exact: "we train on everything", suffix: "" } },
      ],
    })
    const states = Object.fromEntries(checkQuotes(root).map((c) => [c.anchor_id, c.state]))
    // 「We do not train」在页面里重复了 20 次，没有上下文就区分不开
    expect(states).toEqual({ hit: "ambiguous", miss: "missing" })
  } finally {
    server.stop(true)
  }
}, 60000)

test("jina 回的 text/plain 里装的是 HTML，按 HTML 抽", () => {
  expect(kindOf("text/plain", "https://a/b", Buffer.from("<!DOCTYPE html><html><body>x</body></html>"))).toBe("html")
  expect(kindOf("text/plain", "https://a/b", Buffer.from("<html lang=en><body>x</body></html>"))).toBe("html")
})

test("流式渲染占位、移动版副本造成的重复长行只留一份", () => {
  const para = "If you enable Privacy Mode, code data will never be stored or used for training."
  const html = `<body><main><p>${para}</p></main><div hidden id="S:0"><p>${para}</p></div><div class="mobile"><p>${para}</p></div><p>是</p><p>否</p><p>是</p></body>`
  const text = htmlToText(html)
  expect(text.split(para).length - 1).toBe(1)
  expect(text.split("\n").filter((l) => l === "是").length).toBe(2)
})

test("只有短行（导航、时间戳）变化不算正文变化；长句变化或挪位算", async () => {
  const { sameMaterial } = await import("../src/snapshot")
  const clause = "如您使用本服务企业版，您的数据将不会被本服务留存，请您自行存储和备份。"
  const other = "如您使用本服务个人版，您同意并授权我们存储并使用您输入以及模型输出的内容。"
  expect(sameMaterial(`菜单\n${clause}\nUpdated 2 minutes ago`, `导航\n${clause}\nUpdated 5 minutes ago`)).toBe(true)
  expect(sameMaterial(`${clause}\n${other}`, `${other}\n${clause}`)).toBe(false)
  expect(sameMaterial(clause, clause.replace("不会", "会"))).toBe(false)
})

test("快照 diff：只有跟引文有关、或页面新增相关表述的变化才重写快照", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zdr-snapshot-"))
  let body = ""
  const server = Bun.serve({ port: 0, fetch: () => new Response(body, { headers: { "content-type": "text/html" } }) })
  const quote = "We do not use data submitted through the API to train our models."
  const filler = (n: number) => `This paragraph number ${n} explains billing and invoices for the platform in detail.`
  const page = (opts: { related?: string; after?: string; retention?: string } = {}) =>
    [
      "<main>",
      "<h2>Training</h2>",
      `<p>${filler(1)}</p>`,
      `<p>${quote}${opts.after ?? ""}</p>`,
      `<p>${filler(2)}</p>`,
      "<h2>Billing</h2>",
      ...[3, 4, 5, 6, 7].map((n) => `<p>${filler(n)}</p>`),
      `<p>${opts.retention ?? "Invoices are emailed to the billing contact at the start of each month."}</p>`,
      `<p>${opts.related ?? "* Using Codex with your plan Learn how to connect Codex to your workspace."}</p>`,
      "</main>",
    ].join("")
  try {
    const url = `http://localhost:${server.port}/policy`
    const src = { id: sourceId(url), url }
    const cited = { anchors: [{ prefix: "", exact: quote, suffix: "" }], searched: false }
    body = page()
    expect((await capture(root, src, false, cited)).outcome).toBe("created")
    const saved = readSnapshot(root, src.id)

    // 离引文很远的小节里换了推荐文章、改了一句话：跟我们引用的无关
    body = page({ related: "* Data residency Learn how data residency affects storage and regions.", retention: "Invoices are sent to the billing contact on the first business day of each month." })
    expect((await capture(root, src, false, cited)).outcome).toBe("cosmetic")
    expect(readSnapshot(root, src.id)).toBe(saved)

    // 引文还在，但它后面多了一句限定：上下文变了
    body = page({ after: " Unless you opt in to sharing." })
    const ctx = await capture(root, src, false, cited)
    expect(ctx.outcome).toBe("changed")
    expect(ctx.reasons?.[0]).toStartWith("引文上下文变了")

    // 引文本身改了
    body = page().replace("do not use", "may use")
    const lost = await capture(root, src, false, cited)
    expect(lost.outcome).toBe("changed")
    expect(lost.reasons?.[0]).toStartWith("引文失效")

    // 引用过的页面：离引文很远的小节新增了保留期限的句子，也算新表述
    body = page()
    await capture(root, src, false, cited)
    body = page({ retention: "API inputs and outputs are retained for up to 30 days to identify abuse, then deleted." })
    const far = await capture(root, src, false, cited)
    expect(far.outcome).toBe("changed")
    expect(far.reasons?.[0]).toStartWith("页面新增")

    // 没有引文、但是 unknown 结论查过的页面：同样算
    const other = { id: sourceId(`${url}/faq`), url: `${url}/faq` }
    const searched = { anchors: [], searched: true }
    body = page()
    expect((await capture(root, other, false, searched)).outcome).toBe("created")
    body = page({ retention: "API inputs and outputs are retained for up to 30 days to identify abuse, then deleted." })
    const found = await capture(root, other, false, searched)
    expect(found.outcome).toBe("changed")
    expect(found.reasons?.[0]).toStartWith("页面新增")

    // 什么都不关心的来源：正文怎么变都不重写
    body = page({ retention: "API inputs and outputs are retained for up to 90 days to identify abuse, then deleted." })
    expect((await capture(root, other)).outcome).toBe("cosmetic")
  } finally {
    server.stop(true)
  }
})
