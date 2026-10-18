// THE TRIAL STORE: one directory per trial, beside the article store.
//
//   <store parent>/article-trials/<id>/     (ARTICLES_TRIALS_DIR overrides the root)
//
// A trial is made by an agent with a shell (the article-run skill's subagent), BEFORE any
// article run exists: the engine's writer turns never get a shell (lib/agent/cliSeam.ts).
// The file layout is documented beside the types (lib/articles/types.ts, "the trial").
// Server only.
//
// The plain reads and writes (`trialsRoot`, `trialDir`, `readTrial`, `readTrialDetail`,
// `linkTrialRun`) are the shared contract every package builds on. The verbs below them move
// a trial through its states, each one a CLI verb (pipeline/article.mts `trial ...`):
//
//   open -> (agent frames) -> check: framed -> seal: sealed -> exec ... -> close: closed
//                                       \-> drop: closed, no verdict
//
// THE SEAL IS THE PROTOCOL. A measured `exec` runs only under a seal whose sha256 still matches
// prereg.json's bytes, and `close` computes its verdict only then: a prereg edited after the
// first measurement is how a result gets fitted to its hypothesis (eval-harness/metric-role-
// contract: the metric and its thresholds are declared before the first run). Seal and exec
// log guard against drift, not against an adversary with a text editor; the critique's METHOD
// lens and the human at the gate are the backstop for that.

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { stripCredentials } from "@/lib/agent/reviewerEnv";
import { acquireLock } from "@/lib/diskTx";
import { killTree, seatOnlyEnv } from "@/lib/claudeCli";
import { cwdBoundGitEnv } from "@/lib/gitEnv";

import { resolveRegistryDir, StandardMissingError } from "../registryRead";
import { ArticleError, readJsonFile, readTextFile, slugify, storeRoot, writeJsonAtomic } from "../store";
import type {
  TrialDetail,
  TrialExecRecord,
  TrialPrereg,
  TrialRecord,
  TrialResults,
  TrialSeal,
  TrialValidity,
  TrialVerdict,
} from "../types";

import { appendLead, type RegistryLead } from "./leads";
import { computeVerdict, preregProblems, validateResults, validityProblems } from "./verdict";

export const TRIAL_ID_RE = /^[a-z0-9][a-z0-9-]{0,90}$/;

/** The files a trial directory holds, by name. A run's `experiment/` holds the same names. */
export const TRIAL_FILES = {
  record: "trial.json",
  brief: "brief",
  frame: "frame.md",
  validity: "validity.json",
  prereg: "prereg.json",
  seal: "seal.json",
  harness: "harness",
  execs: "exec.jsonl",
  /** `<k>.log` per `trial exec`, k counting from 1 in exec.jsonl's order: stdout and stderr as they arrived. */
  execLogs: "exec-logs",
  results: "results.json",
  verdict: "verdict.json",
  report: "REPORT.md",
  /** `{reason, at}` of a dropped trial (TrialRecord has no field for it). */
  drop: "drop.json",
} as const;

export function trialsRoot(): string {
  const env = process.env.ARTICLES_TRIALS_DIR?.trim();
  if (env) return path.resolve(env);
  return path.join(path.dirname(path.resolve(storeRoot())), "article-trials");
}

export function trialDir(id: string): string {
  if (!TRIAL_ID_RE.test(id)) throw new ArticleError(`not a trial id: ${JSON.stringify(id)}`, 400, "bad-trial-id");
  return path.join(trialsRoot(), id);
}

export async function readTrial(id: string): Promise<TrialRecord> {
  const rec = await readJsonFile<TrialRecord | null>(path.join(trialDir(id), TRIAL_FILES.record), null);
  if (!rec) throw new ArticleError(`no trial ${id}`, 404, "no-trial");
  return rec;
}

/** Record the run written around a trial. Refuses a second, different run. */
export async function linkTrialRun(id: string, runId: string, now: Date = new Date()): Promise<TrialRecord> {
  const rec = await readTrial(id);
  if (rec.runId && rec.runId !== runId) throw new ArticleError(`trial ${id} already belongs to run ${rec.runId}`, 409, "trial-taken");
  const next: TrialRecord = { ...rec, runId, updatedAt: now.toISOString() };
  await writeJsonAtomic(path.join(trialDir(id), TRIAL_FILES.record), next);
  return next;
}

/** `exec.jsonl`, oldest first. A line that does not parse throws: the log is evidence. */
export async function readExecs(dir: string): Promise<TrialExecRecord[]> {
  const raw = await readTextFile(path.join(dir, TRIAL_FILES.execs));
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l) as TrialExecRecord;
      } catch {
        throw new ArticleError(`${TRIAL_FILES.execs} line ${i + 1} is not JSON`, 500, "corrupt-file");
      }
    });
}

