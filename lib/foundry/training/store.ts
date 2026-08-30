// THE DOJO DISK LAYER — server only.
//
// The training loop (on the GPU machine) writes cycles under
// foundry-out/training/<id>/{cycle.json, pairs/**}; this module is the app's
// only way to read them and the only way the human gate mutates them. Two
// files per cycle are the app's to write — verdicts.json and, on commit,
// cycle.json's status flip plus the deletions — everything else is the loop's.
//
// Cross-machine design: foundry-out/ is gitignored, so the media never syncs.
// What DOES sync — because it is git-tracked — is pipeline/foundry/
// training-ledger.json (one row per gated improvement) and training/thumbs/
// (one kept image per approved improvement). Those two are the channel between
// this checkout and the GPU machine's loop: a row with reflected:false is the
// loop's work queue, and the loop stamps the commit sha when it has reflected
// the improvement into the named prompt surface.
//
// What a COMMIT is, precisely: each APPROVED improvement's chosen thumbnail is
// copied into the tracked thumbs dir, then every media file of every DECIDED
// improvement (approved or rejected, both arms, poster included) is deleted —
// the tracked copy is the survivor. Undecided improvements keep their media.
// One ledger row per decided improvement; findings.md into the cycle dir;
// status flips to "committed" and the verdicts are final.
//
// Path safety: every cycle-relative path is resolved and checked to stay
// inside its cycle directory before it is read or unlinked. Cycle ids are
// validated against a strict slug so a crafted id cannot walk anywhere.

import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { FoundryError } from "../store";
import type {
  CycleManifest,
  Improvement,
  MediaRef,
  TrainingCommitResult,
  TrainingCycleDetail,
  TrainingCycleSummary,
  TrainingLedgerRow,
  TrainingVerdicts,
} from "./types";

const OUT_ROOT = path.join(process.cwd(), "foundry-out", "training");
const FOUNDRY_DIR = path.join(process.cwd(), "pipeline", "foundry");
const LEDGER = path.join(FOUNDRY_DIR, "training-ledger.json");
const THUMBS_DIR = path.join(FOUNDRY_DIR, "training", "thumbs");
/** Ledger `thumb` paths are repo-relative with forward slashes on every OS. */
const THUMBS_REL = "pipeline/foundry/training/thumbs";

const CYCLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
// Images and json only — a video's servable face is its poster, by design.
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json"]);

function cycleDir(id: string): string {
  if (!CYCLE_ID.test(id)) throw new FoundryError("That is not a cycle id.", 400);
  return path.join(OUT_ROOT, id);
}

/** Containment only — the commit must also unlink video files, which are
 *  deliberately not servable. Never exported; serving goes via resolveInCycle. */
function containedInCycle(id: string, rel: string): string {
  const dir = cycleDir(id);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw new FoundryError("Path is outside the cycle.", 400);
  return abs;
}

/** Resolve a cycle-relative path for serving; refuse escapes and non-images. */
export function resolveInCycle(id: string, rel: string): string {
  const abs = containedInCycle(id, rel);
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

/** Write-then-rename, because the loop and the app both read these files while
 *  the other side may be writing. Local copy of store.ts's helper (unexported). */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await rename(tmp, file);
}

async function readManifest(id: string): Promise<CycleManifest> {
  const m = await readJson<CycleManifest | null>(path.join(cycleDir(id), "cycle.json"), null);
  if (!m) throw new FoundryError(`No cycle called ${id}.`, 404);
  return m;
}

async function readTrainingVerdicts(id: string): Promise<TrainingVerdicts> {
  return readJson<TrainingVerdicts>(path.join(cycleDir(id), "verdicts.json"), {});
}

