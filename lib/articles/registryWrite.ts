// REGISTRY WRITE-BACK — an approved post into ai-registry, as a PR. Server only.
//
// DETERMINISTIC CODE, NOT AN AGENT. Nothing here is a model's decision: the
// agent wrote files into an isolated workspace and never saw the registry; this
// module copies what a HUMAN approved into a fresh registry worktree, runs the
// registry's own gates, and only when every gate is green commits, pushes and
// opens a PR. It runs only from `approved` (lib/articles/engine.ts drives it and
// lib/articles/store.ts refuses any other way into `landing`).
//
//   1. fetch the registry's remote (two machines push to it)
//   2. `git worktree add -b article/<slug>` off the remote's default branch
//   3. write publications/<slug>/...  (the publication/1 shape)
//   4. `git apply` each APPROVED patch — after checking it only touches
//      knowledge/ or recipes/
//   5. per touched lane (publications always): `node scripts/gate.mjs --lane L
//      --write` (the generators), then `--lane L` (the check)
//   6. commit under the identity the registry checkout is configured with;
//      push; `gh pr create`
//
// ANY GATE FAILURE leaves the branch local and unpushed (the worktree kept for
// inspection), and throws with the gate's output — the engine turns that into
// status `failed`. No PR is opened from a red tree.
//
// CREDENTIALS come from the operator's existing git and gh logins. None are
// read, stored or passed here.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { cwdBoundGitEnv } from "@/lib/gitEnv";

import { citedNumbers, htmlProse, postWords, THRESHOLDS } from "./checks";
import { readCritiqueDetail, registryCritique, type RegistryCritique } from "./critique";
import { resolveRegistryDir, type RegistryLocation } from "./registryRead";
import { ArticleError, slugify } from "./store";
import { uniqueDir } from "./tempDir";
import type { ArticleLanding, ArticleRun, CheckReport, Claim, PostMeta, RegistryPatch, Source } from "./types";

export class LandingError extends ArticleError {
  constructor(
    message: string,
    code: string,
    /** What was done before it failed — the engine keeps it on the run. */
    readonly landing: ArticleLanding,
    /** Full tool output, for landing.log. */
    readonly output = "",
  ) {
    super(message, 502, code);
    this.name = "LandingError";
  }
}

/* ── processes ─────────────────────────────────────────────────────────────── */

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

// git and gh act on the repository `cwd` names and on no other: an inherited
// GIT_DIR (a hook, a pre-push verify) would otherwise point this landing's
// add / commit / push at whatever repository started us (lib/gitEnv.ts).
function run(argv: string[], cwd: string, timeoutMs = 120_000): Promise<Ran> {
  return new Promise((resolve) => {
    execFile(argv[0], argv.slice(1), { cwd, env: cwdBoundGitEnv(), timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? ((err as unknown as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) || (err && !stdout && !stderr ? err.message : "") });
    });
  });
}

const tail = (s: string, n = 1500) => (s.length > n ? `…${s.slice(-n)}` : s).trim();

/** `ARTICLES_GH_BIN` overrides gh (`|`-separated argv) — how the probes stand
 *  in for GitHub without a network. */
function ghArgv(env: NodeJS.ProcessEnv = process.env): string[] {
  const o = env.ARTICLES_GH_BIN?.trim();
  if (!o) return ["gh"];
  return o.split("|").map((s) => (s === "node" ? process.execPath : existsSync(path.resolve(s)) ? path.resolve(s) : s));
}

/* ── the publication ───────────────────────────────────────────────────────── */

export interface FigureRecord {
  file: string;
  caption: string;
  sources: number[];
}

/** Caption and source numbers per figure, read out of the post's HTML. */
export function figureRecords(html: string): FigureRecord[] {
  const out: FigureRecord[] = [];
  for (const m of html.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)) {
    const src = /<img\b[^>]*\bsrc=["'](?:\.\/)?(figures\/[^"']+)["']/i.exec(m[0]);
    const cap = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(m[0]);
    if (!src) continue;
    const caption = cap ? htmlProse(cap[1]) : "";
    out.push({ file: src[1], caption, sources: [...new Set(citedNumbers(caption))].sort((a, b) => a - b) });
  }
  return out;
}