/** `.ai/registry-map.json` read once: slug -> the context NAMES that subject governs, sorted.
 *  An absent or unreadable map answers an empty list for every slug: the gate says "none
 *  known", never guesses. `trial candidates` asks this for every subject of every bundle,
 *  which is why the map is read once and not once per slug. */
export async function governsIndex(root: string = process.cwd()): Promise<(slug: string) => string[]> {
  let map: { subjectIndex?: Record<string, string[]>; contexts?: { context: string; name: string }[] };
  try {
    map = JSON.parse(await readFile(path.join(root, ".ai", "registry-map.json"), "utf8"));
  } catch {
    return () => [];
  }
  const names = new Map((map.contexts ?? []).map((c) => [c.context, c.name]));
  return (slug) => {
    const ids = map.subjectIndex?.[slug] ?? [];
    return [...new Set(ids.map((id) => names.get(id)).filter((n): n is string => !!n))].sort();
  };
}

/** The context NAMES in this repo's `.ai/registry-map.json` that a subject governs.
 *  An absent or unreadable map is an empty list: the gate says "none known", never guesses. */
export async function governsHere(slug: string, root: string = process.cwd()): Promise<string[]> {
  return (await governsIndex(root))(slug);
}

/** A trial's files read back from `dir`: a trial directory or a run's `experiment/`.
 *  `undefined` when the directory holds no verdict (a classic run, an unclosed trial). */
export async function readTrialDetail(dir: string, root: string = process.cwd()): Promise<TrialDetail | undefined> {
  const verdict = await readJsonFile<TrialVerdict | null>(path.join(dir, TRIAL_FILES.verdict), null);
  if (!verdict) return undefined;
  const prereg = await readJsonFile<TrialPrereg | null>(path.join(dir, TRIAL_FILES.prereg), null);
  const results = await readJsonFile<TrialResults | null>(path.join(dir, TRIAL_FILES.results), null);
  if (!prereg || !results) throw new ArticleError(`${dir} has a verdict but no ${!prereg ? TRIAL_FILES.prereg : TRIAL_FILES.results}`, 500, "trial-incomplete");
  const validity = await readJsonFile<TrialValidity | null>(path.join(dir, TRIAL_FILES.validity), null);
  const report = await readTextFile(path.join(dir, TRIAL_FILES.report));
  return {
    prereg,
    verdict,
    results,
    ...(validity ? { validity } : {}),
    execs: await readExecs(dir),
    ...(report !== undefined ? { report } : {}),
    governsHere: await governsHere(prereg.subject.slug, root),
  };
}

/* ── locks ─────────────────────────────────────────────────────────────────── */

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The trial's short JSON lock, from the repo's one lock kernel (lib/diskTx): the same shape as the
 *  run lock in lib/articles/store.ts, for the same reason (the CLI is not the only process; an
 *  orchestrator drives several trial agents, each with its own shell, at once). */
