#!/usr/bin/env node
// THE DRY STAND-IN FOR AN ARTICLE TURN - product code, not a test fixture.
//
// A dry article job declares every turn as a paid call; the kernel's dry port answers it, and
// lib/articles/dryAgent.ts spawns THIS script with the argv the real seam would build, so a dry
// run still exercises the argv fence, the isolated workspace and the envelope parse. It used to
// spawn tests/fixtures/articles/stub-agent.mjs: a product mode resting on a test fixture, one
// that carries a dozen STUB_* knobs (failure modes, seeded defects, an argv log) a dry run must
// never be steered by. This is that stub's ordinary path and nothing else: every writer phase
// writes canned, check-passing files into ./out/, every reviewer answers one review JSON in its
// engine's envelope. It spends nothing, contacts nothing and reports no cost. The probes keep
// the fixture (ARTICLES_DRY_AGENT_BIN) for its knobs.
//
// `--as=<engine>` as the first argument answers in that engine's envelope (claude by default).

import fs from "node:fs";
import path from "node:path";

const argvAll = process.argv.slice(2);
const asArg = argvAll.find((a) => a.startsWith("--as="));
const engine = asArg ? asArg.slice(5) : "claude";
const args = argvAll.filter((a) => a !== asArg);

// claude and codex read the prompt on stdin; agy gets it as -p and stdin closed empty.
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let prompt = Buffer.concat(chunks).toString("utf8");
if (!prompt.trim()) {
  const i = args.indexOf("-p");
  prompt = i >= 0 ? (args[i + 1] ?? "") : "";
  if (/REVIEW\.md/.test(prompt) && fs.existsSync("REVIEW.md")) prompt = fs.readFileSync("REVIEW.md", "utf8");
}

const claudeEnvelope = (result, extra = {}) => JSON.stringify({ type: "result", subtype: "success", is_error: false, result, num_turns: 3, ...extra });

const out = path.resolve("out");
const write = (rel, text) => {
  const at = path.join(out, ...rel.split("/"));
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
};

/* ── reviewers ────────────────────────────────────────────────────────────── */

if (/^ARTICLE-REVIEW\b/m.test(prompt)) {
  const reviewer = /REVIEWER:\s*([a-z0-9-]+)/.exec(prompt)?.[1] ?? "unknown";
  const round = Number(/ROUND:\s*(\d+)/.exec(prompt)?.[1] ?? "1");
  const findings =
    round === 1
      ? [
          {
            id: "f1",
            kind: "factual",
            severity: "blocker",
            location: "Section 2, first paragraph",
            claim: `The per-token price cited to [2] is stale (${reviewer}).`,
            evidence: ["https://example.org/pricing", "not a url"],
            suggestion: "Use the current price from the pricing page and date it.",
          },
          { id: "f2", kind: "format", severity: "minor", location: "Figure 3", claim: "The caption repeats the paragraph above it.", evidence: [], suggestion: "Shorten the caption to what the figure shows." },
        ]
      : [{ id: "f1", kind: "engagement", severity: "minor", location: "Closing section", claim: "The closing restates the numbers but not the opening question.", evidence: [], suggestion: "Return to the opening question in one sentence." }];
  const review = { reviewer: "ignored-by-the-engine", verdict: round === 1 ? "revise" : "publish", summary: `Dry stand-in review by ${reviewer}, round ${round}.`, findings };
  // claude and codex answer with a fenced block, agy bare: the engine must read both.
  const text = engine === "claude" || engine === "codex" ? `Here is the review.\n\n\`\`\`json\n${JSON.stringify(review, null, 2)}\n\`\`\`` : JSON.stringify(review);
  if (engine === "codex") {
    for (const l of [{ type: "thread.started", thread_id: "dry" }, { type: "turn.started" }, { type: "item.completed", item: { id: "item_0", type: "agent_message", text } }, { type: "turn.completed", usage: {} }]) console.log(JSON.stringify(l));
  } else if (engine === "agy") console.log(JSON.stringify({ conversation_id: "dry", status: "SUCCESS", response: text, num_turns: 1, usage: {} }));
  else console.log(claudeEnvelope(text));
  process.exit(0);
}

