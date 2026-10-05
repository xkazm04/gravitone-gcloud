#!/usr/bin/env node
// A STAND-IN FOR THE `claude` CLI — for the article probes and the CLI dry run.
//
// lib/agent/cliSeam.ts spawns whatever ARTICLES_AGENT_BIN names with the real
// argv and the real prompt on stdin. This script reads the prompt's
// `ARTICLE-PHASE:` line and writes canned, check-passing files into ./out/ —
// exactly the files pipeline/ARTICLE-POST-PROMPT.md asks the real agent for —
// then prints a JSON envelope shaped like `claude -p --output-format json`.
//
// It spends nothing and contacts nothing. It reports NO cost unless
// STUB_AGENT_COST is set, so a dry run never shows a figure nobody paid.
//
// STUB_AGENT_MODE: ok (default) | error | seat | hang | garbage
// STUB_AGENT_BAD_PATCH=1 adds a proposal that targets a path outside knowledge/.
// STUB_AGENT_ARGV_LOG=<file> appends the argv, cwd and whether a metered key
// reached this process.

import fs from "node:fs";
import path from "node:path";

const mode = process.env.STUB_AGENT_MODE || "ok";
const cost = process.env.STUB_AGENT_COST ? Number(process.env.STUB_AGENT_COST) : undefined;
if (process.env.STUB_AGENT_ARGV_LOG) {
  const seen = { argv: process.argv.slice(2), cwd: process.cwd(), entries: fs.readdirSync(process.cwd()).sort(), meteredKeyVisible: "ANTHROPIC_API_KEY" in process.env };
  fs.appendFileSync(process.env.STUB_AGENT_ARGV_LOG, `${JSON.stringify(seen)}\n`);
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const prompt = Buffer.concat(chunks).toString("utf8");
const phase = /ARTICLE-PHASE:\s*(\w+)/.exec(prompt)?.[1] ?? "unknown";

const envelope = (result, extra = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result, num_turns: 3, ...(cost !== undefined ? { total_cost_usd: cost } : {}), ...extra });

if (mode === "hang") {
  await new Promise((r) => setTimeout(r, 10 * 60_000));
}
if (mode === "error") {
  console.log(envelope("the stub was told to fail", { subtype: "error_during_execution", is_error: true }));
  process.exit(1);
}
if (mode === "seat") {
  console.log(envelope("Claude AI usage limit reached", { subtype: "error_during_execution", is_error: true }));
  process.exit(1);
}

const out = path.resolve("out");
const write = (rel, text) => {
  const at = path.join(out, ...rel.split("/"));
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
};

const SOURCES = [
  { n: 1, url: "https://example.org/spec/tokenizer", title: "Tokenizer specification", publisher: "Example Standards Body", date: "2026-03-01", primary: true, counter: false, took: "the merge rule definition" },
  { n: 2, url: "https://example.org/pricing", title: "Model pricing", publisher: "Example Vendor", date: "2026-06-15", primary: true, counter: false, took: "per-token prices" },
  { n: 3, url: "https://example.org/dataset", title: "Parallel corpus release", publisher: "Example Lab", date: "2026-01-20", primary: true, counter: false, took: "the sentence pairs" },
  { n: 4, url: "https://example.org/blog/caching", title: "Prefix caching in practice", publisher: "Example Engineering Blog", date: "2026-05-02", primary: false, counter: false, took: "cache hit behaviour" },
  { n: 5, url: "https://example.org/paper/fertility", title: "Fertility across scripts", publisher: "Example Proceedings", date: "2025-11-30", primary: false, counter: false, took: "fertility ratios" },
  { n: 6, url: "https://example.org/news/gap", title: "The gap is closing", publisher: "Example News", date: "2026-07-07", primary: false, counter: true, took: "the counter-argument" },
  { n: 7, url: "https://example.org/docs/context", title: "Context windows explained", publisher: "Example Docs", date: "2026-02-11", primary: false, counter: false, took: "context limits" },
  { n: 8, url: "https://example.org/essay/fairness", title: "Who pays for the corpus", publisher: "Example Review", date: "2026-04-18", primary: false, counter: false, took: "the fairness framing" },
];