async function withLock<T>(lock: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireLock(lock, {
    by: "trial",
    onTimeout: (file, waitMs) => new ArticleError(`${file} is held and was not released in ${waitMs} ms`, 409, "locked"),
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

const withTrialLock = <T>(dir: string, fn: () => Promise<T>) => withLock(path.join(dir, ".lock"), fn);

/**
 * ONE `trial exec` AT A TIME PER TRIAL, held by pid for the whole command. Two reasons, both
 * about the measurement: the wall budget is the sealed total minus what measured execs already
 * used, and two execs started together would each be handed the whole remainder; and two arms
 * run side by side on one machine compete for it, which is a confound the controls cannot name.
 * A lease whose pid is gone is a killed CLI, and is broken (the article store's driver lease).
 */
async function acquireExecLease(dir: string): Promise<() => Promise<void>> {
  const file = path.join(dir, ".exec");
  // Liveness is by pid, not by age: a measured exec may hold the lease for the whole wall budget.
  // A lease whose pid is gone is a killed CLI and is broken here; the exclusive create itself is
  // lib/diskTx's, with no age-based breaking and no waiting (a second exec is refused, not queued).
  if (!(await execRunning(dir))) await rm(file, { force: true });
  return acquireLock(file, {
    by: "trial exec",
    timing: { staleMs: Number.MAX_SAFE_INTEGER, waitMs: 0 },
    onTimeout: () => new ArticleError(`trial ${path.basename(dir)} is running another exec`, 409, "exec-busy"),
  });
}

async function execRunning(dir: string): Promise<boolean> {
  const held = await readJsonFile<{ pid?: number } | null>(path.join(dir, ".exec"), null).catch(() => null);
  return !!held?.pid && pidAlive(held.pid);
}

/* ── reading what the agent wrote ──────────────────────────────────────────── */

/** A file the agent writes, parsed for validation: absent or unparseable is a 400 naming the file,
 *  in the validator's code, because to the agent it is the same mistake. */
async function readAgentJson(dir: string, name: string, code: string): Promise<{ raw: unknown; bytes: Buffer }> {
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(dir, name));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ArticleError(`${name} does not exist in ${dir}`, 400, code);
    throw e;
  }
  try {
    return { raw: JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")), bytes };
  } catch (e) {
    throw new ArticleError(`${name} is not valid JSON (${(e as Error).message})`, 400, code);
  }
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** prereg.json's bytes against the seal: 409 `prereg-changed` when they differ. */
async function assertSealHolds(dir: string, seal: TrialSeal): Promise<Buffer> {
  const bytes = await readFile(path.join(dir, TRIAL_FILES.prereg)).catch(() => undefined);
  if (!bytes || sha256(bytes) !== seal.sha256) {
    throw new ArticleError(
      `prereg.json ${bytes ? "changed" : "is gone"} since the seal at ${seal.at} (sealed sha256 ${seal.sha256.slice(0, 12)}…); a sealed protocol is not edited`,
      409,
      "prereg-changed",
    );
  }
  return bytes;
}

/** The technique slugs of a subject: the registry index entry's, else the files `trial open`
 *  copied into brief/techniques/ (a registry that moved or went away since the open). */
async function techniquesOf(dir: string, rec: TrialRecord): Promise<string[]> {
  try {
    const registry = resolveRegistryDir();
    const index = JSON.parse(await readFile(path.join(registry.dir, "knowledge", rec.subject.bundle, "index.json"), "utf8")) as KnowledgeIndex;
    const listed = (index.subjects?.[rec.subject.slug]?.techniques ?? []).map((t) => t?.slug).filter((s): s is string => typeof s === "string" && !!s);
    if (listed.length) return listed;
  } catch {
    /* the copy in brief/ answers */
  }
  return (await mdFiles(path.join(dir, TRIAL_FILES.brief, "techniques"))).map((f) => f.replace(/\.md$/, ""));
}

/** The registry's closed default set of application stacks (check-bundles.mjs `STACKS`). */
const DEFAULT_STACKS = ["react", "rust", "sql", "node", "process"];

/** The application stacks the subject's bundle accepts: the default set plus its `index.md`
 *  frontmatter `stacks: [...]`, exactly as the registry's bundle gate builds it. `undefined` when
 *  the registry cannot be read: then nothing here can say, and landing's gate still will.
 *  Checked at framing because a stack the bundle does not declare passes every trial verb and
 *  fails only at landing, hours and one article later (found while building, 2026-10-18). */
async function stacksOf(rec: TrialRecord): Promise<string[] | undefined> {
  try {
    const registry = resolveRegistryDir();
    const md = (await readFile(path.join(registry.dir, "knowledge", rec.subject.bundle, "index.md"), "utf8")).replace(/\r\n/g, "\n");
    const fm = /^---\n([\s\S]*?)\n---/.exec(md)?.[1] ?? "";
    const line = /^stacks:\s*\[(.*)\]\s*$/m.exec(fm)?.[1] ?? "";
    const declared = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => SLUG_RE.test(s));
    return [...new Set([...DEFAULT_STACKS, ...declared])];
  } catch {
    return undefined;
  }
}

/** prereg.json and validity.json as a framed trial must hold them; one 400 naming every problem. */
async function readFraming(dir: string, rec: TrialRecord): Promise<{ prereg: TrialPrereg; validity: TrialValidity; bytes: Buffer }> {
  const { raw, bytes } = await readAgentJson(dir, TRIAL_FILES.prereg, "bad-prereg");
  const problems = preregProblems(raw);
  const p = raw as Partial<TrialPrereg>;
  const named = p.subject && typeof p.subject === "object" && typeof p.subject.bundle === "string" && typeof p.subject.slug === "string";
  if (named && (p.subject!.bundle !== rec.subject.bundle || p.subject!.slug !== rec.subject.slug)) {
    problems.push(`subject is ${p.subject!.bundle}/${p.subject!.slug}, but this trial was opened on ${rec.subject.bundle}/${rec.subject.slug}`);
  }
  if (typeof p.technique === "string" && SLUG_RE.test(p.technique)) {
    const known = await techniquesOf(dir, rec);
    if (!known.includes(p.technique)) problems.push(`technique "${p.technique}" is not one of the subject's techniques (${known.join(", ") || "none listed"})`);
  }
  if (typeof p.stack === "string" && SLUG_RE.test(p.stack)) {
    const stacks = await stacksOf(rec);
    if (stacks && !stacks.includes(p.stack)) problems.push(`stack "${p.stack}" is not one the registry's ${rec.subject.bundle} bundle accepts for an application (${stacks.join(", ")})`);
  }
  if (problems.length) throw new ArticleError(`prereg.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.join("; ")}`, 400, "bad-prereg");
  const v = await readAgentJson(dir, TRIAL_FILES.validity, "bad-validity");
  const vp = validityProblems(v.raw);
  if (vp.length) throw new ArticleError(`validity.json has ${vp.length} problem${vp.length === 1 ? "" : "s"}: ${vp.join("; ")}`, 400, "bad-validity");
  return { prereg: raw as TrialPrereg, validity: v.raw as TrialValidity, bytes };
}

const refuseClosed = (rec: TrialRecord) => new ArticleError(`trial ${rec.id} is closed${rec.verdict ? ` (${rec.verdict})` : " (dropped)"}`, 409, "trial-closed");

/* ── open ──────────────────────────────────────────────────────────────────── */

interface KnowledgeIndex {
  subjects?: Record<string, { file?: string; digest?: string; revision?: number; changedAt?: string; techniques?: { slug?: string }[] }>;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

async function mdFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile() && d.name.endsWith(".md")).map((d) => d.name).sort();
  } catch {
    return [];
  }
}

