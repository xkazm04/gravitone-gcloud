// LANE — THE ARTICLE CHECK (lib/articles/checks.ts): deterministic measurements.
//
// Each item is driven in both directions on synthetic input: a page that meets
// the bar passes and the same page with one defect seeded fails THAT item and
// names the defect. The rendered half opens real pages in Playwright's
// chromium, so the type-size numbers are computed styles, not regexes. The two
// dimensions no code can judge come back `not-measured`, never `pass`.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { citedNumbers, firstPersonHits, htmlProse, proseRuns, runCheck, staticItems, summarize, THRESHOLDS } from "@/lib/articles/checks";
import type { CheckItem, Source } from "@/lib/articles/types";

const SOURCES: Source[] = Array.from({ length: 8 }, (_, i) => ({
  n: i + 1,
  url: `https://example.org/s${i + 1}`,
  title: `Source ${i + 1}`,
  publisher: "Example",
  date: `2026-0${(i % 9) + 1}-01`,
  primary: i < 3,
  counter: i === 7,
  took: "a fact",
}));

const PARA = "A tokenizer splits text into pieces learned from a corpus, and the count of pieces sets the bill for every request that carries the text [1].";

function page(opts: { bodyPx?: number; firstPerson?: boolean; figures?: number; plainCode?: boolean; external?: boolean; noPreview?: boolean } = {}): string {
  const figs = Array.from({ length: opts.figures ?? 5 }, (_, i) => `<figure><img src="figures/0${i + 1}-f.svg" alt="f"><figcaption>Figure ${i + 1} shows a step [${(i % 8) + 1}]</figcaption></figure>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:Georgia,serif} main{max-width:680px;margin:0 auto;padding:0 16px}
p,li{font-size:${opts.bodyPx ?? 20}px;line-height:1.6} figcaption{font-size:14px} img{max-width:100%}
@media (prefers-color-scheme: dark){body{background:#111;color:#eee}}</style>
${opts.external ? '<link rel="stylesheet" href="https://fonts.example.org/x.css">' : ""}
</head><body><main><h1>Title</h1>
${opts.noPreview ? "" : '<nav data-role="content-preview"><p>What follows</p><ol><li>One</li><li>Two</li><li>Three</li></ol></nav>'}
<h2>One</h2><p>${PARA}</p><p>${opts.firstPerson ? "We measured this ourselves and I think it holds [2]." : "The measurement shows the gap holds across scripts [2]."}</p>
${figs}
<pre><code class="language-js">${opts.plainCode ? "const x = 1;" : '<span class="tok-kw">const</span> x = 1;'}</code></pre>
<ol id="sources">${SOURCES.map((s) => `<li id="src-${s.n}"><a href="${s.url}">${s.title}</a></li>`).join("")}</ol>
<p>${[1, 3, 4, 5, 6, 7, 8].map((n) => `<a href="#src-${n}">[${n}]</a>`).join(" ")}</p>
</main></body></html>`;
}

const md = `# Title\n\n*Sub*\n\n${PARA}\n\nThe measurement shows the gap holds across scripts [2].\n\n| Tool | Field |\n|---|---|\n| a | b |\n\n## Sources\n\n1. x\n`;
const files = (n = 5) => new Set(Array.from({ length: n }, (_, i) => `figures/0${i + 1}-f.svg`));
const svg = (words: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${words}</text></svg>`;
const figures = (n = 5, label = "Step one") => Array.from({ length: n }, (_, i) => ({ name: `0${i + 1}-f.svg`, svg: svg(label) }));
const byId = (items: CheckItem[], id: string) => items.find((i) => i.id === id)!;

test("static: a page that meets every bar passes every static item", () => {
  const items = staticItems({ html: page(), md, sources: SOURCES, claims: [{ text: "x", source: 1 }], figures: figures(), postFiles: files() });
  const failed = items.filter((i) => i.status === "fail").map((i) => `${i.id}: ${(i.detail ?? []).join("; ")}`);
  expect(failed).toEqual([]);
  expect(items.length).toBeGreaterThan(15);
});

test("static: each seeded defect fails its own item and names itself", () => {
  const base = { md, sources: SOURCES, claims: [{ text: "x", source: 1 }], figures: figures(), postFiles: files() };
  const fp = byId(staticItems({ ...base, html: page({ firstPerson: true }) }), "first-person");
  expect(fp.status).toBe("fail");
  expect(fp.detail!.join(" ")).toMatch(/We measured/);

  expect(byId(staticItems({ ...base, html: page({ figures: 3 }), postFiles: files(3) }), "figure-count")).toMatchObject({ status: "fail", value: 3 });
  expect(byId(staticItems({ ...base, html: page({ plainCode: true }) }), "code-highlighted").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page({ external: true }) }), "offline").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page({ noPreview: true }) }), "content-preview").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), figures: figures(5, "this label runs on for far too many words to be a label at all really") }), "figure-label-length").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), sources: SOURCES.slice(0, 5) }), "source-count")).toMatchObject({ status: "fail", value: 5 });
  expect(byId(staticItems({ ...base, html: page(), sources: SOURCES.map((s) => ({ ...s, counter: false })) }), "source-counter").status).toBe("fail");
  const undated = byId(staticItems({ ...base, html: page(), sources: SOURCES.map((s) => (s.n === 4 ? { ...s, date: "last spring" } : s)) }), "source-dates");
  expect(undated.status).toBe("fail");
  expect(undated.detail!.join(" ")).toMatch(/\[4\]/);
  const unresolved = byId(staticItems({ ...base, html: page(), md: md.replace("## Sources", "An orphan claim [12].\n\n## Sources") }), "citation-resolution");
  expect(unresolved.status).toBe("fail");
  expect(unresolved.detail!.join(" ")).toMatch(/\[12\]/);
  expect(byId(staticItems({ ...base, html: page(), claims: [{ text: "x", source: 99 }] }), "claims-resolve").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), md: `${md}\n[insert chart here]` }), "no-placeholders").status).toBe("fail");

  // the owner's rules after the first full run (2026-10-06)
  const dash = byId(staticItems({ ...base, html: page(), md: md.replace("holds across", "holds — across") }), "no-em-dash");
  expect(dash.status).toBe("fail");
  expect(dash.detail!.join(" ")).toMatch(/post\.md: 1/);
  expect(byId(staticItems({ ...base, html: page(), figures: figures(5, "a – b") }), "no-em-dash").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), md: md.replace("*Sub*", "*Sub* 14 min read") }), "read-time").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), md: md.replace("*Sub*", "*Sub*\n\nAt 230 words a minute") }), "read-time").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page().replace("<p>What follows</p>", "<p>What follows, 9 min read</p>") }), "content-preview").status).toBe("fail");
  expect(byId(staticItems({ ...base, html: page(), md: md.replace(/\| Tool[\s\S]*?\| a \| b \|\n\n/, "") }), "closing-table").status).toBe("fail");
});

test("visual cadence: runs of prose, and what resets them", () => {
  const P = (n: number) => `Paragraph ${n} says one thing about tokenizers and their cost.`;
  const fig = "![Figure 1](figures/01-f.png)\n*Figure 1. A caption [1].*";
  const ok = `# T\n\n*Sub*\n\n${P(1)}\n\n${P(2)}\n\n${fig}\n\n${P(3)}\n\n${P(4)}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n${P(5)}\n\n## Sources\n\n1. x\n`;
  expect(proseRuns(ok).longest).toBe(2);
  const bad = `# T\n\n${P(1)}\n\n${P(2)}\n\n${P(3)}\n\n${fig}\n\n## Sources\n\n1. x\n`;
  const r = proseRuns(bad);
  expect(r.longest).toBe(3);
  expect(r.runs[0]).toMatch(/Paragraph 3/);
  // a fenced block and a blockquote callout reset; a list and a heading do not
  expect(proseRuns(`${P(1)}\n\n${P(2)}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n\n${P(3)}\n\n${P(4)}\n\n> **Note** one fact\n\n${P(5)}`).longest).toBe(2);
  // the rule-fenced content preview is one boxed visual
  expect(proseRuns(`# T\n\n${P(1)}\n\n---\n\n**What this is.** ${P(2)}\n\n**Route.**\n\n---\n\n## One\n\n${P(3)}\n\n${P(4)}`).longest).toBe(2);
  expect(proseRuns(`${P(1)}\n\n## H\n\n- a\n- b\n\n${P(2)}\n\n${P(3)}`).longest).toBe(3);
  expect(byId(staticItems({ html: page(), md: bad, sources: SOURCES, claims: [], figures: figures(), postFiles: files() }), "visual-cadence").status).toBe("fail");
});

