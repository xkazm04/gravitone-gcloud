import "server-only";

import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import { readMeasure } from "@gt/kernel/library/measures";
import { briefCheck, briefWords, type BriefMeasured } from "@gt/ui/components/audio/brief.ts";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { kernel } from "../../../kernelStore.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { verdictRow } from "../../../sound/ledger.ts";
import { filePathAbs, ledgerPath, readTakes, SoundError, withStore } from "../../../sound/store.ts";
import { patchTakeTx } from "../../../sound/takes.ts";
import { takeFileHref } from "../../../sound/takeHref.ts";
import { judgingOrder } from "../../../sound/triageOrder.ts";
import { DEFECTS, type DefectCode, type SoundTake, type TakePatch } from "../../../sound/types.ts";
import {
  buildConsequence,
  candidateOf,
  committedOutcome,
  decisionMap,
  mediaRefs,
  mintPacket,
  runIdOf,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// AUDIO TRIAGE AS A PACKET - the Sound lab's unjudged takes (<sound store>/
// takes.json, lib/sound/store.ts), decided as a matrix cull with a row per kind,
// and written back through v1's own `patchTakeTx` under the sound store's lock.
//
// Absorbed from v1 (app/playground/triage):
//   · the pile is model.ts's judging queue: unjudged, not a fixture (a fixture's
//     verdict is nobody's and the ledger refuses it), split by kind;
//   · a keep writes `{verdict: kept, reasons: [], note: null}` and a reject
//     `{verdict: rejected, reasons, note}` - Judge.tsx's exact two patches - so
//     applyRules puts a kept take on Arrangement at `pending` and syncVerdict
//     upserts its row in the ledger, inside the same store transaction;
//   · reasons are DEFECTS (lib/sound/types.ts), keys 1-9 0 - in v1's order.
// Upgraded:
//   · one store transaction for the whole pile. v1 wrote take by take, so a
//     crash mid-batch left half a verdict set; here every take of the packet
//     lands (with its ledger row) or none does;
//   · the preview names the ledger rows syncVerdict will write - the rows that
//     travel in git to every machine - before they are written;
//   · v1 holding a DIFFERENT verdict on a take (the Library judged it since) is
//     refused, never overwritten (hitl-approval resume-after-decision).
// Dropped: the rubric (ratings). v1's Judge scored melody/sound per key; the
//   Board's cull has no rubric (a decision carries verdict, reasons and note -
//   @gt/domain decision.ts), so a take judged here enters the ledger with the
//   ratings v1 already holds. Phase 6 (L66) scores it on the audio desk after the
//   verdict (/audio?s=rubric, lib/sound/rubric.ts), on the same ledger row.
//
// BRIEF VS MEASURED (Phase 6, L66; v1 Judge.tsx's right column). Each tile says
// what its take missed of its brief - tempo, key, length, @gt/ui brief.ts - from
// the ingest measure of the SAME bytes the tile plays (kernel audio_measures by
// the media's sha, lib/sound/measureRun.ts), else what v1 measured on the take.
// A verdict made with the miss in view is evidence about the prompt, not only
// about taste. A measure store that will not open is a disclosed loss, never a
// packet that will not open.
//
// THE PILE IS AN AGGREGATE, so its id carries a generation. v1 has no run here:
// the Floor's pile is `audio/triage`, and a packet id that never changes cannot
// be opened again once committed (the kernel refuses other content under a
// committed id). The generation is a CUTOFF - the newest pending take's
// createdAt, epoch ms - and the pile is "unjudged and created at or before the
// cutoff", so takes that arrive while the packet is open wait for the next
// generation instead of changing an open packet under the operator.

/* ── the aggregate pile's generation (shared with ./suno.ts and ./mv.ts) ───── */

export type Pile = { readonly base: string; readonly cutoff: number | undefined };

/** `<base>` (the current generation) or `<base>/<cutoff ms>`. */
export function parsePile(base: string, runId: string): Result<Pile> {
  if (runId === base) return ok({ base, cutoff: undefined });
  const m = runId.startsWith(`${base}/`) ? /^\d{1,15}$/.exec(runId.slice(base.length + 1)) : null;
  if (m === null) return err("invalid", `${JSON.stringify(runId)} is not a ${base} pile (${base} or ${base}/<cutoff ms>)`);
  return ok({ base, cutoff: Number(m[0]) });
}

/** The pile's run id: its base and the cutoff that fixes its membership. */
export const pileRunId = (base: string, cutoff: number): string => `${base}/${cutoff}`;

/** The cutoff a pile reads at: the one it names, else the newest pending item's instant. */
export function cutoffOf(pile: Pile, pendingAt: readonly number[]): number | undefined {
  if (pile.cutoff !== undefined) return pile.cutoff;
  return pendingAt.length === 0 ? undefined : Math.max(...pendingAt);
}

/* ── read ──────────────────────────────────────────────────────────────────── */

export const AUDIO_PILE = "audio/triage";

export type AudioV1 = {
  readonly runId: string;
  readonly cutoff: number;
  /** Every take in the store (v1 reads takes.json whole; a commit may name one the Library judged since). */
  readonly takes: readonly SoundTake[];
  /** The pile's takes with bytes on disk, by take id. */
  readonly media: ReadonlyMap<string, BlobRef>;
  /** Where syncVerdict writes, as the operator recognises it. */
  readonly ledger: string;
  /** What each pile take's bytes measured, by take id: the ingest measure, else v1's on the take. */
  readonly measures: ReadonlyMap<string, BriefMeasured>;
  /** Why the ingest measures could not be read, when they could not. */
  readonly measureError?: string;
};

const createdMs = (t: Pick<SoundTake, "createdAt">): number => Date.parse(t.createdAt);
const pending = (t: SoundTake): boolean => t.verdict === "unjudged" && t.origin !== "fixture";

/** The pile at a cutoff: v1's judging queue (lib/sound/triageOrder.ts - agents first, then oldest),
 *  bounded by the generation. */
function pileOf(v1: Pick<AudioV1, "takes" | "cutoff">): SoundTake[] {
  return judgingOrder(v1.takes.filter((t) => createdMs(t) <= v1.cutoff));
}

/** The ledger as the operator knows it: repo-relative (pipeline/sound/ledger.json), else the path itself. */
function ledgerName(abs: string): string {
  const rel = path.relative(process.cwd(), abs);
  return rel.startsWith("..") || path.isAbsolute(rel) ? abs : rel.split(path.sep).join("/");
}

async function read(ref: AdapterRef): Promise<Result<AudioV1>> {
  const pile = parsePile(AUDIO_PILE, ref.runId);
  if (!pile.ok) return pile;
  const store = await v1Call(() => readTakes());
  if (!store.ok) return store;
  const takes = store.value.takes;
  const cutoff = cutoffOf(pile.value, takes.filter(pending).map(createdMs));
  if (cutoff === undefined) return err("not-found", "no unjudged take is waiting in the sound store");
  const files: { key: string; abs: string }[] = [];
  for (const t of pileOf({ takes, cutoff })) {
    if (t.file === null) continue;
    const abs = await v1Call(async () => filePathAbs(t.file?.path ?? ""));
    if (abs.ok) files.push({ key: t.id, abs: abs.value });
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  const measured = measuresOf(pileOf({ takes, cutoff }), media.value);
  return ok({ runId: pileRunId(AUDIO_PILE, cutoff), cutoff, takes, media: media.value, ledger: ledgerName(ledgerPath()), ...measured });
}

/** The pile's measures: the kernel's row for the bytes, else the take's own `measured`. */
function measuresOf(pile: readonly SoundTake[], media: ReadonlyMap<string, BlobRef>): Pick<AudioV1, "measures" | "measureError"> {
  const own = (t: SoundTake): BriefMeasured | null => (t.measured === null ? null : { tempoBpm: t.measured.tempoBpm, key: t.measured.key, durationS: t.measured.durationS });
  const k = kernel();
  const rows = k.ok
    ? k.value.store.read((r) => new Map(pile.flatMap((t) => {
        const sha = media.get(t.id)?.sha256;
        const m = sha === undefined ? null : readMeasure(r, sha);
        return m === null || m.error !== null ? [] : [[t.id, m] as const];
      })))
    : k;
  const out = new Map<string, BriefMeasured>();
  for (const t of pile) {
    const m = rows.ok ? rows.value.get(t.id) : undefined;
    const base = own(t);
    const v = m === undefined ? base : { tempoBpm: m.tempoBpm ?? base?.tempoBpm ?? null, key: m.key ?? base?.key ?? null, durationS: m.durationS ?? base?.durationS ?? null };
    if (v !== null) out.set(t.id, v);
  }
  return rows.ok ? { measures: out } : { measures: out, measureError: rows.error.message };
}

/* ── packet ────────────────────────────────────────────────────────────────── */

const seconds = (s: number | null): string => (s === null ? "" : ` · ${Math.round(s)} s`);

function words(t: SoundTake, measured: BriefMeasured | undefined): ItemWords {
  const missed = briefWords(briefCheck(t.kind, { tempoBpm: t.tempoBpm, key: t.key, durationS: t.durationS }, measured ?? null));
  return {
    label: t.title,
    meta: `${t.provider} · ${t.op}${seconds(measured?.durationS ?? t.durationS)}${missed === null ? "" : ` · ${missed}`}`,
    ...(t.prompt === "" ? {} : { prompt: t.prompt }),
    ...(t.peaks === null ? {} : { peaks: t.peaks }),
    music: t.kind === "music",
  };
}

function packet(v1: AudioV1): Result<OpenPlan> {
  const losses: Loss[] = [];
  const judgeable: SoundTake[] = [];
  for (const t of pileOf(v1)) {
    if (v1.media.has(t.id)) judgeable.push(t);
    else losses.push({ candidate: t.id, grade: "dropped", reason: t.file === null ? "the take has no file to listen to; it stays unjudged in the Sound lab" : `${t.file.path} is not on disk; the take stays unjudged in the Sound lab` });
  }
  if (judgeable.length === 0) return err("not-found", `no unjudged take with a file is waiting at or before ${new Date(v1.cutoff).toISOString()}`);
  if (v1.measureError !== undefined) losses.push({ grade: "approximate", reason: `brief vs measured reads the takes' own measures only: ${v1.measureError}` });
  const minted = mintPacket({
    id: packetIdOf("audio", v1.runId),
    lane: "audio",
    source: "audio",
    mode: "matrix-cull",
    state: "open",
    runId: v1.runId,
    title: `${judgeable.length} take${judgeable.length === 1 ? "" : "s"} to judge`,
    // A lab take is its own job record in v1 (no queue job behind an ElevenLabs render).
    items: judgeable.map((t) => ({ id: t.id, jobId: t.huntId ?? t.id, media: v1.media.get(t.id), row: t.kind, grades: [] })),
  });
  if (!minted.ok) return minted;
  const kinds = (["music", "sfx"] as const).filter((k) => judgeable.some((t) => t.kind === k));
  const rows: RowWords[] = kinds.map((k) => ({ id: k, label: k }));
  return ok({
    packet: minted.value,
    // The pile is the UNJUDGED takes: v1 holds no verdict on any of them to import.
    initial: [],
    present: { items: Object.fromEntries(judgeable.map((t) => [t.id, words(t, v1.measures.get(t.id))])), rows, meta: "Sound lab triage" },
    urls: Object.fromEntries(judgeable.map((t) => [t.id, takeFileHref(t.id)])),
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

/** Judge.tsx's two patches, from the kernel's decision. */
function patchOf(d: Pick<Decision, "verdict" | "reasons" | "note">): TakePatch | undefined {
  if (d.verdict === "keep") return { verdict: "kept", reasons: [], note: null };
  if (d.verdict === "reject") return { verdict: "rejected", reasons: d.reasons.filter(isDefect), note: d.note ?? null };
  return undefined;
}

const DEFECT_SET: ReadonlySet<string> = new Set<string>(DEFECTS);
/** The kernel's door already held a reason to the audio list (@gt/domain/source); this narrows the word to v1's type. */
function isDefect(r: string): r is DefectCode {
  return DEFECT_SET.has(r);
}

/** The take v1 holds already carries this patch's verdict, reasons and note. */
function holds(t: SoundTake, p: TakePatch): boolean {
  return t.verdict === p.verdict && (t.note ?? null) === (p.note ?? null) && [...t.reasons].sort().join(",") === [...(p.reasons ?? [])].sort().join(",");
}

function consequence(v1: AudioV1, at: DecisionsAt): Result<Preview> {
  const byId = new Map(v1.takes.map((t) => [t.id, t]));
  const items = new Set(pileOf(v1).filter((t) => v1.media.has(t.id)).map((t) => t.id));
  const writes: Preview["consequence"]["writes"][number][] = [];
  const promotions: { target: string; candidate: string; detail: string }[] = [];
  const read: unknown[] = [];
  for (const [id, d] of decisionMap(at.decisions)) {
    items.add(id);
    const t = byId.get(id);
    if (t === undefined) return err("conflict", `take ${id} is no longer in the sound store`);
    read.push({ id, verdict: t.verdict, reasons: t.reasons, note: t.note, judgedAt: t.judgedAt, sha: v1.media.get(id)?.sha256 ?? null });
    const p = patchOf(d);
    if (p === undefined) continue;
    if (t.verdict !== "unjudged" && !holds(t, p)) return err("conflict", `take ${id} was judged ${t.verdict} in the Sound lab since this pile opened; the commit would overwrite it`);
    const said = p.verdict === "kept" ? "kept" : `rejected${p.reasons?.length ? `: ${p.reasons.join(", ")}` : ""}`;
    writes.push({ kind: "index-row", target: `takes.json ${id}`, candidate: id, detail: said });
    // syncVerdict's own predicate, over the take as the patch leaves it (the
    // instant is the commit's, unknown here, and bears only on the row's order).
    const row = verdictRow({ ...t, ...p, reasons: p.reasons ?? [], judgedAt: t.judgedAt ?? "" });
    if (row !== null) writes.push({ kind: "index-row", target: `${v1.ledger} verdicts ${id}`, candidate: id, detail: `${row.kind} · ${row.provider} · ${said}` });
    if (p.verdict === "kept" && t.stage === null) promotions.push({ target: "Arrangement · pending", candidate: id, detail: t.title });
  }
  const v1Digest = v1DigestOf({ source: "audio", cutoff: v1.cutoff, takes: read });
  return ok({ consequence: buildConsequence(at, [...items], { writes, promotions }, v1Digest), v1Digest });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const committed = committedOutcome(claim);
  if (!committed.ok) return committed;
  const run = runIdOf(claim);
  if (!run.ok) return run;
  const patches = claim.decisions.flatMap((d) => {
    const p = patchOf(d);
    return p === undefined ? [] : [{ id: candidateOf(d), patch: p }];
  });
  const now = new Date(committed.value.result.at);
  // One transaction: every take and its ledger row, or nothing (lib/sound/store.ts withStore).
  return v1Call(() =>
    withStore(async (tx) => {
      const store = await tx.get("takes");
      for (const { id, patch } of patches) {
        const t = store.takes.find((x) => x.id === id);
        if (t === undefined) throw new SoundError(`no take ${id}`, 404);
        // A redelivery finds its own verdict and writes nothing; another verdict is v1's, and stands.
        if (holds(t, patch)) continue;
        if (t.verdict !== "unjudged") throw new SoundError(`take ${id} is ${t.verdict} in the Sound lab; this packet would have it ${patch.verdict ?? "unjudged"} - judge it there`, 403);
        await patchTakeTx(tx, id, patch, now);
      }
    }),
  );
}

export const audioAdapter: DecisionAdapter<AudioV1> = { source: "audio", read, packet, consequence, apply };