/** The flat `key: value` lines of a document's frontmatter; values unquoted, comments dropped
 *  (the registry's own reader, check-currency.mjs, reads them the same way). */
export function frontmatter(md: string): Record<string, string> {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export interface BriefApplication {
  file: string;
  stack: string;
  technique: string;
  ab_verdict?: string;
  verified_on?: string;
}

/** The subject's applications with their verdicts, from each file's frontmatter (the index does
 *  not carry `ab_verdict`). Missing stack or technique fall back to the `<stack>--<technique>.md` name. */
export async function readApplications(registryDir: string, subjectDirRel: string): Promise<BriefApplication[]> {
  const rel = `${subjectDirRel}/applications`;
  const out: BriefApplication[] = [];
  for (const name of await mdFiles(path.join(registryDir, rel))) {
    let md = "";
    try {
      md = await readFile(path.join(registryDir, rel, name), "utf8");
    } catch {
      continue;
    }
    const fm = frontmatter(md);
    const [byNameStack, byNameTechnique] = name.replace(/\.md$/, "").split("--");
    out.push({
      file: `${rel}/${name}`,
      stack: fm.stack || byNameStack || "unknown",
      technique: fm.technique || byNameTechnique || "unknown",
      ...(fm.ab_verdict ? { ab_verdict: fm.ab_verdict } : {}),
      ...(fm.verified_on ? { verified_on: fm.verified_on } : {}),
    });
  }
  return out;
}

/** The registry's own currency report, as JSON: `node scripts/check-currency.mjs <args> --json` in
 *  the registry. Undefined when the script is absent, fails or prints something that is not JSON:
 *  currency is a signal a trial is ranked and briefed with, never a reason to stop. */
export function currencyReport(registryDir: string, args: string[], timeoutMs = 120_000): Promise<string | undefined> {
  const script = path.join(registryDir, "scripts", "check-currency.mjs");
  return new Promise((resolve) => {
    stat(script).then(
      () =>
        execFile(
          process.execPath,
          [script, ...args, "--json"],
          // It runs `git log` in the registry: the environment must not name another repository.
          { cwd: registryDir, env: cwdBoundGitEnv(), encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024, windowsHide: true },
          (err, stdout) => {
            if (err) return resolve(undefined);
            try {
              JSON.parse(stdout);
              resolve(stdout);
            } catch {
              resolve(undefined);
            }
          },
        ),
      () => resolve(undefined),
    );
  });
}

/** `<YYYY-MM-DD>-<slug>`, suffixed `-2`, `-3` ... until free; the directory is CREATED here, which
 *  is the claim (mkdir without `recursive` fails on an existing name, in every process). */
async function claimTrialDir(slug: string, now: Date): Promise<string> {
  const base = `${now.toISOString().slice(0, 10)}-${slugify(slug, 60) || "trial"}`;
  await mkdir(trialsRoot(), { recursive: true });
  for (let i = 0; i < 200; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    try {
      await mkdir(path.join(trialsRoot(), id));
      return id;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  throw new ArticleError("too many trials on that subject today", 409, "id-exhausted");
}

/** `trial open <bundle/slug>`: a new trial directory with `brief/` written from the registry. */
export async function openTrial(subject: { bundle: string; slug: string }, now: Date = new Date()): Promise<TrialRecord> {
  const { bundle, slug } = subject;
  if (!SLUG_RE.test(bundle ?? "") || !SLUG_RE.test(slug ?? "")) throw new ArticleError(`a subject is addressed as <bundle>/<slug>, got ${JSON.stringify(`${bundle}/${slug}`)}`, 400, "bad-subject");
  const registry = resolveRegistryDir();
  const indexRel = `knowledge/${bundle}/index.json`;
  let index: KnowledgeIndex;
  try {
    index = JSON.parse(await readFile(path.join(registry.dir, indexRel), "utf8")) as KnowledgeIndex;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new ArticleError(`the registry has no bundle ${bundle} (${indexRel})`, 404, "no-subject");
    throw new StandardMissingError(`${indexRel} could not be read (${(e as Error).message})`);
  }
  const row = index.subjects?.[slug];
  if (!row?.file) throw new ArticleError(`${indexRel} has no subject "${slug}"`, 404, "no-subject");
  const abs = path.resolve(registry.dir, row.file);
  if (!abs.startsWith(path.resolve(registry.dir) + path.sep)) throw new StandardMissingError(`index entry ${JSON.stringify(row.file)} points outside the registry`);
  const file = path.relative(registry.dir, abs).split(path.sep).join("/");
  const subjectDir = file.slice(0, file.lastIndexOf("/"));
  const golden = await readFile(abs, "utf8").catch(() => {
    throw new StandardMissingError(`subject ${slug}: ${file} does not exist`);
  });

  // The whole open under one lock: the claim check and the directory that answers it must be
  // one step, or two orchestrators that open the same subject both win.
  return withLock(path.join(trialsRoot(), ".open.lock"), async () => {
    const { trials } = await scanTrials();
    const holder = trials.find((t) => t.status !== "closed" && t.subject.bundle === bundle && t.subject.slug === slug);
    if (holder) throw new ArticleError(`${bundle}/${slug} is held by trial ${holder.id} (${holder.status})`, 409, "trial-claimed");

    const id = await claimTrialDir(slug, now);
    const dir = trialDir(id);
    try {
      const brief = path.join(dir, TRIAL_FILES.brief);
      await mkdir(path.join(brief, "techniques"), { recursive: true });
      await writeFile(path.join(brief, "golden-path.md"), golden);
      for (const name of await mdFiles(path.join(registry.dir, subjectDir, "techniques"))) {
        await writeFile(path.join(brief, "techniques", name), await readFile(path.join(registry.dir, subjectDir, "techniques", name)));
      }
      await writeJsonAtomic(path.join(brief, "applications.json"), await readApplications(registry.dir, subjectDir));
      const currency = await currencyReport(registry.dir, ["--volatile", "--subject", slug]);
      if (currency) await writeFile(path.join(brief, "currency.json"), currency);
      await writeJsonAtomic(path.join(brief, "governs.json"), await governsHere(slug));

      const at = now.toISOString();
      const rec: TrialRecord = {
        schema: "article-trial/1",
        id,
        status: "open",
        subject: {
          bundle,
          slug,
          file,
          ...(typeof row.digest === "string" ? { digest: row.digest } : {}),
          ...(typeof row.revision === "number" ? { revision: row.revision } : {}),
          ...(typeof row.changedAt === "string" ? { changedAt: row.changedAt } : {}),
        },
        createdAt: at,
        updatedAt: at,
      };
      // Last, so a directory without trial.json is a failed open, never a half-briefed trial.
      await writeJsonAtomic(path.join(dir, TRIAL_FILES.record), rec);
      return rec;
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    }
  });
}

/* ── list ──────────────────────────────────────────────────────────────────── */

/** Every trial on disk, newest first. A directory whose trial.json does not parse is skipped and
 *  named in `damaged`, not hidden (lib/articles/store.ts `listRuns`). */
export async function scanTrials(): Promise<{ trials: TrialRecord[]; damaged: string[] }> {
  let names: string[] = [];
  try {
    names = await readdir(trialsRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const trials: TrialRecord[] = [];
  const damaged: string[] = [];
  for (const name of names) {
    if (!TRIAL_ID_RE.test(name)) continue;
    try {
      const rec = await readJsonFile<TrialRecord | null>(path.join(trialsRoot(), name, TRIAL_FILES.record), null);
      if (rec) trials.push(rec);
    } catch {
      damaged.push(name);
    }
  }
  trials.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { trials, damaged: damaged.sort() };
}

/** Every trial, newest first. */
export async function listTrials(): Promise<TrialRecord[]> {
  return (await scanTrials()).trials;
}

/** What `trial status <id>` reports: the record, which files exist, the exec log, the budget spent. */
export interface TrialStatusView {
  trial: TrialRecord;
  dir: string;
  files: string[];
  execs: TrialExecRecord[];
  /** Wall time used by measured execs, against `budget.wallMin`. */
  measuredMs: number;
  budget?: TrialPrereg["budget"];
  verdict?: TrialVerdict;
  drop?: { reason: string; at: string };
}

export async function describeTrial(id: string): Promise<TrialStatusView> {
  const trial = await readTrial(id);
  const dir = trialDir(id);
  const present = new Set(await readdir(dir).catch(() => [] as string[]));
  const execs = await readExecs(dir);
  const tolerant = <T>(name: string) => readJsonFile<T | null>(path.join(dir, name), null).catch(() => null);
  const prereg = await tolerant<TrialPrereg>(TRIAL_FILES.prereg);
  const verdict = await tolerant<TrialVerdict>(TRIAL_FILES.verdict);
  const drop = await tolerant<{ reason: string; at: string }>(TRIAL_FILES.drop);
  return {
    trial,
    dir,
    files: Object.values(TRIAL_FILES).filter((f) => present.has(f)),
    execs,
    measuredMs: execs.filter((e) => !e.pilot).reduce((s, e) => s + e.durationMs, 0),
    ...(prereg?.budget ? { budget: prereg.budget } : {}),
    ...(verdict ? { verdict } : {}),
    ...(drop ? { drop } : {}),
  };
}

/* ── check and seal ────────────────────────────────────────────────────────── */

/** `trial check <id>`: prereg.json and validity.json are valid and name this trial's subject and one
 *  of its techniques; the trial becomes `framed`. The step an orchestrator vets before anything is
 *  spent. A sealed trial is checked and left sealed. */
export async function checkTrial(id: string, now: Date = new Date()): Promise<{ record: TrialRecord; prereg: TrialPrereg; validity: TrialValidity }> {
  const dir = trialDir(id);
  return withTrialLock(dir, async () => {
    const rec = await readTrial(id);
    if (rec.status === "closed") throw refuseClosed(rec);
    // A sealed trial answers for its seal first: a valid prereg that is not the sealed one is the
    // finding, not a pass.
    if (rec.seal) await assertSealHolds(dir, rec.seal);
    const { prereg, validity } = await readFraming(dir, rec);
    if (rec.status === "sealed" || rec.status === "framed") return { record: rec, prereg, validity };
    const record: TrialRecord = { ...rec, status: "framed", updatedAt: now.toISOString() };
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.record), record);
    return { record, prereg, validity };
  });
}

/** Validate prereg.json and write seal.json; the trial becomes `sealed`. Sealing the same bytes
 *  again is a no-op; sealing different bytes is 409 `already-sealed`. */
export async function sealTrial(id: string, now: Date = new Date()): Promise<TrialRecord> {
  const dir = trialDir(id);
  return withTrialLock(dir, async () => {
    const rec = await readTrial(id);
    if (rec.status === "closed") throw refuseClosed(rec);
    if (rec.seal) {
      const bytes = await readFile(path.join(dir, TRIAL_FILES.prereg)).catch(() => undefined);
      if (bytes && sha256(bytes) === rec.seal.sha256) return rec;
      throw new ArticleError(`trial ${id} was sealed at ${rec.seal.at} with a different prereg.json; a seal is not moved`, 409, "already-sealed");
    }
    const { bytes } = await readFraming(dir, rec);
    const seal: TrialSeal = { sha256: sha256(bytes), at: now.toISOString() };
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.seal), seal);
    const next: TrialRecord = { ...rec, status: "sealed", seal, updatedAt: seal.at };
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.record), next);
    return next;
  });
}

