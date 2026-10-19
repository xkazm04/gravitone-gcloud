import "server-only";

import { stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Calibration as KernelCalibration, Grade } from "@gt/domain/candidate";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import { SOURCES } from "@gt/domain/source";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { InitialDecision } from "@gt/kernel/decision/driver";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { decodeNote, encodeNote } from "../note.ts";
import { seriesKey, type FieldCalibration, type GradeField, type GraderCalibrationFile } from "../../../foundry/calibration.ts";
import { planForgeCommit } from "../../../foundry/commitPlan.ts";
import { foundryFs } from "../../../foundry/fsPort.ts";
import { COMMITTABLE } from "../../../foundry/plant.ts";
import { foundryFile } from "../../../foundry/runStore.ts";
import { commitRun, getCatalogue, getRun, OUT_ROOT, patchVerdicts, previewCommit, resolveInRun } from "../../../foundry/store.ts";
import type { Candidate, Catalogue, RunManifest, VerdictRecord, Verdicts } from "../../../foundry/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import {
  buildConsequence,
  byOf,
  candidateOf,
  committedOutcome,
  decisionMap,
  foundryFileUrl,
  fromV1,
  instantOr,
  mediaRefs,
  mintPacket,
  runIdOf,
  v1By,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// THE FORGE CULL AS A PACKET - foundry-out/runs/<id>/ (pipeline/foundry/
// forge.py) read through lib/foundry/store.ts, decided as a matrix cull, and
// committed back through v1's own `patchVerdicts` then `commitRun`.
//
// Absorbed from v1:
//   · the judgeable set is the Board's cull (lib/board/sources/cull.ts READY:
//     graded, unmeasured, generated, not deleted) - the same plates the
//     projection counts on the Weir (lib/ledger/v1/sources/forge.ts);
//   · reasons ride in the note's leading `reasons: a, b` line
//     (../note.ts encodeNote / decodeNote, v1 lib/board/verdicts.ts), read back as the
//     packet's reasons; a word that is not a forge reason stays in the note,
//     disclosed as a loss, because the kernel's door refuses it;
//   · the blast radius is planForgeCommit - the same pure planner commitRun
//     runs inside its catalogue transaction - so preview equals commit;
//   · `proven` stays a human's claim (commitPlan.ts humanKeep): a model's keep
//     is imported `by: agent` and written back `by: model`.
// Upgraded:
//   · v1's preview token was the verdict revision; the v1 digest here covers
//     v1's own plan token AND every plate's content address, so a plate
//     re-rendered under an unchanged map refuses the commit too;
//   · grades carry the calibration v1 measured for their grader series
//     (pipeline/foundry/grader-calibration.json, lib/foundry/calibration.ts):
//     an inverted craft score is a Grade marked `inverted`, never a bare number.
//     The file is still this packet's READ side. Its WRITE side now also lands
//     in the kernel's calibration series: commitRun registers each plate's
//     grades (lib/foundry/calibrationRegister.ts, keyed by this packet's
//     decision keys, series = seriesKey) in the commit's own transaction. The
//     Board's reader moves to that series in a later stage; until then this
//     read of grader-calibration.json is the only reader that uses the file.
// Dropped, with the reason: v1's `undecidedAs: "reject"` sweep. The kernel
// refuses a commit while anything is undecided (decision 5), so every plate
// in the packet is decided; a plate whose file vanished is not in the packet
// and is committed `leave` - untouched - rather than rejected unseen.

/** The Board's cull set (lib/board/sources/cull.ts READY). */
const READY: ReadonlySet<Candidate["status"]> = new Set<Candidate["status"]>(["graded", "unmeasured", "generated"]);
const COMMIT_MODE = "leave" as const;
const SPEC = SOURCES.forge;

export type ForgeV1 = {
  readonly run: RunManifest;
  readonly verdicts: Verdicts;
  /** The verdict map's revision (verdictLog.ts): the base of apply's patch. */
  readonly rev: number;
  readonly catalogue: Pick<Catalogue, "styles" | "ledger">;
  /** pipeline/foundry/grader-calibration.json, or null before the first commit wrote it. */
  readonly calibration: GraderCalibrationFile | null;
  /** By candidate id: the plate's content address. A judgeable plate absent here has no file. */
  readonly media: Readonly<Record<string, BlobRef>>;
  /** When v1 last wrote the verdict map: the instant of an imported verdict whose own is unreadable. */
  readonly verdictsAt: string;
};