if (phase === "research") {
  if (mode === "garbage") {
    write("sources.json", "[{\"n\": \"one\"}]");
    write("claims.json", "[]");
  } else {
    write("sources.json", JSON.stringify(SOURCES, null, 2));
    write("claims.json", JSON.stringify(SOURCES.map((s) => ({ text: `A sourced fact from ${s.title}.`, source: s.n })), null, 2));
  }
  console.log(envelope("8 sources, 3 primary, 1 counter"));
  process.exit(0);
}

if (phase === "outline") {
  write("outline.md", "# A stub post about tokens\n\nThesis: the unit of text decides the bill.\n\n## Content preview\n\nFour sections.\n\n## Sections\n\n### The unit\n\n### The bill\n\n### The limits\n\n### The choice\n\n## Figures\n\n01-unit.svg\n\n## Closing\n\nReturn to the opening number.\n");
  console.log(envelope("A stub post about tokens, 4 sections"));
  process.exit(0);
}

if (phase === "draft") {
  const SECTIONS = ["The unit of text", "Where the bill comes from", "Where the claim stops", "What changes on Monday"];
  const sentences = [
    "A tokenizer cuts text into pieces that were frequent in its training corpus [1].",
    "The same meaning can take more pieces in one script than in another [5].",
    "Every piece is billed, so the count becomes the price [2].",
    "A cached prefix is billed differently from a fresh one [4].",
    "Newer vocabularies narrow the gap without closing it everywhere [6].",
    "A context window is counted in the same pieces, so a dense script fits less [7].",
    "The corpus decides who pays, which is a question of fairness as well as engineering [8].",
    "A parallel corpus makes the comparison concrete [3].",
  ];
  const paragraphs = (k) => Array.from({ length: 4 }, (_, i) => sentences.slice((i + k) % 4, ((i + k) % 4) + 4).join(" "));
  const body = SECTIONS.map((t, k) => ({ title: t, paras: paragraphs(k) }));
  const figures = [1, 2, 3, 4, 5].map((i) => ({ file: `0${i}-figure-${i}.svg`, caption: `Figure ${i}: a labelled diagram of step ${i} [${i}]` }));
  const mdBody = body.map((s) => `## ${s.title}\n\n${s.paras.join("\n\n")}`).join("\n\n");
  const words = (mdBody.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  const minutes = Math.max(1, Math.round(words / 230));

  for (const [i, f] of figures.entries()) {
    write(
      `post/figures/${f.file}`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#ffffff"/><rect x="40" y="40" width="200" height="80" fill="#dde"/><text x="60" y="90" font-size="24">Step ${i + 1}</text><text x="300" y="90" font-size="24">tokens in [${i + 1}]</text></svg>\n`,
    );
  }
  const cite = (s) => s.replace(/\[(\d+)\]/g, '<a href="#src-$1">[$1]</a>');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A stub post about tokens</title>
<style>
:root { --bg: #ffffff; --ink: #1a1a1a; --kw: #8a2be2; }
@media (prefers-color-scheme: dark) { :root { --bg: #121212; --ink: #eeeeee; --kw: #c9a0ff; } }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Georgia, serif; }
main { max-width: 680px; margin: 0 auto; padding: 0 16px; }
p, li { font-size: 20px; line-height: 1.6; overflow-wrap: anywhere; }
figcaption, .byline { font-size: 14px; font-family: system-ui, sans-serif; }
img { max-width: 100%; }
pre { overflow-x: auto; font-size: 15px; }
.tok-kw { color: var(--kw); }
@media (max-width: 480px) { p, li { font-size: 18px; } }
</style></head>
<body><main>
<h1>A stub post about tokens</h1>
<p class="byline">Staff writer · 2026-10-05 · ${minutes} min read</p>
<nav data-role="content-preview"><p>${minutes} min read. What follows, in four parts:</p><ol>${SECTIONS.map((s) => `<li>${s}</li>`).join("")}</ol><p>After reading, a budget can be set per language.</p></nav>
${body.map((s, k) => `<h2>${s.title}</h2>\n${s.paras.map((p) => `<p>${cite(p)}</p>`).join("\n")}\n<figure><img src="figures/${figures[k].file}" alt="${figures[k].caption}"><figcaption>${cite(figures[k].caption)}</figcaption></figure>`).join("\n")}
<figure><img src="figures/${figures[4].file}" alt="${figures[4].caption}"><figcaption>${cite(figures[4].caption)}</figcaption></figure>
<pre><code class="language-js"><span class="tok-kw">const</span> pieces = tokenize(text);</code></pre>
<h2>Sources</h2>
<ol id="sources">${SOURCES.map((s) => `<li id="src-${s.n}">${s.title}. ${s.publisher}, ${s.date}. <a href="${s.url}">${s.url}</a></li>`).join("")}</ol>
</main></body></html>
`;
  write("post/index.html", html);
  const md = `# A stub post about tokens\n\n*The unit of text decides the bill.*\n\n${minutes} min read. Four parts: ${SECTIONS.join(", ")}.\n\n${body
    .map((s, k) => `## ${s.title}\n\n${s.paras.join("\n\n")}\n\n![${figures[k].caption}](figures/${figures[k].file.replace(/\.svg$/, ".png")})\n${figures[k].caption}`)
    .join("\n\n")}\n\n![${figures[4].caption}](figures/${figures[4].file.replace(/\.svg$/, ".png")})\n${figures[4].caption}\n\n\`\`\`js\nconst pieces = tokenize(text);\n\`\`\`\n\n## Sources\n\n${SOURCES.map((s) => `${s.n}. [${s.title}](${s.url}), ${s.publisher}, ${s.date}`).join("\n")}\n`;
  write("post/post.md", md);
  write("post/meta.json", JSON.stringify({ title: "A stub post about tokens", subtitle: "The unit of text decides the bill", tags: ["tokens", "llm", "localization", "cost", "engineering", "extra"] }, null, 2));

  // One change to an existing registry file and one new file.
  const reg = path.resolve("inputs", "registry");
  const existing = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (r.startsWith("knowledge/") && r.endsWith(".md")) existing.push(r);
    }
  };
  if (fs.existsSync(reg)) walk(reg, "");
  existing.sort();
  const patches = [];
  if (existing.length) {
    const target = existing[0];
    const orig = fs.readFileSync(path.join(reg, ...target.split("/")), "utf8");
    write(`proposals/p1/${target}`, `${orig.trimEnd()}\n\nA content preview states the read time it can honour [5].\n`);
    patches.push({ id: "p1", target, kind: "technique", rationale: "The preview's read time must match the word count.", sources: [5] });
    const dir = target.split("/").slice(0, -1).join("/");
    const created = `${dir}/applications/stub--read-time.md`;
    write(`proposals/p2/${created}`, "---\nlayer: application\n---\n\n# Read time in a stub\n\nThe read time is computed from the word count.\n");
    patches.push({ id: "p2", target: created, kind: "application", rationale: "A worked case of the read-time rule.", sources: [5, 6] });
  }
  if (process.env.STUB_AGENT_BAD_PATCH === "1") {
    write("proposals/p3/scripts/gate.mjs", "process.exit(0)\n");
    patches.push({ id: "p3", target: "scripts/gate.mjs", kind: "law", rationale: "should be refused", sources: [1] });
  }
  write("patches.json", JSON.stringify(patches, null, 2));
  console.log(envelope(`A stub post about tokens, ${words} words, 5 figures`));
  process.exit(0);
}

console.log(envelope(`unknown phase ${phase}`, { subtype: "error_during_execution", is_error: true }));
process.exit(1);