/* ── exec ──────────────────────────────────────────────────────────────────── */

/** A pilot's wall cap. Pilots prove the harness runs; ten minutes is enough for that and not
 *  enough to quietly run the experiment unsealed. */
export const PILOT_CAP_MS = 10 * 60_000;
/** After the cap's kill, how long the record waits for the pipes to close before it stops
 *  waiting: a grandchild that inherited them must not hold the exec open past its cap. */
const KILL_GRACE_MS = 5_000;

export interface ExecOptions {
  pilot?: boolean;
  /** Lower the wall cap (never raise it): the budget's remainder still bounds a measured exec. */
  capMs?: number;
  /** The child's output as it arrives, for a caller that streams it (the CLI). */
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
  now?: () => Date;
}

/**
 * THE HARNESS'S ENVIRONMENT. The seat CLIs (claude, codex, agy) authenticate from their own
 * login files, so a harness that calls them works; what it must never see is a metered key.
 * `seatOnlyEnv` takes the Anthropic variables (lib/claudeCli.ts), `stripCredentials` every
 * NAME that looks like a credential (the reviewer's own pattern, lib/agent/reviewerEnv.ts),
 * and `cwdBoundGitEnv` the variables a git hook exports that would point a child's git at
 * this checkout. A trial that cannot be measured on the seat is `untestable`, not a reason to
 * pass a key through.
 */
