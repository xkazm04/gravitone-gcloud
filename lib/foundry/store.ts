/// THE FOUNDRY DISK LAYER — server only.
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

import { stat } from "node:fs/promises";
import path from "node:path";

import { foundryFs } from "./fsPort";

import {
  FoundryError,
  containedIn,
  foundryFile,
  listManifests,
  readJson,
  readManifestFile,
  runRoot,
  writeJsonAtomic,
} from "./runStore";

export { FoundryError, foundryFile };

import type {
  Candidate,
  Catalogue,
  CommitResult,
  ForgeCommitPlan,
  LedgerRow,
  RunDetail,
  RunManifest,
  RunSummary,
  StyleDef,
  Verdict,
  Verdicts,
} from "./types";
import { withCatalogue } from "./catalogue";
import { planForgeCommit } from "./commitPlan";

/** Exported for the disk probe, which writes a probe-prefixed run under it. */
export const OUT_ROOT = path.join(process.cwd(), "foundry-out", "runs");

function runDir(id: string): string {
  return runRoot(OUT_ROOT, id, "run");
}

/** Resolve a run-relative path and refuse anything that escapes the run. */
export function resolveInRun(id: string, rel: string): string {
  return containedIn(runDir(id), rel, true, "run");
}

async function readManifest(id: string): Promise<RunManifest> {
  const m = await readManifestFile<RunManifest>(path.join(runDir(id), "run.json"), id, "run");
  if (m === undefined)
    throw new FoundryError(`The manifest of run ${id} is unreadable — the forge may be mid-write, or the file is damaged. Try again; if it persists, inspect foundry-out/runs/${id}/run.json.`, 503);
  if (!m) throw new FoundryError(`No run called ${id}.`, 404);
  return m;
}

