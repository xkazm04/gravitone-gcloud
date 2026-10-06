#!/usr/bin/env node
// A STAND-IN FOR THE `claude`, `codex`, `grok` AND `agy` CLIs — for the article
// probes and the CLI dry run.
//
// lib/agent/cliSeam.ts spawns whatever ARTICLES_AGENT_BIN (claude: the writer
// and claude reviewers) or ARTICLES_<ENGINE>_BIN (codex, grok, agy reviewers)
// names, with the real argv and the real prompt. Point the override at this
// script with `--as=<engine>` as its first argument
// (`node|tests/fixtures/articles/stub-agent.mjs|--as=codex`) and it answers in
// that engine's envelope.
//
// WRITER TURNS (claude): reads the prompt's `ARTICLE-PHASE:` line and writes
// canned, check-passing files into ./out/ — exactly the files
// pipeline/ARTICLE-POST-PROMPT.md asks for — then prints a claude envelope.
// Phases: research, outline, draft, critique (dispositions + decision),
// revise-research, revise.
//
// REVIEWER TURNS (any engine): the prompt (stdin for claude/codex, REVIEW.md in
// the cwd for agy/grok) starts `ARTICLE-REVIEW`; it answers with one review
// JSON in the final message, in the engine's envelope.
//
// It spends nothing and contacts nothing. It reports NO cost unless
// STUB_AGENT_COST is set (claude and grok only — codex and agy report none),
// so a dry run never shows a figure nobody paid.
//
// STUB_AGENT_MODE: ok (default) | error | seat | hang | garbage   (writer turns)
// STUB_AGENT_BAD_PATCH=1 adds a proposal that targets a path outside knowledge/.
// STUB_REVIEWERS="grok=unavailable,gemini=garbage-once" — per reviewer id:
//   ok | unavailable | seat | error | hang | garbage | garbage-once | write
// STUB_CRITIQUE_DECISIONS="rewrite,keep" — the writer's decision per round
//   (default keep).
// STUB_DISPOSITIONS=bad — the writer's dispositions miss a finding and leave a
//   reason empty, on every attempt.
// STUB_RESEARCH=renumber — a critique research drops source [1].
// STUB_AGENT_ARGV_LOG=<file> appends the engine, argv, cwd, the workspace's
//   entries and whether a metered key or any credential-named variable
//   reached this process.

import fs from "node:fs";
import path from "node:path";

const argvAll = process.argv.slice(2);
const asArg = argvAll.find((a) => a.startsWith("--as="));
const engine = asArg ? asArg.slice(5) : "claude";
const args = argvAll.filter((a) => a !== asArg);

const mode = process.env.STUB_AGENT_MODE || "ok";
const cost = process.env.STUB_AGENT_COST ? Number(process.env.STUB_AGENT_COST) : undefined;
if (process.env.STUB_AGENT_ARGV_LOG) {
  const seen = {
    engine,
    argv: args,
    cwd: process.cwd(),
    entries: fs.readdirSync(process.cwd()).sort(),
    meteredKeyVisible: "ANTHROPIC_API_KEY" in process.env,
    credentialVars: Object.keys(process.env).filter((k) => /(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_?KEY|AUTH)/i.test(k)),
  };
  fs.appendFileSync(process.env.STUB_AGENT_ARGV_LOG, `${JSON.stringify(seen)}\n`);
}

// claude and codex read the prompt on stdin; agy and grok get it as -p and
// stdin closed empty.
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let prompt = Buffer.concat(chunks).toString("utf8");
if (!prompt.trim()) {
  const i = args.indexOf("-p");
  prompt = i >= 0 ? (args[i + 1] ?? "") : "";
  if (/REVIEW\.md/.test(prompt) && fs.existsSync("REVIEW.md")) prompt = fs.readFileSync("REVIEW.md", "utf8");
}