export function harnessEnv(): NodeJS.ProcessEnv {
  return cwdBoundGitEnv(stripCredentials(seatOnlyEnv()));
}

/** The whole tree: on Windows taskkill /T from the child's pid (lib/claudeCli.ts `killTree`, which
 *  measured that a plain kill leaves grandchildren running); off Windows the child leads its own
 *  process group (spawned detached), so the group is signalled. */
function killAll(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      /* the group is gone or was never formed: the plain kill below */
    }
  }
  killTree(child);
}

function runCapped(cmd: string[], cwd: string, capMs: number, logFile: string, opts: ExecOptions): Promise<{ exitCode: number | null; durationMs: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const log = createWriteStream(logFile, { flags: "a" });
    const started = Date.now();
    let timedOut = false;
    let settled = false;
    let grace: NodeJS.Timeout | undefined;
    const note = (s: string) => {
      const b = Buffer.from(`[trial] ${s}\n`);
      log.write(b);
      opts.onStderr?.(b);
    };
    // No shell: the argv runs exactly as exec.jsonl records it. A pipeline or a Windows .cmd shim
    // (npx, npm) goes through one the agent names: `-- bash -c "..."` or `-- cmd /c ...`.
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd,
      env: harnessEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (grace) clearTimeout(grace);
      log.end(() => resolve({ exitCode: timedOut ? null : code, durationMs: Date.now() - started, timedOut }));
    };
    child.stdout?.on("data", (c: Buffer) => {
      log.write(c);
      opts.onStdout?.(c);
    });
    child.stderr?.on("data", (c: Buffer) => {
      log.write(c);
      opts.onStderr?.(c);
    });
    child.on("error", (e) => {
      note(`the command could not be started: ${e.message}`);
      finish(null);
    });
    child.on("close", (code) => finish(code));
    const timer = setTimeout(() => {
      timedOut = true;
      note(`wall cap of ${Math.round(capMs / 1000)} s reached; the process tree was killed`);
      killAll(child);
      grace = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null);
      }, KILL_GRACE_MS);
    }, capMs);
  });
}