async function readVerdicts(id: string): Promise<Verdicts> {
  return readJson<Verdicts>(path.join(runDir(id), "verdicts.json"), {});
}

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function listRuns(): Promise<RunSummary[]> {
  const { items } = await listManifests<RunManifest, RunSummary>(OUT_ROOT, "run.json", async (name, m) => {
    const v = await readJson<Verdicts>(path.join(OUT_ROOT, name, "verdicts.json"), {});
    return {
      id: m.id,
      created: m.created,
      status: m.status,
      progress: m.progress,
      scenes: m.scenes.length,
      candidates: m.candidates.length,
      graded: m.candidates.filter((c) => c.status === "graded").length,
      decided: Object.keys(v).length,
      kept: Object.values(v).filter((r) => r.verdict === "keep").length,
    };
  });
  return items.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export async function getRun(id: string): Promise<RunDetail> {
  const [run, verdicts] = await Promise.all([readManifest(id), readVerdicts(id)]);
  return { run, verdicts };
}

export async function getCatalogue(): Promise<Catalogue> {
  const fs = foundryFs();
  const [styles, ledger] = await Promise.all([
    fs.readJson<{ styles: StyleDef[]; _rev?: number }>(foundryFile("styles.json"), { styles: [] }),
    fs.readJson<{ rows: LedgerRow[] }>(foundryFile("ledger.json"), { rows: [] }),
  ]);
  // `_rev` is the catalogue revision (catalogue.ts); 0 for a catalogue that
  // predates it, so a client comparing revisions never compares to undefined.
  return { styles: styles.styles, ledger: ledger.rows, _rev: styles._rev ?? 0 };
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

/** Preview what a commit will do without touching the disk or indices. */
export async function previewCommit(id: string, undecidedAs: "reject" | "leave" = "reject"): Promise<ForgeCommitPlan> {
  const [run, verdicts, catalogue] = await Promise.all([
    readManifest(id),
    readVerdicts(id),
    getCatalogue(),
  ]);
  return planForgeCommit(run, verdicts, catalogue, undecidedAs);
}

/** Delete the rejected, index the decided, leave the kept untouched.
 *
 *  The whole commit is ONE catalogue transaction (catalogue.ts): the status
 *  check, the plan and its token comparison, the index writes, the deletions
 *  and the manifest all sit behind the same lock, so no second commit of this
 *  run and no other catalogue writer can land between the check and the write. */
export async function commitRun(id: string, undecidedAs: "reject" | "leave" = "reject", token?: string): Promise<CommitResult> {
  const dir = runDir(id);
  return withCatalogue({ op: "forge-commit", run: id }, async (tx) => {
    // Every disk effect below goes through the port (lib/foundry/fsPort.ts) -
    // the real fs unless a probe installed a recorder.
    const fs = foundryFs();
    const run = await readManifest(id);
    if (run.status === "committed") throw new FoundryError("This run is already committed.", 409);
    // `incomplete` belongs here for the same reason `failed` does: the run stopped
    // early with every plate it did generate on disk, and this button is the only
    // way to reach them. Keep this array and COMMITTABLE in app/foundry/parts.tsx
    // equal — tests/golden-path/commit-gate-parity.probe.spec.ts reads this one off
    // disk and fails if they drift.
    if (!["done", "incomplete", "failed"].includes(run.status)) throw new FoundryError("The forge is still running this run.", 409);
    const verdicts = await readVerdicts(id);
    // Read once, inside the lock: the plan, the token and the writes below all
    // see these same bytes.
    const ledger = await tx.read("ledger.json");
    const stylesDoc = await tx.read("styles.json");

    const plan = planForgeCommit(run, verdicts, { styles: stylesDoc.styles, ledger: ledger.rows }, undecidedAs);
    if (token !== undefined && token !== plan.token) {
      throw new FoundryError("The run state changed since the preview was generated.", 409);
    }

    const at = new Date().toISOString();

    // Undecided candidates that never produced a file cannot be kept or
    // rejected — they are outside the cull either way.
    const withFile = run.candidates.filter((c) => c.status !== "pending" && c.status !== "failed" && !c.deleted);
    if (undecidedAs === "reject") {
      for (const c of withFile) if (!verdicts[c.id]) verdicts[c.id] = { verdict: "reject", at };
    }
    const decided = withFile.filter((c) => verdicts[c.id]);
    const undecided = withFile.length - decided.length;

    // The versioned indices. A run's rows are REPLACED, not appended.
    //
    // Indices are written FIRST, before any files are unlinked. If writing
    // ledger or styles fails (e.g. disk full or styles.json is a directory),
    // no files have been deleted yet, keeping the banner "The commit failed
    // and nothing was deleted" honest. The journal line leads them both.
    await tx.begin([...new Set(decided.map((c) => c.style))]);
    ledger.rows = ledger.rows.filter((r) => r.run !== id);
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
    await tx.write("ledger.json");

    for (const s of stylesDoc.styles) {
      // Same rule for the evidence list, and it matters more: `keptScenes`
      // below dedupes by run/scene, so doubled evidence promotes nothing and
      // shows up only as a list twice its true length that no reader can
      // explain.
      s.evidence = s.evidence.filter((e) => e.run !== id);
      for (const c of decided.filter((c) => c.style === s.id)) {
        s.evidence.push({ run: id, scene: c.scene, mechanism: c.mechanism, verdict: verdicts[c.id].verdict as Verdict, at });
      }
      const keptScenes = new Set(s.evidence.filter((e) => e.verdict === "keep").map((e) => `${e.run}/${e.scene}`));
      if (keptScenes.size >= 2) s.status = "proven";
    }
    await tx.write("styles.json");

    // File deletions happen SECOND.
    let deleted = 0;
    for (const c of decided) {
      if (verdicts[c.id].verdict !== "reject") continue;
      for (const rel of [c.file, c.sidecar]) {
        try {
          await fs.unlink(resolveInRun(id, rel));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
      c.deleted = true;
      deleted++;
    }
    const kept = decided.length - deleted;

    // Manifest, verdicts and findings updated THIRD.
    const findings = findingsMarkdown(run, verdicts, decided);
    await fs.writeFile(path.join(dir, "findings.md"), findings);
    await fs.writeJsonAtomic(path.join(dir, "verdicts.json"), verdicts);
    run.status = "committed";
    run.committed = { at, deleted, kept, undecided };
    await fs.writeJsonAtomic(path.join(dir, "run.json"), run);

    return { deleted, kept, undecided, findings };
  });
}