/* ── writer turns ─────────────────────────────────────────────────────────── */

const phase = /ARTICLE-PHASE:\s*([\w-]+)/.exec(prompt)?.[1] ?? "unknown";

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
const claimsOf = (sources) => sources.map((s) => ({ text: `A sourced fact from ${s.title}.`, source: s.n }));

if (phase === "research") {
  write("sources.json", JSON.stringify(SOURCES, null, 2));
  write("claims.json", JSON.stringify(claimsOf(SOURCES), null, 2));
  console.log(claudeEnvelope("8 sources, 3 primary, 1 counter"));
  process.exit(0);
}

if (phase === "outline") {
  write("outline.md", "# A dry post about tokens\n\nThesis: the unit of text decides the bill.\n\n## Content preview\n\nFour sections.\n\n## Sections\n\n### The unit\n\n### The bill\n\n### The limits\n\n### The choice\n\n## Figures\n\n01-unit.svg\n\n## Closing\n\nReturn to the opening number.\n");
  console.log(claudeEnvelope("A dry post about tokens, 4 sections"));
  process.exit(0);
}

/** The whole post under out/post/. `sources` is what the research holds now; `note` is a sentence a revision adds, citing [2]. */
function writePost(sources, note) {
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
  const paragraphs = (k) => Array.from({ length: 2 }, (_, i) => sentences.slice((i + k) % 4, ((i + k) % 4) + 4).join(" "));
  const body = SECTIONS.map((t, k) => ({ title: t, paras: paragraphs(k) }));
  if (note) body[1].paras[0] = `${body[1].paras[0]} ${note}`;
  const extra = sources.filter((s) => s.n > 8);
  if (extra.length) body[2].paras[0] = `${body[2].paras[0]} ${extra.map((s) => `A newer measurement narrows the claim [${s.n}].`).join(" ")}`;
  const figures = [1, 2, 3, 4, 5].map((i) => ({ file: `0${i}-figure-${i}.svg`, caption: `Figure ${i}: a labelled diagram of step ${i} [${i}]` }));
  const mdBody = body.map((s) => `## ${s.title}\n\n${s.paras.join("\n\n")}`).join("\n\n");
  const words = (mdBody.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

  for (const [i, f] of figures.entries()) {
    write(
      `post/figures/${f.file}`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400"><rect width="800" height="400" fill="#ffffff"/><rect x="40" y="40" width="200" height="80" fill="#dde"/><text x="60" y="90" font-size="24">Step ${i + 1}</text><text x="300" y="90" font-size="24">tokens in [${i + 1}]</text></svg>\n`,
    );
  }
  const cite = (s) => s.replace(/\[(\d+)\]/g, '<a href="#src-$1">[$1]</a>');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>A dry post about tokens</title>
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
<h1>A dry post about tokens</h1>
<p class="byline">Staff writer · 2026-10-05</p>
<nav data-role="content-preview"><p>What follows, in four parts:</p><ol>${SECTIONS.map((s) => `<li>${s}</li>`).join("")}</ol><p>After reading, a budget can be set per language.</p></nav>
${body.map((s, k) => `<h2>${s.title}</h2>\n${s.paras.map((p) => `<p>${cite(p)}</p>`).join("\n")}\n<figure><img src="figures/${figures[k].file}" alt="${figures[k].caption}"><figcaption>${cite(figures[k].caption)}</figcaption></figure>`).join("\n")}
<figure><img src="figures/${figures[4].file}" alt="${figures[4].caption}"><figcaption>${cite(figures[4].caption)}</figcaption></figure>
<pre><code class="language-js"><span class="tok-kw">const</span> pieces = tokenize(text);</code></pre>
<h2>Sources</h2>
<ol id="sources">${sources.map((s) => `<li id="src-${s.n}">${s.title}. ${s.publisher}, ${s.date}. <a href="${s.url}">${s.url}</a></li>`).join("")}</ol>
</main></body></html>
`;
  write("post/index.html", html);
  const md = `# A dry post about tokens\n\n*The unit of text decides the bill.*\n\n> Four parts: ${SECTIONS.join(", ")}.\n\n${body
    .map((s, k) => `## ${s.title}\n\n${s.paras.join("\n\n")}\n\n![${figures[k].caption}](figures/${figures[k].file.replace(/\.svg$/, ".png")})\n${figures[k].caption}`)
    .join("\n\n")}\n\n![${figures[4].caption}](figures/${figures[4].file.replace(/\.svg$/, ".png")})\n${figures[4].caption}\n\n\`\`\`js\nconst pieces = tokenize(text);\n\`\`\`\n\n| Part | Message |\n|---|---|\n| one | tokens decide the bill |\n\n## Sources\n\n${sources.map((s) => `${s.n}. [${s.title}](${s.url}), ${s.publisher}, ${s.date}`).join("\n")}\n`;
  write("post/post.md", md);
  write("post/meta.json", JSON.stringify({ title: "A dry post about tokens", subtitle: "The unit of text decides the bill", tags: ["tokens", "llm", "localization", "cost", "engineering", "extra"] }, null, 2));
  return words;
}