/** Run one command in the trial's harness/ under the seat-only, credential-stripped
 *  environment and the wall-time cap; append its record to exec.jsonl.
 *
 *  A pilot runs in an open, framed or sealed trial under PILOT_CAP_MS and never counts. A
 *  measured exec runs only in a sealed trial whose prereg.json still matches the seal, capped at
 *  `budget.wallMin` minus the wall time earlier measured execs used. A timed-out exec records
 *  `exitCode: null`: the code a killed tree exits with is the kill's, not the command's. */
export async function execTrial(id: string, cmd: string[], opts: ExecOptions = {}): Promise<TrialExecRecord> {
  if (!cmd.length || !cmd[0]) throw new ArticleError("trial exec needs a command after --", 400, "bad-cmd");
  const dir = trialDir(id);
  const pilot = !!opts.pilot;
  const now = opts.now ?? (() => new Date());
  const rec = await readTrial(id);
  if (rec.status === "closed") throw refuseClosed(rec);
  if (!pilot && (rec.status !== "sealed" || !rec.seal)) {
    throw new ArticleError(`trial ${id} is ${rec.status}: a measured exec runs only after \`trial seal\` (a pilot is --pilot)`, 409, "not-sealed");
  }
  const release = await acquireExecLease(dir);
  try {
    const before = await readExecs(dir);
    let cap = PILOT_CAP_MS;
    if (!pilot) {
      const bytes = await assertSealHolds(dir, rec.seal!);
      const prereg = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) as TrialPrereg;
      const used = before.filter((e) => !e.pilot).reduce((s, e) => s + e.durationMs, 0);
      cap = prereg.budget.wallMin * 60_000 - used;
      if (cap <= 0) throw new ArticleError(`trial ${id} has used its ${prereg.budget.wallMin} min wall budget (${Math.round(used / 1000)} s measured)`, 409, "budget-spent");
    }
    if (typeof opts.capMs === "number" && Number.isFinite(opts.capMs) && opts.capMs > 0) cap = Math.min(cap, opts.capMs);

    const harness = path.join(dir, TRIAL_FILES.harness);
    await mkdir(harness, { recursive: true });
    await mkdir(path.join(dir, TRIAL_FILES.execLogs), { recursive: true });
    const logFile = path.join(dir, TRIAL_FILES.execLogs, `${before.length + 1}.log`);
    const at = now().toISOString();
    const r = await runCapped(cmd, harness, cap, logFile, opts);
    const record: TrialExecRecord = { at, cmd: [...cmd], pilot, exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut };
    await appendFile(path.join(dir, TRIAL_FILES.execs), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  } finally {
    await release();
  }
}

/* ── close and drop ────────────────────────────────────────────────────────── */

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The lead a void trial files: the technique was put to a test the protocol could not carry, and
 *  the registry should know before somebody tries the same design again. */
