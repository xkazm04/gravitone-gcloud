// A SUNO DRAFT UNDER A NAMED JOB - the record half of the door that launches a Suno take from
// the Floor's sentence or the Audio lane's seed (L52). Server-only (node:fs, through ./store).
//
// THE JOB ID IS MINTED BY THE RECEIPT, not here. A receipt prices a NAMED job (its quote key is
// the kernel job id `job:run:suno.<sj-id>`), so the receipt mints `sj-…` and the confirm must
// land under that same id - the strips door's shape (app/(studio)/projects/_port/realLaunch.ts).
// The proposal's id is DERIVED from it (`sp-…` with the same suffix), which makes the confirm
// idempotent without a second index: a confirm that answered stale, a double press, a retry
// after a crash all find the proposal they already drafted and never pay a second text turn.
//
// WHAT A DRAFT IS MADE FROM:
//   a sentence, live   one `suno-propose` turn (./propose.ts `proposeFromSentence`): the model
//                      decides the words, the form limits are enforced, origin `llm`;
//   a sentence, dry    NO turn: the sentence stands in as the style line (`sentenceStand`), so a
//                      dry launch spends nothing anywhere - the same rule the Suno job's own
//                      dry mode keeps with `standClipRefs` (lib/sound/suno/fakeDriver.ts);
//   fields             the composer's seed already written as Suno's form (`@gt/ui` recipe
//                      `sunoFieldsOf`), held to the same limits by `parseFields`, origin `custom`.
//
// THE RECORD IS WRITTEN BEFORE THE KERNEL JOB, never after: the producer's create step reads the
// record by its kernel id (lib/producers/suno.ts), and a worker may claim the job the instant its
// transaction commits. A confirm that finds the queue moved under its receipt takes the record
// back out (`dropUnlaunched`), so a v1 Start - which launches every queued record without a job
// (./queue.ts `waitingIds`), in the column's mode - cannot pick up a draft nobody confirmed.

import { UNGROUPED_LANE } from "@/lib/board/pipeline";
import { SUNO_MODELS, type SunoFields, type SunoJob, type SunoLane, type SunoProposal } from "@/lib/suno/types";

import { safeId, SoundError } from "../store";
import { proposeFromSentence, type ReasonFn } from "./propose";
import { clip, INSTRUMENTAL, parseFields, readSuno, STYLE_MAX, TITLE_MAX, withSuno } from "./store";

export type DraftSource = { readonly kind: "sentence"; readonly text: string } | { readonly kind: "fields"; readonly fields: SunoFields };

/** Where a draft with no lane lands: the board's ungrouped row, as a hunt leaf with none does. */
export const FLOOR_LANE: SunoLane = { axis: "group", value: UNGROUPED_LANE };

const SJ = /^sj-[A-Za-z0-9_-]{1,60}$/;

/** A receipt's job id: `sj-<suffix>`, the shape mintSunoId makes and safeId admits. */
export function draftJobId(suffix: string): string {
  const id = `sj-${suffix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60)}`;
  if (!SJ.test(id)) throw new SoundError(`no Suno job id can be made from ${JSON.stringify(suffix)}`, 400);
  return id;
}

/** The proposal a draft job sends, derived from the job's id. */
export function proposalIdOf(jobId: string): string {
  if (!SJ.test(jobId)) throw new SoundError(`${JSON.stringify(jobId)} is not a Suno job id`, 400);
  return `sp-${jobId.slice(3)}`;
}

/** The dry stand-in: the sentence as written is the style line; the title is its first words. */
export function sentenceStand(text: string): SunoFields {
  const t = text.trim().replace(/\s+/g, " ").replace(/[.…]+$/, "");
  if (t === "") throw new SoundError("a Suno prompt needs a first sentence", 400);
  const words = t.split(" ").slice(0, 6).join(" ");
  return { title: clip(words, TITLE_MAX), style: clip(t, STYLE_MAX), lyrics: INSTRUMENTAL };
}

/** The label a receipt line carries for a draft: the same words before and after the turn. */
export function draftLabel(source: DraftSource): string {
  const t = source.kind === "sentence" ? source.text.trim().replace(/\s+/g, " ") : (source.fields.title ?? source.fields.style);
  return clip(t === "" ? "…" : t, TITLE_MAX);
}

type Drafted = { readonly fields: SunoFields; readonly origin: SunoProposal["origin"]; readonly note?: string };

async function draftOf(source: DraftSource, o: { readonly dry: boolean; readonly reason?: ReasonFn; readonly lane: SunoLane }): Promise<Drafted> {
  if (source.kind === "fields") return { fields: parseFields(source.fields), origin: "custom" };
  if (o.dry) return { fields: sentenceStand(source.text), origin: "custom", note: "dry: the sentence as written, no text turn" };
  const p = await proposeFromSentence(source.text, o.lane, ...(o.reason === undefined ? [] : [o.reason]));
  return { fields: p.fields, origin: "llm", ...(p.note === undefined ? {} : { note: p.note }) };
}

export type EnsureOptions = { readonly dry: boolean; readonly now: number; readonly reason?: ReasonFn; readonly lane?: SunoLane };

/**
 * The proposal and the queued job record a confirmed draft launches, under `jobId`. Idempotent:
 * an existing job record is returned as it is; an existing proposal is reused without a turn.
 */
export async function ensureDraftJob(jobId: string, source: DraftSource, o: EnsureOptions): Promise<SunoJob> {
  safeId(jobId);
  const pid = proposalIdOf(jobId);
  const lane = o.lane ?? FLOOR_LANE;
  const before = await readSuno();
  const had = before.jobs.find((j) => j.id === jobId);
  if (had !== undefined) return had;
  // The turn runs OUTSIDE the store's lock: a model call may take minutes and the lock orders
  // every take and queue write in the studio.
  const drafted = before.proposals.some((p) => p.id === pid) ? null : await draftOf(source, { dry: o.dry, lane, ...(o.reason === undefined ? {} : { reason: o.reason }) });
  return withSuno((f) => {
    const again = f.jobs.find((j) => j.id === jobId);
    if (again !== undefined) return again;
    let p = f.proposals.find((x) => x.id === pid);
    if (p === undefined) {
      if (drafted === null) throw new SoundError(`proposal ${pid} vanished while its draft was being written`, 409);
      p = { id: pid, fields: drafted.fields, lane: { ...lane }, origin: drafted.origin, createdAt: o.now, ...(drafted.note === undefined ? {} : { note: drafted.note }) };
      f.proposals.push(p);
    }
    const job: SunoJob = { id: jobId, proposalId: p.id, fields: { ...p.fields }, lane: { ...p.lane }, state: "queued", models: [...SUNO_MODELS], enqueuedAt: o.now, clipIds: [] };
    f.jobs.push(job);
    return job;
  });
}

/** Take back a draft's job record that no kernel job serves (a confirm that answered stale). */
export async function dropUnlaunched(jobId: string): Promise<boolean> {
  return withSuno((f) => {
    const at = f.jobs.findIndex((j) => j.id === jobId && j.state === "queued" && j.job === undefined && j.clipIds.length === 0);
    if (at < 0) return false;
    f.jobs.splice(at, 1);
    return true;
  });
}