export function sourcesMarkdown(title: string, sources: Source[]): string {
  const lines = [`# Sources: ${title}`, ""];
  for (const s of [...sources].sort((a, b) => a.n - b.n)) {
    const tagsOf = [s.primary ? "primary" : "", s.counter ? "counter-evidence" : ""].filter(Boolean).join(", ");
    lines.push(`${s.n}. [${s.title}](${s.url}). ${s.publisher}, ${s.date}.${tagsOf ? ` (${tagsOf})` : ""} Used for: ${s.took}`);
  }
  return `${lines.join("\n")}\n`;
}

export interface PublicationInput {
  run: ArticleRun;
  slug: string;
  date: string;
  meta: PostMeta;
  html: string;
  md: string;
  sources: Source[];
  claims: Claim[];
  check?: CheckReport;
  /** The critique record (lib/articles/critique.ts registryCritique). */
  critique?: RegistryCritique;
}

/** publication.json, schema `publication/1` (ai-registry docs/publications-lane.md).
 *  Absent values are omitted, never null. `critique` is the one optional
 *  top-level key the schema names ("The critique record"): written whenever
 *  the run has a decided critique, which every run since the critique step
 *  has. */
export function publicationJson(p: PublicationInput): Record<string, unknown> {
  const words = postWords(p.md);
  const costs = p.run.steps.map((s) => s.costUsd).filter((c): c is number => typeof c === "number");
  const topic: Record<string, unknown> = { kind: p.run.topic.kind };
  if (p.run.topic.bundle) topic.bundle = p.run.topic.bundle;
  if (p.run.topic.subject) topic.subject = p.run.topic.subject;
  topic.text = p.run.topic.text;
  if (p.run.topic.angle) topic.angle = p.run.topic.angle;
  const runBlock: Record<string, unknown> = { id: p.run.id, model: p.run.model, effort: p.run.effort };
  if (costs.length) runBlock.costUsd = Math.round(costs.reduce((a, b) => a + b, 0) * 10_000) / 10_000;
  const standard: Record<string, unknown> = { recipe: p.run.standard.recipe, bundle: p.run.standard.bundle };
  if (p.run.standard.version) standard.version = p.run.standard.version;
  return {
    schema: "publication/1",
    slug: p.slug,
    title: p.meta.title,
    subtitle: p.meta.subtitle,
    topic,
    date: p.date,
    readMinutes: Math.max(1, Math.round(words / THRESHOLDS.wordsPerMinute)),
    status: "approved",
    standard,
    sources: [...p.sources].sort((a, b) => a.n - b.n).map((s) => ({ n: s.n, url: s.url, title: s.title, publisher: s.publisher, date: s.date, primary: !!s.primary, counter: !!s.counter, took: s.took })),
    claims: p.claims.map((c) => ({ text: c.text, source: c.source })),
    figures: figureRecords(p.html),
    check: { ...(p.check?.dimensions ?? {}) },
    run: runBlock,
    ...(p.critique ? { critique: p.critique.block } : {}),
  };
}

/* ── patches ───────────────────────────────────────────────────────────────── */

export const PATCHABLE_ROOTS = ["knowledge/", "recipes/"] as const;

/** Paths a patch touches, read from its own headers. */
export function patchPaths(diff: string): string[] {
  const out = new Set<string>();
  for (const m of diff.matchAll(/^(?:---|\+\+\+) (?:[ab]\/)?(.+?)\s*$/gm)) {
    if (m[1] !== "/dev/null") out.add(m[1]);
  }
  for (const m of diff.matchAll(/^diff --git a\/(\S+) b\/(\S+)/gm)) {
    out.add(m[1]);
    out.add(m[2]);
  }
  return [...out];
}

export function patchIsSafe(diff: string): { ok: boolean; bad: string[] } {
  const bad = patchPaths(diff).filter(
    (p) => !PATCHABLE_ROOTS.some((r) => p.startsWith(r)) || p.split("/").includes("..") || path.isAbsolute(p),
  );
  return { ok: bad.length === 0 && patchPaths(diff).length > 0, bad };
}

/** The lanes a set of registry paths belongs to. */
export function lanesFor(paths: string[]): string[] {
  const lanes = new Set<string>(["publications"]);
  for (const p of paths) {
    if (p.startsWith("knowledge/")) lanes.add("knowledge");
    else if (p.startsWith("recipes/")) lanes.add("recipes");
  }
  return [...lanes];
}

