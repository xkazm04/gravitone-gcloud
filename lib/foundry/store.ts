// THE FOUNDRY DISK LAYER — server only.
//
// The forge (pipeline/foundry/forge.py) writes runs under foundry-out/runs/;
// this module is the app's only way to read them and the only way the cull
// mutates them. Two files per run are the app's to write — verdicts.json and,
// on commit, run.json's `committed` block plus the deletions — and everything
// else on disk is the forge's.
//
// What a COMMIT is, precisely: the rejected candidates' files are deleted,
// the kept ones are left byte-identical, and the judgement is written to the
// two VERSIONED indices in pipeline/foundry/ — ledger.json (one row per
// decided candidate, keyed by every axis) and styles.json (evidence appended
// to each style, status promoted to `proven` when a human kept it on more
// than one scene). Those two files are the finding; the images are only the
// evidence behind it, which is why foundry-out/ is gitignored and they are not.
//
// Path safety: every run-relative path is resolved and checked to stay inside
// its run directory before it is read or unlinked. `run` ids are validated
// against a strict slug so a crafted id cannot walk anywhere.

import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  Candidate,
  Catalogue,
  CommitResult,
  LedgerRow,
  RunDetail,
  RunManifest,
  RunSummary,
  StyleDef,
  Verdict,
  Verdicts,
} from "./types";

const OUT_ROOT = path.join(process.cwd(), "foundry-out", "runs");
const FOUNDRY_DIR = path.join(process.cwd(), "pipeline", "foundry");
const LEDGER = path.join(FOUNDRY_DIR, "ledger.json");
const STYLES = path.join(FOUNDRY_DIR, "styles.json");

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".json"]);

export class FoundryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function runDir(id: string): string {
  if (!RUN_ID.test(id)) throw new FoundryError("That is not a run id.", 400);
  return path.join(OUT_ROOT, id);
}