function voidLead(rec: TrialRecord, prereg: TrialPrereg, verdict: TrialVerdict, now: Date): RegistryLead {
  return {
    ts: now.toISOString(),
    bundle: rec.subject.bundle,
    nearest: rec.subject.slug,
    kind: "technique",
    claim:
      `When ${prereg.technique} ("${prereg.claim}") is measured against ${prereg.alternative.name} on ${prereg.metric.label}, ` +
      `hold ${prereg.controls.map((c) => c.id).join(", ")} and ${prereg.n} observations per arm inside ${prereg.budget.modelCalls} model calls, ` +
      `because trial ${rec.id} was void: ${verdict.reason}.`,
    because: `trial ${rec.id} (${prereg.environment}): ${prereg.arms[0].label} vs ${prereg.arms[1].label}, n=${verdict.arms[0].n}/${verdict.arms[1].n} of ${prereg.n}; ${verdict.reason}`,
    confidence: "low",
    from: `article-trial@${day(now)}`,
  };
}

/** Validate results.json against the sealed prereg, compute and write verdict.json; the trial
 *  becomes `closed`. A `void` verdict appends a registry lead. */
export async function closeTrial(id: string, now: Date = new Date()): Promise<TrialVerdict> {
  const dir = trialDir(id);
  return withTrialLock(dir, async () => {
    const rec = await readTrial(id);
    if (rec.status === "closed") throw refuseClosed(rec);
    if (rec.status !== "sealed" || !rec.seal) throw new ArticleError(`trial ${id} is ${rec.status}: only a sealed trial closes`, 409, "not-sealed");
    if (await execRunning(dir)) throw new ArticleError(`trial ${id} is running an exec; close it when the measurement is done`, 409, "exec-busy");
    const bytes = await assertSealHolds(dir, rec.seal);
    const prereg = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")) as TrialPrereg;
    const measured = (await readExecs(dir)).filter((e) => !e.pilot && e.at >= rec.seal!.at);
    if (!measured.length) throw new ArticleError(`trial ${id} has no measured exec since its seal at ${rec.seal.at}: results.json must come from \`trial exec\``, 409, "no-measurement");
    const { raw } = await readAgentJson(dir, TRIAL_FILES.results, "bad-results");
    const results = validateResults(raw, prereg);
    const verdict = computeVerdict(prereg, results, now);
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.verdict), verdict);
    if (verdict.verdict === "void") await appendLead(voidLead(rec, prereg, verdict, now));
    const at = now.toISOString();
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.record), { ...rec, status: "closed", verdict: verdict.verdict, closedAt: at, updatedAt: at } satisfies TrialRecord);
    return verdict;
  });
}

/** `trial drop <id> --reason`: an orchestrator's rejection of a trial it will not run (stale,
 *  untestable, a strawman alternative, the operator declined). Closed, no verdict. When the trial's
 *  validity.json found the subject `stale`, that finding is filed as a subject lead with its first
 *  source, because it is true whether or not this trial runs. */
export async function dropTrial(id: string, reason: string, now: Date = new Date()): Promise<{ record: TrialRecord; lead?: RegistryLead; leadsFile?: string }> {
  const why = (reason ?? "").trim();
  if (!why) throw new ArticleError("a drop needs a reason", 400, "bad-reason");
  if (why.length > 2000) throw new ArticleError(`a drop reason is at most 2000 characters (got ${why.length})`, 400, "bad-reason");
  const dir = trialDir(id);
  return withTrialLock(dir, async () => {
    const rec = await readTrial(id);
    if (rec.status === "closed") throw refuseClosed(rec);
    if (await execRunning(dir)) throw new ArticleError(`trial ${id} is running an exec`, 409, "exec-busy");
    const at = now.toISOString();
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.drop), { reason: why, at });
    const v = await readJsonFile<unknown>(path.join(dir, TRIAL_FILES.validity), null).catch(() => null);
    const validity = v && !validityProblems(v).length ? (v as TrialValidity) : undefined;
    let lead: RegistryLead | undefined;
    let file: string | undefined;
    if (validity?.state === "stale") {
      const src = validity.sources[0];
      lead = {
        ts: at,
        bundle: rec.subject.bundle,
        nearest: rec.subject.slug,
        kind: "subject",
        claim:
          `When ${rec.subject.bundle}/${rec.subject.slug} is read as current practice, re-check it against the field first` +
          (src ? ` (${src.title}, ${src.date})` : "") +
          `, because ${validity.reasons.join("; ") || "the trial found it stale"}.`,
        because: `trial ${rec.id} judged the subject stale before measuring${src ? `; first source ${src.url}` : ""}; dropped: ${why}`,
        confidence: "low",
        from: `article-trial@${day(now)}`,
      };
      file = await appendLead(lead);
    }
    const record: TrialRecord = { ...rec, status: "closed", closedAt: at, updatedAt: at };
    await writeJsonAtomic(path.join(dir, TRIAL_FILES.record), record);
    return { record, ...(lead ? { lead, leadsFile: file } : {}) };
  });
}
