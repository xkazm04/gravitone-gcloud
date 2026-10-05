#!/usr/bin/env node
// A THROWAWAY AI-REGISTRY — for the article probes and the CLI dry run.
//
//   node tests/fixtures/articles/registry-fixture.mjs <dir>
//
// Builds `<dir>/origin.git` (a bare remote) and `<dir>/registry` (a clone with
// `origin` pointing at it), holding the minimum the article pipeline reads and
// writes at the addresses the real registry uses:
//
//   recipes/index.json -> technical-blog-post-authoring (recipe.json)
//   knowledge/technical-writing/index.json -> two subjects + one law
//   knowledge/software-engineering/index.json -> one subject (a topic)
//   scripts/gate.mjs -> a stub gate: `--lane L --write` regenerates
//     publications/index.json; `--lane L` checks every publication.json, and
//     fails when a publication's title contains FAIL-GATE. It also knows the
//     optional `critique` block and critique/ directory, in outline.
//
// The real registry is never touched: nothing here reads AI_REGISTRY_DIR.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const write = (root, rel, text) => {
  const at = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).toString();

const GATE = `#!/usr/bin/env node
// Stub registry gate (tests/fixtures/articles/registry-fixture.mjs).
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const lane = args[args.indexOf("--lane") + 1];
const write = args.includes("--write");
const pubs = fs.existsSync("publications") ? fs.readdirSync("publications").filter((d) => fs.existsSync(path.join("publications", d, "publication.json"))) : [];
if (lane === "publications" && write) {
  fs.writeFileSync("publications/index.json", JSON.stringify({ publications: pubs.sort() }, null, 2) + "\\n");
  console.log("regenerated publications/index.json (" + pubs.length + ")");
  process.exit(0);
}
let bad = 0;
for (const d of pubs) {
  const p = JSON.parse(fs.readFileSync(path.join("publications", d, "publication.json"), "utf8"));
  const need = ["schema", "slug", "title", "topic", "date", "status", "standard", "sources", "claims", "figures", "check", "run"];
  for (const k of need) if (!(k in p)) { console.error(d + ": missing " + k); bad++; }
  if (p.schema !== "publication/1") { console.error(d + ": schema " + p.schema); bad++; }
  if (p.slug !== d) { console.error(d + ": slug " + p.slug); bad++; }
  if (String(p.title).includes("FAIL-GATE")) { console.error(d + ": title asks the gate to fail"); bad++; }
  for (const f of ["post.html", "post.md", "SOURCES.md", "medium/story.html", "medium/tags.txt", "medium/README.md"]) if (!fs.existsSync(path.join("publications", d, f))) { console.error(d + ": no " + f); bad++; }
  // The critique record, in the stub's measure: the block's shape and counts,
  // and critique/ only beside the block, holding both files whose counts agree.
  // (The real gate is ai-registry scripts/check-publications.mjs.)
  const c = p.critique;
  if (c !== undefined) {
    for (const k of ["rounds", "reviewers", "findings", "decision"]) if (!(k in c)) { console.error(d + ": critique missing " + k); bad++; }
    const f = c.findings || {};
    if (f.total !== f.accepted + f.rejected + f.deferred) { console.error(d + ": critique counts do not add up"); bad++; }
  }
  const cdir = path.join("publications", d, "critique");
  if (fs.existsSync(cdir)) {
    if (c === undefined) { console.error(d + ": critique/ without a critique block"); bad++; }
    const names = fs.readdirSync(cdir).sort().join(",");
    if (names !== "dispositions.json,reviews.json") { console.error(d + ": critique/ holds " + names); bad++; }
    else if (c !== undefined) {
      const ds = JSON.parse(fs.readFileSync(path.join(cdir, "dispositions.json"), "utf8"));
      const rv = JSON.parse(fs.readFileSync(path.join(cdir, "reviews.json"), "utf8"));
      if (ds.length !== c.findings.total) { console.error(d + ": critique total " + c.findings.total + " but " + ds.length + " dispositions"); bad++; }
      if (rv.some((r) => typeof r.round !== "number") || ds.some((x) => typeof x.round !== "number")) { console.error(d + ": a critique entry has no round"); bad++; }
    }
  }
}
console.log("lane " + lane + (write ? " --write" : "") + ": " + pubs.length + " publication(s), " + bad + " problem(s)");
process.exit(bad ? 1 : 0);
`;