/* ── the landing ───────────────────────────────────────────────────────────── */

export interface LandInput {
  runDir: string;
  run: ArticleRun;
  approvedPatches: RegistryPatch[];
  registry?: RegistryLocation;
  now?: () => Date;
  /** Called after each phase so the engine can persist progress. */
  progress?: (landing: ArticleLanding) => Promise<void>;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function copyTree(from: string, to: string): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return out;
  }
  await mkdir(to, { recursive: true });
  for (const e of entries) {
    if (e.isDirectory()) out.push(...(await copyTree(path.join(from, e.name), path.join(to, e.name))).map((p) => `${e.name}/${p}`));
    else if (e.isFile()) {
      await copyFile(path.join(from, e.name), path.join(to, e.name));
      out.push(e.name);
    }
  }
  return out;
}

/** The default branch of `origin`, as a ref a worktree can start from. */
async function baseRef(registry: string): Promise<string> {
  const head = await run(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], registry);
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim();
  for (const b of ["origin/main", "origin/master"]) {
    if ((await run(["git", "rev-parse", "--verify", "--quiet", b], registry)).code === 0) return b;
  }
  throw new ArticleError("the registry's remote has no main or master branch to start from", 502, "no-base-branch");
}

async function freeName(registry: string, base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const c = i === 1 ? base : `${base}-${i}`;
    if (!(await exists(c))) return c;
  }
  throw new ArticleError(`no free name near ${base} in ${registry}`, 409, "name-exhausted");
}