const claudeEnvelope = (result, extra = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result, num_turns: 3, ...(cost !== undefined ? { total_cost_usd: cost } : {}), ...extra });

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
  const modes = Object.fromEntries(
    (process.env.STUB_REVIEWERS ?? "")
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p) => p.length === 2),
  );
  const rmode = modes[reviewer] ?? "ok";
  const retry = /YOUR PREVIOUS ANSWER WAS REJECTED/.test(prompt);

  const ok = (text) => {
    if (engine === "codex") {
      for (const l of [{ type: "thread.started", thread_id: "stub" }, { type: "turn.started" }, { type: "item.completed", item: { id: "item_0", type: "agent_message", text } }, { type: "turn.completed", usage: {} }]) console.log(JSON.stringify(l));
    } else if (engine === "agy") console.log(JSON.stringify({ conversation_id: "stub", status: "SUCCESS", response: text, num_turns: 1, usage: {} }));
    else if (engine === "grok") console.log(JSON.stringify({ text, stopReason: "end_turn", num_turns: 2, ...(cost !== undefined ? { total_cost_usd: cost } : {}) }));
    else console.log(claudeEnvelope(text));
    process.exit(0);
  };
  const fail = (kind) => {
    const msg = {
      unavailable: {
        claude: "API Error: 402 Payment Required",
        codex: "The 'gpt-6.1-astra' model is not supported when using Codex with a ChatGPT account.",
        agy: "model gemini-9 is not available",
        grok: 'Internal error: {\n  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",\n  "http_status": 402\n}',
      },
      seat: { claude: "Claude AI usage limit reached", codex: "You've hit your usage limit.", agy: "RESOURCE_EXHAUSTED: quota exceeded", grok: "API error (status 429 Too Many Requests): rate limit" },
      error: { claude: "the stub was told to fail", codex: "stream disconnected", agy: "internal error", grok: "internal error" },
    }[kind][engine];
    if (engine === "codex") {
      console.log(JSON.stringify({ type: "error", message: msg }));
      console.log(JSON.stringify({ type: "turn.failed", error: { message: msg } }));
    } else if (engine === "agy") console.log(JSON.stringify({ status: "ERROR", error: msg, num_turns: 0 }));
    else if (engine === "grok") console.log(JSON.stringify({ type: "error", message: msg, ...(kind === "unavailable" ? { http_status: 402 } : {}) }));
    else console.log(claudeEnvelope(msg, { subtype: "error_during_execution", is_error: true }));
    process.exit(1);
  };

  if (rmode === "hang") await new Promise((r) => setTimeout(r, 10 * 60_000));
  if (rmode === "unavailable" || rmode === "seat" || rmode === "error") fail(rmode);
  if (rmode === "garbage" || (rmode === "garbage-once" && !retry)) ok("I reviewed the post and it looks fine overall, nice work!");
  if (rmode === "write") fs.writeFileSync("notes.txt", "a reviewer wrote this\n");

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
  const review = { reviewer: "ignored-by-the-engine", verdict: round === 1 ? "revise" : "publish", summary: `Stub review by ${reviewer}, round ${round}.`, findings };
  // claude and codex answer with a fenced block, agy and grok bare: the engine
  // must read both.
  ok(engine === "claude" || engine === "codex" ? `Here is the review.\n\n\`\`\`json\n${JSON.stringify(review, null, 2)}\n\`\`\`` : JSON.stringify(review));
}

/* ── writer turns ─────────────────────────────────────────────────────────── */

const phase = /ARTICLE-PHASE:\s*([\w-]+)/.exec(prompt)?.[1] ?? "unknown";

if (mode === "hang") {
  await new Promise((r) => setTimeout(r, 10 * 60_000));
}
if (mode === "error") {
  console.log(claudeEnvelope("the stub was told to fail", { subtype: "error_during_execution", is_error: true }));
  process.exit(1);
}
if (mode === "seat") {
  console.log(claudeEnvelope("Claude AI usage limit reached", { subtype: "error_during_execution", is_error: true }));
  process.exit(1);
}

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
  console.log(claudeEnvelope("8 sources, 3 primary, 1 counter"));
  process.exit(0);
}