const judgeable = (run: RunManifest): Candidate[] => run.candidates.filter((c) => !c.deleted && READY.has(c.status));

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<ForgeV1>> {
  const id = ref.runId;
  const detail = await v1Call(() => getRun(id));
  if (!detail.ok) return detail;
  const catalogue = await v1Call(() => getCatalogue());
  if (!catalogue.ok) return catalogue;
  const calibration = await v1Call(() => foundryFs().readJson<GraderCalibrationFile | null>(foundryFile("grader-calibration.json"), null));
  if (!calibration.ok) return calibration;
  const { run, verdicts, rev } = detail.value;
  const files: { key: string; abs: string }[] = [];
  for (const c of judgeable(run)) {
    try {
      files.push({ key: c.id, abs: resolveInRun(id, c.file) });
    } catch (e) {
      return fromV1(e);
    }
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  const verdictsAt = await stat(path.join(OUT_ROOT, id, "verdicts.json")).then(
    (s) => s.mtime.toISOString(),
    () => instantOr(run.finished, instantOr(run.created, new Date(0).toISOString()).at).at,
  );
  return ok({ run, verdicts, rev: rev ?? 0, catalogue: { styles: catalogue.value.styles, ledger: catalogue.value.ledger }, calibration: calibration.value, media: Object.fromEntries(media.value), verdictsAt });
}

/* ── v1 verdict <-> kernel decision ────────────────────────────────────────── */

type Imported = { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string; readonly lost: readonly string[]; readonly cut: boolean };

/**
 * One v1 record as the kernel's door takes it. Reasons only on a reject and
 * only from the forge list (in list order); any other word in the reasons line
 * goes back into the note as written, so nothing the operator typed is lost.
 * The same function decides, at apply, whether the kernel's decision still IS
 * the imported one - in which case v1's record is left byte-identical.
 */
export function importVerdict(rec: VerdictRecord): Imported {
  const { reasons, note } = decodeNote(rec.note);
  const known: readonly string[] = rec.verdict === "reject" ? SPEC.reasons.filter((r) => reasons.includes(r)) : [];
  const lost = reasons.filter((r) => !known.includes(r));
  const text = [lost.length > 0 ? `reasons: ${lost.join(", ")}` : "", note ?? ""].filter((s) => s.trim() !== "").join("\n");
  const cut = text.length > SPEC.noteMax;
  const kept = cut ? `${text.slice(0, SPEC.noteMax - 1)}…` : text;
  return { verdict: rec.verdict, reasons: known, ...(kept === "" ? {} : { note: kept }), lost, cut };
}

const sameDecision = (a: { verdict: string | null; reasons: readonly string[]; note?: string }, b: { verdict: string | null; reasons: readonly string[]; note?: string }): boolean =>
  a.verdict === b.verdict && a.reasons.join("\u0000") === b.reasons.join("\u0000") && (a.note ?? "") === (b.note ?? "");

/** The v1 record a kernel decision writes: reasons back into the note's leading line. */
function recordOf(d: Decision): VerdictRecord {
  const note = encodeNote(d.verdict === "reject" ? d.reasons : [], d.note ?? null);
  return { verdict: d.verdict === "keep" ? "keep" : "reject", at: d.at, ...(note === undefined ? {} : { note }), by: v1By(d.by) };
}

/* ── grades ────────────────────────────────────────────────────────────────── */

const FIELDS: readonly { readonly field: GradeField; readonly value: (c: Candidate) => number | null }[] = [
  { field: "craft", value: (c) => c.grade?.craft?.score ?? null },
  { field: "style_score", value: (c) => c.grade?.style?.score ?? null },
  { field: "has_text", value: (c) => (c.grade?.veto ? (c.grade.veto.has_text ? 1 : 0) : null) },
];

/** v1's measured calibration for one field, by its own reader's rule (calibration.ts fieldStatus:
 *  the mechanism's bucket when it is measured, the pooled one otherwise). */
function calibrationOf(file: GraderCalibrationFile | null, series: string, field: GradeField, mechanism: string): KernelCalibration {
  const cal = file?.series[series];
  const own: FieldCalibration | undefined = cal?.fields[field]?.by_mechanism[mechanism];
  const fc = own !== undefined && own.status !== "insufficient" ? own : cal?.fields[field]?.all;
  if (fc === undefined) return { status: "insufficient", short: "floor", nKeep: 0, nReject: 0 };
  if (fc.status === "insufficient" || fc.auc === null || fc.ci === null) return { status: "insufficient", short: fc.short ?? "floor", nKeep: fc.n_keep, nReject: fc.n_reject };
  return { status: fc.status, auc: fc.auc, ci: [fc.ci[0], fc.ci[1]], nKeep: fc.n_keep, nReject: fc.n_reject };
}

export function gradesOf(c: Candidate, file: GraderCalibrationFile | null): Grade[] {
  if (c.grade === null) return [];
  const series = seriesKey(c.grade);
  const out: Grade[] = [];
  for (const f of FIELDS) {
    const value = f.value(c);
    if (value === null) continue;
    out.push({ field: f.field, value, series, calibration: calibrationOf(file, series, f.field, c.mechanism) });
  }
  return out;
}

/* ── packet ────────────────────────────────────────────────────────────────── */

function refusal(run: RunManifest): string | undefined {
  // v1's own sentences (lib/foundry/store.ts commitRun).
  if (run.status === "committed") return "This run is already committed.";
  if (!COMMITTABLE.includes(run.status)) return "The forge is still running this run.";
  return undefined;
}

function packet(v1: ForgeV1): Result<OpenPlan> {
  const { run } = v1;
  const no = refusal(run);
  if (no !== undefined) return err("refused", `forge run ${run.id}: ${no}`);
  const losses: Loss[] = [];
  const plates = judgeable(run).filter((c) => {
    if (v1.media[c.id] !== undefined) return true;
    losses.push({ candidate: c.id, grade: "dropped", reason: `${c.file} is not on disk; the plate cannot be judged and its commit leaves it untouched` });
    return false;
  });
  if (plates.length === 0) return err("refused", `forge run ${run.id} has no plate on disk to judge`);
  const jobId = `forge:${run.id}`;
  const minted = mintPacket({
    id: packetIdOf("forge", run.id),
    lane: "image",
    source: "forge",
    mode: "matrix-cull",
    state: "open",
    runId: run.id,
    title: `forge ${run.id}`,
    items: plates.map((c) => ({ id: c.id, jobId, media: v1.media[c.id], row: c.scene, grades: gradesOf(c, v1.calibration) })),
  });
  if (!minted.ok) return minted;

  const initial: InitialDecision[] = [];
  for (const c of plates) {
    const rec = v1.verdicts[c.id];
    if (rec === undefined || (rec.verdict !== "keep" && rec.verdict !== "reject")) continue;
    const imp = importVerdict(rec);
    const when = instantOr(rec.at, v1.verdictsAt);
    if (imp.lost.length > 0) losses.push({ candidate: c.id, grade: "approximate", reason: `v1 reason(s) ${imp.lost.join(", ")} are not forge reasons; kept in the note` });
    if (imp.cut) losses.push({ candidate: c.id, grade: "approximate", reason: `v1's note is longer than ${SPEC.noteMax} characters; the packet holds it cut, v1 keeps it whole` });
    if (!when.exact) losses.push({ candidate: c.id, grade: "approximate", reason: `v1 recorded no readable instant (${JSON.stringify(rec.at)}); the verdict map's write time stands in` });
    initial.push({ candidate: c.id, verdict: imp.verdict, reasons: imp.reasons, ...(imp.note === undefined ? {} : { note: imp.note }), by: byOf(rec.by), surface: "v1", at: when.at });
  }

  const scenes = new Set(plates.map((c) => c.scene));
  const rows: RowWords[] = run.scenes
    .filter((s) => scenes.has(s.id))
    .map((s) => ({ id: s.id, label: (s.note ?? "").trim() !== "" ? s.note : s.frame || s.id, ...(s.source ? { ref: foundryFileUrl(run.id, s.source) } : {}) }));
  const items: Record<string, ItemWords> = {};
  const urls: Record<string, string> = {};
  for (const c of plates) {
    items[c.id] = { label: `${run.styles[c.style]?.name ?? c.style} · ${c.mechanism}`, meta: `seed ${c.seed}${c.status === "unmeasured" ? " · unmeasured" : ""}`, ...(c.prompt ? { prompt: c.prompt } : {}) };
    urls[c.id] = foundryFileUrl(run.id, c.file);
  }
  const unmeasured = plates.filter((c) => c.status === "unmeasured").length;
  const failed = run.candidates.filter((c) => c.status === "failed").length;
  return ok({
    packet: minted.value,
    initial,
    present: {
      items,
      rows,
      oracle: { passed: failed === 0 && unmeasured === 0, summary: `${plates.length} plates · ${unmeasured} unmeasured · ${failed} failed` },
      meta: `forge · ${run.plan.scenes.length} scenes × ${run.plan.styles.length} styles × ${run.plan.mechanisms.length} mechanisms · ${run.id}`,
    },
    urls,
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

/** The map commitRun will read once apply has patched it: v1's own records off the packet, the kernel's on it. */
function effectiveVerdicts(v1: ForgeV1, at: DecisionsAt, items: ReadonlySet<string>): Verdicts {
  const out: Verdicts = {};
  for (const [k, rec] of Object.entries(v1.verdicts)) if (!items.has(k)) out[k] = rec;
  for (const d of decisionMap(at.decisions).values()) {
    const id = candidateOf(d);
    if (items.has(id) && d.verdict !== null) out[id] = recordOf(d);
  }
  return out;
}

/** The digest of the v1 state a preview planned from: v1's own plan token over v1's own map, and every plate's address. */
function digestOf(v1: ForgeV1): string {
  const own = planForgeCommit(v1.run, v1.verdicts, v1.catalogue, COMMIT_MODE);
  return v1DigestOf({ source: "forge", run: v1.run.id, token: own.token, media: Object.entries(v1.media).map(([k, b]) => [k, b.sha256]).sort() });
}

function consequence(v1: ForgeV1, at: DecisionsAt): Result<Preview> {
  const no = refusal(v1.run);
  if (no !== undefined) return err("refused", `forge run ${v1.run.id}: ${no}`);
  const items = judgeable(v1.run).filter((c) => v1.media[c.id] !== undefined);
  const ids = new Set(items.map((c) => c.id));
  const plan = planForgeCommit(v1.run, effectiveVerdicts(v1, at, ids), v1.catalogue, COMMIT_MODE);
  const byFile = new Map(v1.run.candidates.flatMap((c) => [[c.file, c.id], [c.sidecar, c.id]] as const));
  const runRel = (rel: string) => `foundry-out/runs/${v1.run.id}/${rel}`;
  const v1Digest = digestOf(v1);
  return ok({
    v1Digest,
    consequence: buildConsequence(at, [...ids], {
      deletes: plan.delete.map((rel) => {
        const candidate = byFile.get(rel);
        return { target: runRel(rel), ...(candidate === undefined ? {} : { candidate }), detail: "rejected plate" };
      }),
      writes: [
        ...plan.ledgerRows.map((r) => ({
          kind: "index-row" as const,
          target: "pipeline/foundry/ledger.json",
          candidate: v1.run.candidates.find((c) => c.scene === r.scene && c.style === r.style && c.mechanism === r.mechanism && c.seed === r.seed)?.id ?? `${r.scene}/${r.style}--${r.mechanism}--s${r.seed}`,
          detail: `${r.verdict} · ${r.style} × ${r.mechanism}`,
        })),
        ...Object.entries(plan.evidence)
          .filter(([, ev]) => ev.length > 0)
          .map(([style, ev]) => ({ kind: "index-row" as const, target: "pipeline/foundry/styles.json", detail: `${style}: ${ev.length} evidence row(s) from this run` })),
        { kind: "file" as const, target: "pipeline/foundry/grader-calibration.json", detail: "recomputed from the ledger" },
        { kind: "file" as const, target: runRel("findings.md") },
        { kind: "file" as const, target: runRel("verdicts.json") },
        { kind: "file" as const, target: runRel("run.json"), detail: "status committed" },
      ],
      promotions: plan.promotions.map((s) => ({ target: s, detail: `${v1.catalogue.styles.find((x) => x.id === s)?.name ?? s} becomes proven: kept by a human on two scenes` })),
    }, v1Digest),
  });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const id = runId.value;
  const fresh = await v1Call(() => getRun(id));
  if (!fresh.ok) return fresh;
  const { run, verdicts } = fresh.value;
  const items = new Set<string>(claim.packet.items.map((c) => c.id));
  const final = [...decisionMap(claim.decisions).values()].filter((d) => items.has(candidateOf(d)));
  const cand = candidateOf;

  if (run.status === "committed") {
    // A second delivery of this outcome finds it done; v1 holding ANOTHER outcome is a refusal.
    const differ = final.filter((d) => d.verdict !== null && verdicts[cand(d)]?.verdict !== d.verdict);
    if (differ.length === 0) return ok(undefined);
    return err("refused", `forge run ${id} was committed in v1 with other verdicts: ${differ.map((d) => `${cand(d)} is ${verdicts[cand(d)]?.verdict ?? "undecided"} in v1, ${d.verdict} here`).join("; ")}`);
  }

  const set: Record<string, VerdictRecord> = {};
  const clear: string[] = [];
  for (const d of final) {
    const c = cand(d);
    const current = verdicts[c];
    if (d.verdict === null) {
      if (current !== undefined) clear.push(c);
      continue;
    }
    // The operator left the imported verdict as it was: v1's record stays byte-identical.
    if (current !== undefined && sameDecision(importVerdict(current), d)) continue;
    set[c] = recordOf(d);
  }
  if (Object.keys(set).length > 0 || clear.length > 0) {
    const patched = await v1Call(() => patchVerdicts(id, { set, clear, baseRev: fresh.value.rev ?? 0, by: "human", surface: "board" }));
    if (!patched.ok) return patched;
  }
  const plan = await v1Call(() => previewCommit(id, COMMIT_MODE));
  if (!plan.ok) return plan;
  const committed = await v1Call(() => commitRun(id, COMMIT_MODE, plan.value.token));
  return committed.ok ? ok(undefined) : committed;
}

export const forgeAdapter: DecisionAdapter<ForgeV1> = { source: "forge", read, packet, consequence, apply };