export async function landRun(input: LandInput): Promise<ArticleLanding> {
  const { runDir, run: art } = input;
  const now = input.now ?? (() => new Date());
  const location = input.registry ?? resolveRegistryDir();
  const registry = location.dir;

  const meta = await readJson<PostMeta>(path.join(runDir, "post", "meta.json"));
  const html = await readFile(path.join(runDir, "post", "index.html"), "utf8");
  const md = await readFile(path.join(runDir, "post", "post.md"), "utf8");
  const sources = await readJson<Source[]>(path.join(runDir, "sources.json"));
  const claims = await readJson<Claim[]>(path.join(runDir, "claims.json"));
  const check = existsSync(path.join(runDir, "check.json")) ? await readJson<CheckReport>(path.join(runDir, "check.json")) : undefined;
  const critique = registryCritique(await readCritiqueDetail(runDir));

  // Patch safety BEFORE anything touches the registry.
  const diffs: { patch: RegistryPatch; diff: string }[] = [];
  for (const p of input.approvedPatches) {
    const diff = await readFile(path.join(runDir, p.patchFile), "utf8");
    const safe = patchIsSafe(diff);
    if (!safe.ok) {
      throw new LandingError(`patch ${p.id} touches paths outside ${PATCHABLE_ROOTS.join(" and ")}: ${safe.bad.join(", ") || "(none named)"}`, "unsafe-patch", { slug: "", branch: "", gates: [] });
    }
    diffs.push({ patch: p, diff });
  }

  // 1. fetch
  const fetched = await run(["git", "fetch", "origin"], registry, 180_000);
  if (fetched.code !== 0) throw new LandingError(`git fetch failed in ${registry}: ${tail(fetched.stderr, 400)}`, "fetch-failed", { slug: "", branch: "", gates: [] }, fetched.stderr);
  const base = await baseRef(registry);

  // 2. slug, branch, worktree
  const slug = await freeName(registry, slugify(meta.title, 60) || slugify(art.topic.text, 60) || art.id, async (c) => {
    const t = await run(["git", "cat-file", "-e", `${base}:publications/${c}/publication.json`], registry);
    return t.code === 0;
  });
  const branch = await freeName(registry, `article/${slug}`, async (c) => {
    const local = await run(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${c}`], registry);
    const remote = await run(["git", "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${c}`], registry);
    return local.code === 0 || remote.code === 0;
  });
  // Made, not computed: mkdtemp leaves an empty directory only this landing
  // owns, and `git worktree add` accepts an empty one.
  const worktree = await uniqueDir(path.join(os.tmpdir(), "gravitone-articles"), `${art.id}-${now().getTime()}`);
  const landing: ArticleLanding = { slug, branch, worktree, gates: [] };
  await input.progress?.(landing);

  const added = await run(["git", "worktree", "add", "-b", branch, worktree, base], registry);
  if (added.code !== 0) {
    await rm(worktree, { recursive: true, force: true }).catch(() => undefined);
    throw new LandingError(`git worktree add failed: ${tail(added.stderr, 400)}`, "worktree-failed", landing, added.stderr);
  }

  // 3. the publication
  const pubDir = path.join(worktree, "publications", slug);
  await mkdir(pubDir, { recursive: true });
  const date = now().toISOString().slice(0, 10);
  const pub = publicationJson({ run: art, slug, date, meta, html, md, sources, claims, check, ...(critique ? { critique } : {}) });
  await writeFile(path.join(pubDir, "publication.json"), `${JSON.stringify(pub, null, 2)}\n`, "utf8");
  // The critique detail: every round's reviews and dispositions, flattened,
  // each entry carrying its round. Both files or neither, and only beside the
  // block (the registry gate fails a critique/ directory without one).
  if (critique) {
    await mkdir(path.join(pubDir, "critique"), { recursive: true });
    await writeFile(path.join(pubDir, "critique", "reviews.json"), `${JSON.stringify(critique.reviews, null, 2)}\n`, "utf8");
    await writeFile(path.join(pubDir, "critique", "dispositions.json"), `${JSON.stringify(critique.dispositions, null, 2)}\n`, "utf8");
  }
  await writeFile(path.join(pubDir, "post.html"), html.replace(/\r\n/g, "\n"), "utf8");
  await writeFile(path.join(pubDir, "post.md"), md.replace(/\r\n/g, "\n"), "utf8");
  await writeFile(path.join(pubDir, "SOURCES.md"), sourcesMarkdown(meta.title, sources), "utf8");
  await copyTree(path.join(runDir, "post", "figures"), path.join(pubDir, "figures"));
  // The registry is a text-only repository (its .gitattributes says so), so the
  // medium/ record there is the three text files; the PNGs stay in the run.
  await mkdir(path.join(pubDir, "medium"), { recursive: true });
  for (const f of ["story.html", "tags.txt", "README.md"]) {
    const from = path.join(runDir, "medium", f);
    if (existsSync(from)) await copyFile(from, path.join(pubDir, "medium", f));
  }

  // 4. approved patches
  const touched: string[] = [];
  for (const { patch, diff } of diffs) {
    const file = path.join(runDir, patch.patchFile);
    const applied = await run(["git", "apply", "--whitespace=nowarn", file], worktree);
    if (applied.code !== 0) {
      throw new LandingError(`patch ${patch.id} (${patch.target}) did not apply: ${tail(applied.stderr, 400)}`, "patch-failed", landing, applied.stderr);
    }
    touched.push(...patchPaths(diff));
  }

  // 5. gates: generators, then the check, per lane
  const log: string[] = [];
  for (const lane of lanesFor(touched)) {
    for (const mode of ["write", "check"] as const) {
      const argv = [process.execPath, "scripts/gate.mjs", "--lane", lane, ...(mode === "write" ? ["--write"] : [])];
      const g = await run(argv, worktree, 600_000);
      log.push(`$ node scripts/gate.mjs --lane ${lane}${mode === "write" ? " --write" : ""}  (exit ${g.code})\n${g.stdout}${g.stderr}`);
      landing.gates.push({ lane, mode, ok: g.code === 0 });
      await input.progress?.(landing);
      if (g.code !== 0) {
        throw new LandingError(`registry gate failed: --lane ${lane}${mode === "write" ? " --write" : ""} exited ${g.code}. The branch ${branch} stays local in ${worktree}. ${tail(g.stdout + g.stderr, 600)}`, "gate-failed", landing, log.join("\n\n"));
      }
    }
  }

  // 6. commit, push, PR
  const name = (await run(["git", "config", "user.name"], worktree)).stdout.trim();
  const email = (await run(["git", "config", "user.email"], worktree)).stdout.trim();
  if (!name || !email) throw new LandingError("the registry checkout has no git user.name/user.email configured; refusing to commit under an unknown identity", "no-identity", landing, log.join("\n\n"));
  const expected = process.env.ARTICLES_GIT_AUTHOR?.trim();
  if (expected && name !== expected) throw new LandingError(`the registry checkout commits as "${name}", not the expected "${expected}"`, "wrong-identity", landing, log.join("\n\n"));

  const staged = await run(["git", "add", "-A"], worktree);
  if (staged.code !== 0) throw new LandingError(`git add failed: ${tail(staged.stderr, 400)}`, "commit-failed", landing, staged.stderr);
  const patchLines = diffs.map(({ patch }) => `- ${patch.id} (${patch.kind}) ${patch.target}: ${patch.rationale}`);
  const message = [
    `publications(${slug}): ${meta.title}`,
    "",
    `Article run ${art.id} (${art.model}, effort ${art.effort}), approved ${art.approval?.at ?? date}.`,
    `Standard: ${art.standard.recipe} ${art.standard.version ?? "(unresolved)"}, bundle ${art.standard.bundle}.`,
    ...(patchLines.length ? ["", "Approved registry patches:", ...patchLines] : []),
  ].join("\n");
  const committed = await run(["git", "commit", "-m", message], worktree);
  if (committed.code !== 0) throw new LandingError(`git commit failed: ${tail(committed.stdout + committed.stderr, 400)}`, "commit-failed", landing, committed.stdout + committed.stderr);
  landing.commit = (await run(["git", "rev-parse", "HEAD"], worktree)).stdout.trim();
  await input.progress?.(landing);

  const pushed = await run(["git", "push", "-u", "origin", branch], worktree, 180_000);
  if (pushed.code !== 0) throw new LandingError(`git push failed; the commit stays on the local branch ${branch}: ${tail(pushed.stderr, 400)}`, "push-failed", landing, pushed.stderr);

  const checkRows = Object.entries(check?.dimensions ?? {}).map(([d, v]) => `| ${d} | ${v} |`);
  const body = [
    `Publication \`publications/${slug}/\` from article run \`${art.id}\`.`,
    "",
    `- Topic: ${art.topic.kind === "subject" ? `${art.topic.bundle}/${art.topic.subject}` : art.topic.text}`,
    `- Standard: ${art.standard.recipe} ${art.standard.version ?? ""} (${art.standard.bundle})`,
    `- Sources: ${sources.length}, primary ${sources.filter((s) => s.primary).length}, counter ${sources.filter((s) => s.counter).length}`,
    ...(critique
      ? [
          `- Critique: ${critique.block.rounds} round${critique.block.rounds === 1 ? "" : "s"}, decision ${critique.block.decision}; reviewers ${critique.block.reviewers.map((r) => `${r.id} (${r.engine} ${r.model}) ${r.outcome}`).join(", ")}`,
          `- Findings: ${critique.block.findings.total} (accepted ${critique.block.findings.accepted}, rejected ${critique.block.findings.rejected}, deferred ${critique.block.findings.deferred}) — publications/${slug}/critique/`,
        ]
      : []),
    "",
    ...(checkRows.length ? ["| dimension | deterministic check |", "|---|---|", ...checkRows, ""] : []),
    ...(check?.notMeasured.length ? [`Not measured by the check (the human's judgement): ${check.notMeasured.join(", ")}.`, ""] : []),
    ...(patchLines.length ? ["Approved registry patches:", ...patchLines, ""] : []),
    `Gates run: ${landing.gates.map((g) => `${g.lane}${g.mode === "write" ? " --write" : ""}`).join(", ")}.`,
  ].join("\n");
  const pr = await run([...ghArgv(), "pr", "create", "--base", base.replace(/^origin\//, ""), "--head", branch, "--title", `publications(${slug}): ${meta.title}`, "--body", body], worktree, 120_000);
  if (pr.code !== 0) throw new LandingError(`gh pr create failed; the branch ${branch} is pushed: ${tail(pr.stderr || pr.stdout, 400)}`, "pr-failed", landing, pr.stdout + pr.stderr);
  const url = /https?:\/\/\S+/.exec(pr.stdout);
  if (url) landing.prUrl = url[0];

  // success: the worktree has done its job
  const removed = await run(["git", "worktree", "remove", "--force", worktree], registry);
  if (removed.code === 0) delete landing.worktree;
  await writeFile(path.join(runDir, "landing.log"), log.join("\n\n"), "utf8");
  return landing;
}