/** Resolve a run-relative path and refuse anything that escapes the run. */
export function resolveInRun(id: string, rel: string): string {
  const dir = runDir(id);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw new FoundryError("Path is outside the run.", 400);
  if (!SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("Not a servable file.", 400);
  return abs;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

/** Write-then-rename, because the forge and the page both read these files
 *  while the other side may be writing. */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await rename(tmp, file);
}

async function readManifest(id: string): Promise<RunManifest> {
  const m = await readJson<RunManifest | null>(path.join(runDir(id), "run.json"), null);
  if (!m) throw new FoundryError(`No run called ${id}.`, 404);
  return m;
}

async function readVerdicts(id: string): Promise<Verdicts> {
  return readJson<Verdicts>(path.join(runDir(id), "verdicts.json"), {});
}

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function listRuns(): Promise<RunSummary[]> {
  let names: string[];
  try {
    names = await readdir(OUT_ROOT);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: RunSummary[] = [];
  for (const name of names) {
    if (!RUN_ID.test(name)) continue;
    const m = await readJson<RunManifest | null>(path.join(OUT_ROOT, name, "run.json"), null);
    if (!m) continue;
    const v = await readJson<Verdicts>(path.join(OUT_ROOT, name, "verdicts.json"), {});
    out.push({
      id: m.id,
      created: m.created,
      status: m.status,
      progress: m.progress,
      scenes: m.scenes.length,
      candidates: m.candidates.length,
      graded: m.candidates.filter((c) => c.status === "graded").length,
      decided: Object.keys(v).length,
      kept: Object.values(v).filter((r) => r.verdict === "keep").length,
    });
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export async function getRun(id: string): Promise<RunDetail> {
  const [run, verdicts] = await Promise.all([readManifest(id), readVerdicts(id)]);
  return { run, verdicts };
}

export async function getCatalogue(): Promise<Catalogue> {
  const [styles, ledger] = await Promise.all([
    readJson<{ styles: StyleDef[] }>(STYLES, { styles: [] }),
    readJson<{ rows: LedgerRow[] }>(LEDGER, { rows: [] }),
  ]);
  return { styles: styles.styles, ledger: ledger.rows };
}

export async function fileStat(id: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveInRun(id, rel);
  try {
    const s = await stat(abs);
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the run.", 404);
  }
}

/* ── writes ───────────────────────────────────────────────────────────────── */

export async function putVerdicts(id: string, verdicts: Verdicts): Promise<void> {
  const run = await readManifest(id);
  if (run.status === "committed") throw new FoundryError("This run is committed; its verdicts are final.", 409);
  const known = new Set(run.candidates.map((c) => c.id));
  const clean: Verdicts = {};
  for (const [cid, rec] of Object.entries(verdicts)) {
    if (!known.has(cid)) continue;
    if (rec.verdict !== "keep" && rec.verdict !== "reject") continue;
    clean[cid] = { verdict: rec.verdict, at: rec.at || new Date().toISOString(), ...(rec.note ? { note: rec.note } : {}) };
  }
  await writeJsonAtomic(path.join(runDir(id), "verdicts.json"), clean);
}

function mean(xs: (number | null | undefined)[]): number | null {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(100 * x)}%`);

/** The human-readable half of a commit: what the cull said, as a draft the
 *  knowledge write-up starts from. Distribution over totals, n on every row. */
function findingsMarkdown(run: RunManifest, verdicts: Verdicts, decided: Candidate[]): string {
  const styles = run.plan.styles;
  const mechs = run.plan.mechanisms.map((m) => m.id);
  const rows: string[] = [];
  rows.push(`# Foundry findings — ${run.id}`, "");
  rows.push(`Committed ${new Date().toISOString()}. ${run.scenes.length} scene(s), ${styles.length} style(s), ${mechs.length} mechanism(s), ${run.candidates.length} candidates, ${decided.length} decided by hand.`, "");
  rows.push("## Kept per style × mechanism", "", `| style | ${mechs.join(" | ")} | total |`, `|---|${mechs.map(() => "---").join("|")}|---|`);
  for (const s of styles) {
    const cells = mechs.map((m) => {
      const cs = decided.filter((c) => c.style === s && c.mechanism === m);
      const k = cs.filter((c) => verdicts[c.id]?.verdict === "keep").length;
      return `${k}/${cs.length}`;
    });
    const all = decided.filter((c) => c.style === s);
    const k = all.filter((c) => verdicts[c.id]?.verdict === "keep").length;
    rows.push(`| ${run.styles[s]?.name ?? s} | ${cells.join(" | ")} | ${k}/${all.length} |`);
  }
  rows.push("", "## Kept per mechanism", "");
  for (const m of mechs) {
    const cs = decided.filter((c) => c.mechanism === m);
    const k = cs.filter((c) => verdicts[c.id]?.verdict === "keep").length;
    rows.push(`- **${m}**: ${k}/${cs.length} kept`);
  }
  rows.push("", "## Does the automatic grade predict the human?", "");
  const kept = decided.filter((c) => verdicts[c.id]?.verdict === "keep");
  const rejected = decided.filter((c) => verdicts[c.id]?.verdict === "reject");
  rows.push("| verdict | n | mean craft | mean style | text veto |", "|---|---|---|---|---|");
  for (const [label, cs] of [
    ["kept", kept],
    ["rejected", rejected],
  ] as const) {
    rows.push(
      `| ${label} | ${cs.length} | ${pct(mean(cs.map((c) => c.grade?.craft?.score)))} | ${pct(mean(cs.map((c) => c.grade?.style?.score)))} | ${cs.filter((c) => c.grade?.veto?.has_text).length} |`,
    );
  }
  rows.push("", "## Which craft words survived the restyle (all graded candidates)", "");
  const fields = new Map<string, number[]>();
  for (const c of run.candidates) {
    for (const [f, v] of Object.entries(c.grade?.craft?.per_field ?? {})) {
      if (!fields.has(f)) fields.set(f, []);
      fields.get(f)!.push(v);
    }
  }
  rows.push("| field | survival | n |", "|---|---|---|");
  for (const [f, vs] of [...fields.entries()].sort((a, b) => mean(b[1])! - mean(a[1])!)) {
    rows.push(`| ${f} | ${pct(mean(vs))} | ${vs.length} |`);
  }
  const unmeasured = run.candidates.filter((c) => c.status === "unmeasured" || c.status === "failed");
  rows.push("", `Unmeasured or failed: ${unmeasured.length}${unmeasured.length ? ` (${unmeasured.map((c) => c.id).join(", ")})` : ""}.`);
  rows.push("", "_Draft. The rule this run supports goes to the ai-registry as knowledge only after a second sighting; this file is the evidence, not the claim._", "");
  return rows.join("\n");
}

/** Delete the rejected, index the decided, leave the kept untouched. */
export async function commitRun(id: string, undecidedAs: "reject" | "leave"): Promise<CommitResult> {
  const dir = runDir(id);
  const run = await readManifest(id);
  if (run.status === "committed") throw new FoundryError("This run is already committed.", 409);
  if (!["done", "failed"].includes(run.status)) throw new FoundryError("The forge is still running this run.", 409);
  const verdicts = await readVerdicts(id);
  const at = new Date().toISOString();

  // Undecided candidates that never produced a file cannot be kept or
  // rejected — they are outside the cull either way.
  const withFile = run.candidates.filter((c) => c.status !== "pending" && c.status !== "failed" && !c.deleted);
  if (undecidedAs === "reject") {
    for (const c of withFile) if (!verdicts[c.id]) verdicts[c.id] = { verdict: "reject", at };
  }
  const decided = withFile.filter((c) => verdicts[c.id]);
  const undecided = withFile.length - decided.length;

  let deleted = 0;
  for (const c of decided) {
    if (verdicts[c.id].verdict !== "reject") continue;
    for (const rel of [c.file, c.sidecar]) {
      try {
        await unlink(resolveInRun(id, rel));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    c.deleted = true;
    deleted++;
  }
  const kept = decided.length - deleted;

  // The versioned indices. Ledger rows are append-only and keyed by every
  // axis; a style's evidence list is what promotes it.
  const ledger = await readJson<{ rows: LedgerRow[] }>(LEDGER, { rows: [] });
  for (const c of decided) {
    ledger.rows.push({
      run: id,
      scene: c.scene,
      style: c.style,
      mechanism: c.mechanism,
      seed: c.seed,
      verdict: verdicts[c.id].verdict as Verdict,
      craft: c.grade?.craft?.score ?? null,
      style_score: c.grade?.style?.score ?? null,
      has_text: c.grade?.veto?.has_text ?? null,
      at,
    });
  }
  await writeJsonAtomic(LEDGER, ledger);

  const catalogue = await readJson<{ styles: StyleDef[] } & Record<string, unknown>>(STYLES, { styles: [] });
  for (const s of catalogue.styles) {
    for (const c of decided.filter((c) => c.style === s.id)) {
      s.evidence.push({ run: id, scene: c.scene, mechanism: c.mechanism, verdict: verdicts[c.id].verdict as Verdict, at });
    }
    const keptScenes = new Set(s.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`));
    if (keptScenes.size >= 2) s.status = "proven";
  }
  await writeJsonAtomic(STYLES, catalogue);

  const findings = findingsMarkdown(run, verdicts, decided);
  await writeFile(path.join(dir, "findings.md"), findings, "utf8");
  await writeJsonAtomic(path.join(dir, "verdicts.json"), verdicts);
  run.status = "committed";
  run.committed = { at, deleted, kept, undecided };
  await writeJsonAtomic(path.join(dir, "run.json"), run);

  return { deleted, kept, undecided, findings };
}