test("first person: what counts and what does not", () => {
  expect(firstPersonHits("The team found that our numbers hold.")).toHaveLength(1);
  expect(firstPersonHits("I measured it.")).toHaveLength(1);
  expect(firstPersonHits("Disk I/O dominates; the US market differs.")).toEqual([]);
  expect(firstPersonHits('A reviewer wrote "we were wrong" in the thread.')).toEqual([]);
  expect(firstPersonHits("The meme spread; Mesopotamia; ourselves")).toHaveLength(1);
  expect(htmlProse("<p>x</p><pre><code>we my our</code></pre><blockquote>we</blockquote>", { dropQuotes: true })).toBe("x");
  expect(citedNumbers("a [1] b [2, 4] c [5–7] d [x]")).toEqual([1, 2, 4, 5, 6, 7]);
});

test("summary: storytelling and depth are not measured, and failures come first", () => {
  const items = staticItems({ html: page({ figures: 3 }), md, sources: SOURCES, claims: [], figures: figures(3), postFiles: files(3) });
  const r = summarize(items, "2026-10-05T00:00:00.000Z", []);
  expect(r.notMeasured).toEqual(["storytelling", "depth"]);
  expect(r.dimensions.storytelling).toBeUndefined();
  expect(r.dimensions.figures).toBe("fail");
  expect(r.dimensions.truth).toBe("pass");
  expect(r.items[0].status).toBe("fail");
});