if (phase === "draft") {
  const words = writePost(SOURCES, undefined);
  // One change to an existing registry file and one new file, so the landing has patches to carry.
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
    const created = `${dir}/applications/dry--read-time.md`;
    write(`proposals/p2/${created}`, "---\nlayer: application\n---\n\n# Read time in a dry run\n\nThe read time is computed from the word count.\n");
    patches.push({ id: "p2", target: created, kind: "application", rationale: "A worked case of the read-time rule.", sources: [5, 6] });
  }
  write("patches.json", JSON.stringify(patches, null, 2));
  console.log(claudeEnvelope(`A dry post about tokens, ${words} words, 5 figures`));
  process.exit(0);
}

const round = Number(/round (\d+)/i.exec(prompt)?.[1] ?? "1");

if (phase === "critique") {
  const dir = path.resolve("inputs", "reviews");
  const reviews = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) : [];
  const dispositions = [];
  for (const r of reviews) {
    for (const f of r.findings) {
      if (f.severity === "blocker") dispositions.push({ reviewer: r.reviewer, findingId: f.id, disposition: "accepted", reason: "The pricing page shows a newer price.", action: "Replace the price and date it." });
      else if (f.kind === "format") dispositions.push({ reviewer: r.reviewer, findingId: f.id, disposition: "rejected", reason: "The caption names its source; the repetition is deliberate." });
      else dispositions.push({ reviewer: r.reviewer, findingId: f.id, disposition: "deferred", reason: "Out of scope for this post." });
    }
  }
  write("dispositions.json", JSON.stringify(dispositions, null, 2));
  write("decision.json", JSON.stringify({ decision: "keep", rationale: `Dry stand-in writer, round ${round}: keep.` }, null, 2));
  console.log(claudeEnvelope(`keep; ${dispositions.length} dispositions`));
  process.exit(0);
}

const currentSources = () => {
  const at = path.resolve("inputs", "sources.json");
  return fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, "utf8")) : SOURCES;
};

if (phase === "revise-research") {
  const before = currentSources();
  const sources = [...before, { n: before.length + 1, url: `https://example.org/new/${before.length + 1}`, title: "A newer measurement", publisher: "Example Lab", date: "2026-09-30", primary: true, counter: false, took: "the current price" }];
  write("sources.json", JSON.stringify(sources, null, 2));
  write("claims.json", JSON.stringify(claimsOf(sources), null, 2));
  console.log(claudeEnvelope("1 source added"));
  process.exit(0);
}

if (phase === "revise") {
  const words = writePost(currentSources(), `The price was revised after review round ${round} [2].`);
  console.log(claudeEnvelope(`A dry post about tokens, ${words} words, 5 figures`));
  process.exit(0);
}

if (phase === "fix") {
  const failures = JSON.parse(fs.readFileSync(path.resolve("inputs", "check-failures.json"), "utf8"));
  const words = writePost(currentSources(), undefined);
  console.log(claudeEnvelope(`A dry post about tokens, ${failures.length} failures met, ${words} words`));
  process.exit(0);
}

console.log(claudeEnvelope(`unknown phase ${phase}`, { subtype: "error_during_execution", is_error: true }));
process.exit(1);