const decidedCount = (v: TrainingVerdicts) => Object.values(v).filter((x) => x === "approve" || x === "reject").length;

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function listCycles(): Promise<TrainingCycleSummary[]> {
  let names: string[];
  try {
    names = await readdir(OUT_ROOT);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: TrainingCycleSummary[] = [];
  for (const name of names) {
    if (!CYCLE_ID.test(name)) continue;
    const m = await readJson<CycleManifest | null>(path.join(OUT_ROOT, name, "cycle.json"), null);
    if (!m) continue;
    const v = await readJson<TrainingVerdicts>(path.join(OUT_ROOT, name, "verdicts.json"), {});
    out.push({
      id: m.id,
      at: m.at,
      dimension: m.dimension,
      subject: m.subject,
      status: m.status,
      media: m.media,
      improvements: m.improvements.length,
      decided: decidedCount(v),
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export async function getCycle(id: string): Promise<TrainingCycleDetail> {
  const [cycle, verdicts] = await Promise.all([readManifest(id), readTrainingVerdicts(id)]);
  return { cycle, verdicts };
}

export async function trainingFileStat(id: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveInCycle(id, rel);
  try {
    const s = await stat(abs);
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the cycle.", 404);
  }
}

/* ── writes ───────────────────────────────────────────────────────────────── */

export async function putTrainingVerdicts(id: string, verdicts: TrainingVerdicts): Promise<TrainingVerdicts> {
  const cycle = await readManifest(id);
  if (cycle.status === "committed") throw new FoundryError("This cycle is committed; its verdicts are final.", 409);
  const known = new Set(cycle.improvements.map((i) => i.id));
  const clean: TrainingVerdicts = {};
  for (const [iid, v] of Object.entries(verdicts)) {
    if (!known.has(iid)) continue;
    if (v !== "approve" && v !== "reject" && v !== null) continue;
    clean[iid] = v;
  }
  await writeJsonAtomic(path.join(cycleDir(id), "verdicts.json"), clean);
  return clean;
}

/** Fraction of an improvement's pairs where the chokepoint picked the challenger. */
function judgePickRate(imp: Improvement): number {
  if (!imp.pairs.length) return 0;
  return imp.pairs.filter((p) => p.judge_pick === "challenger").length / imp.pairs.length;
}

/** Fraction of Gemini-judged pairs where Gemini agreed with the chokepoint;
 *  undefined when Gemini judged none. */
function geminiAgreement(imp: Improvement): number | undefined {
  const judged = imp.pairs.filter((p) => p.gemini_pick !== undefined);
  if (!judged.length) return undefined;
  return judged.filter((p) => p.gemini_pick === p.judge_pick).length / judged.length;
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** The human-readable half of a commit: per improvement, the human verdict
 *  beside the automatic judge's pick rate — the calibration record. */
function findingsMarkdown(cycle: CycleManifest, verdicts: TrainingVerdicts, decided: Improvement[]): string {
  const rows: string[] = [];
  rows.push(`# Dojo findings — ${cycle.id}`, "");
  rows.push(
    `Committed ${new Date().toISOString()}. Dimension **${cycle.dimension}**, subject **${cycle.subject}**, ${cycle.improvements.length} improvement(s), ${decided.length} decided by hand.`,
    "",
  );
  rows.push("## Human vs judge, per improvement", "");
  for (const imp of decided) {
    const gem = geminiAgreement(imp);
    rows.push(
      `- **${imp.technique}** (${imp.id}): human ${verdicts[imp.id] === "approve" ? "approved" : "rejected"}, judge picked the challenger on ${pct(judgePickRate(imp))} of ${imp.pairs.length} pair(s)${gem !== undefined ? `, gemini agreed with the judge on ${pct(gem)}` : ""}.`,
    );
  }
  const undecided = cycle.improvements.filter((i) => !decided.includes(i));
  rows.push("", `Undecided (media kept): ${undecided.length}${undecided.length ? ` (${undecided.map((i) => i.id).join(", ")})` : ""}.`);
  rows.push("", "_The ledger row is the finding; the thumbs are the evidence that syncs._", "");
  return rows.join("\n");
}

/** Every file a MediaRef owns: the file itself and, for video, its poster. */
function mediaFiles(ref: MediaRef): string[] {
  return ref.poster ? [ref.file, ref.poster] : [ref.file];
}

/** Copy the approved keepers into git, delete the decided media, append the
 *  ledger rows. DESTRUCTIVE and one-way — undecided improvements are the only
 *  ones whose media survives on this machine. */
export async function commitCycle(id: string): Promise<TrainingCommitResult> {
  const dir = cycleDir(id);
  const cycle = await readManifest(id);
  if (cycle.status === "committed") throw new FoundryError("This cycle is already committed.", 409);
  if (!["awaiting-gate", "failed"].includes(cycle.status)) throw new FoundryError("The loop is still running this cycle.", 409);
  const verdicts = await readTrainingVerdicts(id);
  const at = new Date().toISOString();

  const decided = cycle.improvements.filter((i) => verdicts[i.id] === "approve" || verdicts[i.id] === "reject");

  // Keepers first: the tracked copy must exist before the source is unlinked.
  await mkdir(THUMBS_DIR, { recursive: true });
  const thumbs: string[] = [];
  const trackedThumb = new Map<string, string>();
  for (const imp of decided) {
    if (verdicts[imp.id] !== "approve" || !imp.thumbnail) continue;
    const src = resolveInCycle(id, imp.thumbnail);
    const rel = `${THUMBS_REL}/${id}--${imp.id}${path.extname(imp.thumbnail).toLowerCase()}`;
    await copyFile(src, path.join(process.cwd(), rel));
    trackedThumb.set(imp.id, rel);
    thumbs.push(rel);
  }

  // Then the cull: both arms of every pair of every decided improvement,
  // poster included, thumbnail source included — the tracked copy survives.
  let deleted = 0;
  for (const imp of decided) {
    for (const pair of imp.pairs) {
      for (const ref of [pair.baseline, pair.challenger]) {
        if (ref.deleted) continue;
        for (const rel of mediaFiles(ref)) {
          try {
            await unlink(containedInCycle(id, rel));
            deleted++;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
          }
        }
        ref.deleted = true;
      }
    }
  }

  // The versioned index — the sync channel. Append-only, one row per decided
  // improvement; reflected:false marks it as the loop's pending work.
  const ledger = await readJson<{ rows: TrainingLedgerRow[] }>(LEDGER, { rows: [] });
  for (const imp of decided) {
    const human = verdicts[imp.id] as "approve" | "reject";
    const gem = geminiAgreement(imp);
    ledger.rows.push({
      cycle: id,
      dimension: cycle.dimension,
      subject: cycle.subject,
      technique: imp.technique,
      human,
      verdict: human === "approve" ? "better" : "not-better",
      judge_pick_rate: judgePickRate(imp),
      ...(gem !== undefined ? { gemini_agreement: gem } : {}),
      ...(trackedThumb.has(imp.id) ? { thumb: trackedThumb.get(imp.id) } : {}),
      reflected: false,
      at,
    });
  }
  await writeJsonAtomic(LEDGER, ledger);

  await writeFile(path.join(dir, "findings.md"), findingsMarkdown(cycle, verdicts, decided), "utf8");
  cycle.status = "committed";
  cycle.log.push({ at, msg: `committed: ${decided.length} decided, ${deleted} files deleted, ${thumbs.length} thumb(s) kept` });
  await writeJsonAtomic(path.join(dir, "cycle.json"), cycle);

  return { deleted, thumbs, ledger_rows: decided.length };
}