if (phase === "outline") {
  write("outline.md", "# A stub post about tokens\n\nThesis: the unit of text decides the bill.\n\n## Content preview\n\nFour sections.\n\n## Sections\n\n### The unit\n\n### The bill\n\n### The limits\n\n### The choice\n\n## Figures\n\n01-unit.svg\n\n## Closing\n\nReturn to the opening number.\n");
  console.log(claudeEnvelope("A stub post about tokens, 4 sections"));
  process.exit(0);
}

/** The whole post under out/post/. `sources` is what the research holds now;
 *  `note` is a sentence a revision adds, citing [2]. */
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
  const md = `# A stub post about tokens\n\n*The unit of text decides the bill.*\n\n> Four parts: ${SECTIONS.join(", ")}.\n\n${body
    .map((s, k) => `## ${s.title}\n\n${s.paras.join("\n\n")}\n\n![${figures[k].caption}](figures/${figures[k].file.replace(/\.svg$/, ".png")})\n${figures[k].caption}`)
    .join("\n\n")}\n\n![${figures[4].caption}](figures/${figures[4].file.replace(/\.svg$/, ".png")})\n${figures[4].caption}\n\n\`\`\`js\nconst pieces = tokenize(text);\n\`\`\`\n\n| Part | Message |\n|---|---|\n| one | tokens decide the bill |\n\n## Sources\n\n${sources.map((s) => `${s.n}. [${s.title}](${s.url}), ${s.publisher}, ${s.date}`).join("\n")}\n`;
  write("post/post.md", md);
  write("post/meta.json", JSON.stringify({ title: "A stub post about tokens", subtitle: "The unit of text decides the bill", tags: ["tokens", "llm", "localization", "cost", "engineering", "extra"] }, null, 2));
  return words;
}

if (phase === "draft") {
  const words = writePost(SOURCES);

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
  console.log(claudeEnvelope(`A stub post about tokens, ${words} words, 5 figures`));
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
  if (process.env.STUB_DISPOSITIONS === "bad" && dispositions.length) {
    dispositions.pop();
    dispositions[0].reason = "";
  }
  const decisions = (process.env.STUB_CRITIQUE_DECISIONS ?? "keep").split(",").map((s) => s.trim());
  const decision = decisions[round - 1] ?? decisions[decisions.length - 1] ?? "keep";
  write("dispositions.json", JSON.stringify(dispositions, null, 2));
  write("decision.json", JSON.stringify({ decision, rationale: `Stub writer, round ${round}: ${decision}.` }, null, 2));
  console.log(claudeEnvelope(`${decision}; ${dispositions.length} dispositions`));
  process.exit(0);
}

const currentSources = () => {
  const at = path.resolve("inputs", "sources.json");
  return fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, "utf8")) : SOURCES;
};

if (phase === "revise-research") {
  const before = currentSources();
  const next = [...before, { n: before.length + 1, url: `https://example.org/new/${before.length + 1}`, title: "A newer measurement", publisher: "Example Lab", date: "2026-09-30", primary: true, counter: false, took: "the current price" }];
  const sources = process.env.STUB_RESEARCH === "renumber" ? next.slice(1).map((s, i) => ({ ...s, n: i + 1 })) : next;
  write("sources.json", JSON.stringify(sources, null, 2));
  write("claims.json", JSON.stringify(sources.map((s) => ({ text: `A sourced fact from ${s.title}.`, source: s.n })), null, 2));
  console.log(claudeEnvelope(`1 source added`));
  process.exit(0);
}

if (phase === "revise") {
  const words = writePost(currentSources(), `The price was revised after review round ${round} [2].`);
  console.log(claudeEnvelope(`A stub post about tokens, ${words} words, 5 figures`));
  process.exit(0);
}

console.log(claudeEnvelope(`unknown phase ${phase}`, { subtype: "error_during_execution", is_error: true }));
process.exit(1);
