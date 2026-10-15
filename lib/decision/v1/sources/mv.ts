import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { ConsequenceItem } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { patchMv } from "../../../sound/mv/queue.ts";
import { DROPPED_FILES, readMv, trackTitle } from "../../../sound/mv/store.ts";
import type { MvJob, MvVerdict } from "../../../sound/mv/types.ts";
import { filePathAbs, SoundError } from "../../../sound/store.ts";
import {
  buildConsequence,
  candidateOf,
  committedOutcome,
  decisionMap,
  fromV1,
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
import { cutoffOf, parsePile, pileRunId } from "./audio.ts";

// THE SETTLED VIDEOS AS A PACKET - the finished music-video jobs in <sound
// store>/mv.json with no verdict (lib/sound/mv/store.ts), decided keep | drop
// as a matrix cull with a row per look, and written back through v1's own
// `patchMv` under the sound lock.
//
// READ THROUGH `readMv`, NEVER `mvSnapshot`: the snapshot probes the still
// vendor and kicks the worker, which spends two text turns and a Leonardo still
// a job (lib/sound/mv/queue.ts header; the Phase 2 bypass, lib/ledger/v1/
// sources/mv.ts, kept).
//
// THE UPGRADE THIS SOURCE EXISTS FOR: v1 deleted a dropped video's render files
// (DROPPED_FILES: audio, still, video, thumb - the envelope stays, so a
// regenerate does not decode again) AT THE KEYPRESS, through patchMv. Here a
// drop is a decision until the commit, and the commit's preview lists every
// file it will delete, by path, before any is gone. patchMv itself is unchanged
// and still deletes after the record write ("a crash between the two leaves
// files nobody points at, never a record pointing at files that are gone").
//
// The pile carries a generation like the other aggregate piles (./audio.ts
// parsePile): the newest pending job's endedAt. A Regenerate clears a verdict
// and restamps endedAt, so a regenerated video joins a NEW generation rather
// than reopening a committed one.

export const MV_PILE = "mv/settled";

export type MvV1 = {
  readonly runId: string;
  readonly cutoff: number;
  /** Every job in mv.json: a commit may name one judged or regenerated since. */
  readonly jobs: readonly MvJob[];
  /** The pile's videos on disk, by job id. */
  readonly media: ReadonlyMap<string, BlobRef>;
};

const finishedAt = (j: MvJob): number => j.endedAt ?? j.enqueuedAt;
const pending = (j: MvJob): boolean => j.state === "done" && j.verdict === null;

function pileOf(v1: Pick<MvV1, "jobs" | "cutoff">): MvJob[] {
  return v1.jobs.filter((j) => pending(j) && finishedAt(j) <= v1.cutoff).sort((a, b) => finishedAt(a) - finishedAt(b) || a.id.localeCompare(b.id));
}

async function read(ref: AdapterRef): Promise<Result<MvV1>> {
  const pile = parsePile(MV_PILE, ref.runId);
  if (!pile.ok) return pile;
  const file = await v1Call(() => readMv());
  if (!file.ok) return file;
  const jobs = file.value.jobs;
  const cutoff = cutoffOf(pile.value, jobs.filter(pending).map(finishedAt));
  if (cutoff === undefined) return err("not-found", "no finished video is waiting for a verdict");
  const files: { key: string; abs: string }[] = [];
  for (const j of pileOf({ jobs, cutoff })) {
    const rel = j.files.video;
    if (rel === undefined) continue;
    const abs = await v1Call(async () => filePathAbs(rel));
    if (abs.ok) files.push({ key: j.id, abs: abs.value });
  }
  const media = await mediaRefs(files);
  if (!media.ok) return media;
  return ok({ runId: pileRunId(MV_PILE, cutoff), cutoff, jobs, media: media.value });
}

const lookOf = (j: MvJob): string => j.look ?? "no look";

function words(j: MvJob): ItemWords {
  const length = j.analysis === undefined ? "" : ` · ${Math.round(j.analysis.durationS)} s`;
  return {
    label: j.metadata?.title ?? trackTitle(j.source.title),
    meta: `${lookOf(j)}${length}`,
    ...(j.treatment === undefined ? {} : { prompt: j.treatment.rationale }),
  };
}

function packet(v1: MvV1): Result<OpenPlan> {
  const losses: Loss[] = [];
  const judgeable: MvJob[] = [];
  for (const j of pileOf(v1)) {
    if (v1.media.has(j.id)) judgeable.push(j);
    else losses.push({ candidate: j.id, grade: "dropped", reason: j.files.video === undefined ? "the job finished with no video file; it stays unjudged in Settled" : `${j.files.video} is not on disk; it stays unjudged in Settled` });
  }
  if (judgeable.length === 0) return err("not-found", `no finished video with a file waits for a verdict at or before ${new Date(v1.cutoff).toISOString()}`);
  const minted = mintPacket({
    id: packetIdOf("mv", v1.runId),
    lane: "video",
    source: "mv",
    mode: "matrix-cull",
    state: "open",
    runId: v1.runId,
    title: `${judgeable.length} video${judgeable.length === 1 ? "" : "s"} to judge`,
    items: judgeable.map((j) => ({ id: j.id, jobId: j.id, media: v1.media.get(j.id), row: lookOf(j), grades: [] })),
  });
  if (!minted.ok) return minted;
  const rows: RowWords[] = [...new Set(judgeable.map(lookOf))].map((l) => ({ id: l, label: l }));
  return ok({
    packet: minted.value,
    // The pile is the jobs with no verdict: there is none to import.
    initial: [],
    present: { items: Object.fromEntries(judgeable.map((j) => [j.id, words(j)])), rows, meta: "Settled videos" },
    urls: Object.fromEntries(judgeable.map((j) => [j.id, `/api/sound/mv/jobs/${encodeURIComponent(j.id)}/file?kind=video`])),
    losses,
  });
}

const verdictOf = (d: Pick<Decision, "verdict">): MvVerdict | undefined => (d.verdict === "keep" ? "keep" : d.verdict === "reject" ? "drop" : undefined);

/** The files patchMv deletes on a drop, as it will find them (DROPPED_FILES, in v1's order). */
function dropped(j: MvJob): ConsequenceItem[] {
  return DROPPED_FILES.flatMap((k) => {
    const rel = j.files[k];
    return rel === undefined ? [] : [{ target: rel, candidate: j.id, detail: `the ${k} file` }];
  });
}

function consequence(v1: MvV1, at: DecisionsAt): Result<Preview> {
  const byId = new Map(v1.jobs.map((j) => [j.id, j]));
  const items = new Set(pileOf(v1).filter((j) => v1.media.has(j.id)).map((j) => j.id));
  const writes: Preview["consequence"]["writes"][number][] = [];
  const deletes: ConsequenceItem[] = [];
  const promotions: ConsequenceItem[] = [];
  const read: unknown[] = [];
  for (const [id, d] of decisionMap(at.decisions)) {
    items.add(id);
    const j = byId.get(id);
    if (j === undefined) return err("conflict", `music-video job ${id} is no longer in mv.json`);
    read.push({ id, state: j.state, verdict: j.verdict, endedAt: j.endedAt ?? null, files: j.files, sha: v1.media.get(id)?.sha256 ?? null });
    const v = verdictOf(d);
    if (v === undefined) continue;
    if (j.verdict !== null && j.verdict !== v) return err("conflict", `video ${id} was marked ${j.verdict} since this pile opened; the commit would overwrite it`);
    // patchMv's own guard, checked before the operator is shown a plan it would refuse.
    if (j.state !== "done" && j.state !== "failed") return err("conflict", `video ${id} is ${j.state}; it can be judged once it has finished`);
    writes.push({ kind: "index-row", target: `mv.json jobs ${id}`, candidate: id, detail: v });
    if (v === "drop" && j.verdict === null) deletes.push(...dropped(j));
    if (v === "keep") promotions.push({ target: "Settled · kept", candidate: id, detail: `${j.metadata?.title ?? trackTitle(j.source.title)}: ready for Calendar` });
  }
  const v1Digest = v1DigestOf({ source: "mv", cutoff: v1.cutoff, jobs: read });
  return ok({ consequence: buildConsequence(at, [...items], { writes, deletes, promotions }, v1Digest), v1Digest });
}

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const committed = committedOutcome(claim);
  if (!committed.ok) return committed;
  const run = runIdOf(claim);
  if (!run.ok) return run;
  const file = await v1Call(() => readMv());
  if (!file.ok) return file;
  const now = new Map(file.value.jobs.map((j) => [j.id, j.verdict]));
  // Job by job, as v1's Settled verbs wrote them; a redelivery finds the jobs
  // it already marked and skips them (a drop's files are gone with the first).
  for (const d of [...claim.decisions].sort((a, b) => a.key.localeCompare(b.key))) {
    const id = candidateOf(d);
    const v = verdictOf(d);
    if (v === undefined) continue;
    const held = now.get(id);
    if (held === v) continue;
    if (held !== null && held !== undefined) return fromV1(new SoundError(`video ${id} is marked ${held} in Settled; this packet would mark it ${v} - judge it there`, 403));
    const r = await v1Call(() => patchMv(id, { verdict: v }));
    if (!r.ok) return r;
  }
  return ok(undefined);
}

export const mvAdapter: DecisionAdapter<MvV1> = { source: "mv", read, packet, consequence, apply };