test.describe("rendered", () => {
  test.setTimeout(90_000);
  let dir = "";
  test.beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "articles-check-"));
  });
  test.afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function stage(html: string) {
    mkdirSync(path.join(dir, "post", "figures"), { recursive: true });
    writeFileSync(path.join(dir, "post", "index.html"), html);
    writeFileSync(path.join(dir, "post", "post.md"), md);
    for (let i = 1; i <= 5; i++) writeFileSync(path.join(dir, "post", "figures", `0${i}-f.svg`), svg("Step"));
    writeFileSync(path.join(dir, "sources.json"), JSON.stringify(SOURCES));
    writeFileSync(path.join(dir, "claims.json"), "[]");
  }

  test("type sizes are computed in a real browser at 390 and 1440, screenshots kept", async () => {
    stage(page({ bodyPx: 20 }));
    const ok = await runCheck(dir);
    const items = Object.fromEntries(ok.items.map((i) => [i.id, i]));
    expect(items["body-font-1440"]).toMatchObject({ status: "pass", value: "20px" });
    expect(items["body-font-390"].status).toBe("pass");
    expect(items["chrome-font"].status).toBe("pass");
    expect(items["offline-rendered"].status).toBe("pass");
    expect(ok.screenshots.sort()).toEqual(["check/screenshot-1440-dark.png", "check/screenshot-1440.png", "check/screenshot-390.png"]);

    stage(page({ bodyPx: 15, external: true }));
    const small = await runCheck(dir);
    const s = Object.fromEntries(small.items.map((i) => [i.id, i]));
    expect(s["body-font-1440"]).toMatchObject({ status: "fail", value: "15px", expected: `≥ ${THRESHOLDS.minBodyPx1440}px` });
    expect(s["body-font-390"].status).toBe("fail");
    // the stylesheet request was attempted, aborted and counted
    expect(s["offline-rendered"].status).toBe("fail");
    expect(small.dimensions["medium-fidelity"]).toBe("fail");
  });

  test("render switched off: the rendered items are not-measured, never passed", async () => {
    stage(page());
    const r = await runCheck(dir, { render: false });
    expect(r.items.find((i) => i.id === "rendered")?.status).toBe("not-measured");
    expect(r.items.some((i) => i.id === "body-font-1440")).toBe(false);
    expect(r.screenshots).toEqual([]);
  });
});

test("length ceiling: a post over the word ceiling fails it and says how far", () => {
  const filler = Array.from({ length: THRESHOLDS.maxWords + 50 }, (_, i) => `w${i}`).join(" ");
  const long = `# T\n\n${filler}\n\n## Sources\n\n1. x\n`;
  const short = `# T\n\n${PARA}\n\n## Sources\n\n1. x\n`;
  const item = (md: string) => byId(staticItems({ html: page(), md, sources: SOURCES, claims: [], figures: figures(), postFiles: files() }), "length-ceiling");
  expect(item(short).status).toBe("pass");
  expect(item(long).status).toBe("fail");
  expect(String(item(long).value)).toMatch(/^70\d\d words/);
  expect(item(long).expected).toContain(String(THRESHOLDS.maxWords));
});