export function makeRegistryFixture(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const origin = path.join(dir, "origin.git");
  const seed = path.join(dir, "seed");
  const registry = path.join(dir, "registry");
  git(dir, "init", "--bare", "--initial-branch=main", origin);
  git(dir, "init", "--initial-branch=main", seed);
  git(seed, "config", "user.name", "Fixture");
  git(seed, "config", "user.email", "fixture@example.invalid");
  git(seed, "config", "core.autocrlf", "false");

  write(seed, ".gitattributes", "* text eol=lf\n");
  write(seed, "recipes/index.json", JSON.stringify({ meta: { lane: "recipes" }, recipes: { "technical-blog-post-authoring": { path: "recipes/creative_design/writing/technical-blog-post-authoring", version: "0.1.0", status: "seed", domain: "creative_design", title: "Technical blog post authoring" } } }, null, 2) + "\n");
  write(seed, "recipes/creative_design/writing/technical-blog-post-authoring/recipe.json", JSON.stringify({ slug: "technical-blog-post-authoring", version: "0.1.0", title: "Technical blog post authoring", description: { need: "A post held to a standard." } }, null, 2) + "\n");
  write(seed, "recipes/creative_design/writing/technical-blog-post-authoring/LESSONS.md", "# Lessons\n");
  write(seed, "knowledge/technical-writing/index.json", JSON.stringify({
    meta: { bundle: "technical-writing" },
    subjects: {
      "article-structure": { category: "craft", subcategory: null, status: "seed", file: "knowledge/technical-writing/craft/article-structure/article-structure.md", techniques: [] },
      "voice-and-register": { category: "craft", subcategory: null, status: "seed", file: "knowledge/technical-writing/craft/voice-and-register/voice-and-register.md", techniques: [] },
    },
    laws: { "every-number-has-a-source": { statement: "Every number in a post traces to a numbered source.", techniques: [] } },
  }, null, 2) + "\n");
  write(seed, "knowledge/technical-writing/craft/article-structure/article-structure.md", "---\nlayer: golden-path\nsubject: article-structure\n---\n\n# Article structure\n\nA hook, a content preview, a through-line and a closing chapter that wraps.\n");
  write(seed, "knowledge/technical-writing/craft/voice-and-register/voice-and-register.md", "---\nlayer: golden-path\nsubject: voice-and-register\n---\n\n# Voice and register\n\nThird person, impersonal, varied rhythm.\n");
  write(seed, "knowledge/software-engineering/index.json", JSON.stringify({ meta: { bundle: "software-engineering" }, subjects: { "token-budgeting": { category: "llm-agent", subcategory: null, status: "seed", file: "knowledge/software-engineering/llm-agent/token-budgeting/token-budgeting.md", techniques: [] } }, laws: {} }, null, 2) + "\n");
  write(seed, "knowledge/software-engineering/llm-agent/token-budgeting/token-budgeting.md", "---\nlayer: golden-path\nsubject: token-budgeting\n---\n\n# Token budgeting\n\nBudgets are counted in tokens, not characters.\n");
  write(seed, "scripts/gate.mjs", GATE);
  write(seed, "publications/.keep", "");

  git(seed, "add", "-A");
  git(seed, "commit", "-m", "fixture registry");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "origin", "main");
  git(dir, "clone", origin, registry);
  git(registry, "config", "user.name", "Fixture");
  git(registry, "config", "user.email", "fixture@example.invalid");
  git(registry, "config", "core.autocrlf", "false");
  git(registry, "remote", "set-head", "origin", "main");
  fs.rmSync(seed, { recursive: true, force: true });
  return { origin, registry };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tests/fixtures/articles/registry-fixture.mjs <dir>");
    process.exit(2);
  }
  const r = makeRegistryFixture(path.resolve(dir));
  console.log(JSON.stringify(r));
}
