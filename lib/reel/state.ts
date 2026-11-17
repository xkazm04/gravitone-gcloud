// THE STAGE MACHINE of a reel folder, as data and pure functions: no fs here, so every transition is testable
// without a folder and the CLI's verbs only read, call one of these, and write.
//
// Three rules hold it together:
//   - THE TABLE IS UPSTREAM OF EVERYTHING. A changed table forgets the plan and every cut: a page proofed on
//     last week's rows is a page about a different reel.
//   - A CUT IS HELD TO THE BLOCK IT WAS ISSUED. `dataSha` is the hash of the data block `brief` wrote; `proof`
//     and `cut` refuse a page whose block is anything else.
//   - STAGES ONLY MOVE FORWARD, except by a new table or a new brief.

import { CUT_SECONDS, REEL_FPS, ReelError, type CutRecord, type CutStage, type ReelCut, type ReelIdea, type ReelStage, type ReelState, type TrackRecord } from "./types";

export const STAGES: readonly ReelStage[] = ["idea", "data", "planned"];
export const CUT_STAGES: readonly CutStage[] = ["briefed", "proofed", "cut"];
export const CUT_NAMES: readonly ReelCut[] = ["short", "long"];

const HOOK_MAX = 90;
const TITLE_MAX = 70;
const PATH_MIN = 40;

/** The idea, or a sentence saying what is wrong with it. */
export function parseIdea(raw: unknown): ReelIdea | string {
  if (typeof raw !== "object" || raw === null) return "the idea is not an object";
  const o = raw as Record<string, unknown>;
  const { title, hook, path } = o;
  if (typeof title !== "string" || title.trim() === "" || title.length > TITLE_MAX) return `title is missing or over ${TITLE_MAX} characters`;
  if (typeof hook !== "string" || hook.trim() === "" || hook.length > HOOK_MAX) return `hook is missing or over ${HOOK_MAX} characters`;
  if (!hook.trim().endsWith("?")) return "hook is a question: a race video asks one and the last frame answers it";
  if (typeof path !== "string" || path.trim().length < PATH_MIN) return `path is under ${PATH_MIN} characters: say why someone keeps watching, with names and dates`;
  return { title, hook, path };
}

export function parseState(raw: unknown): ReelState | string {
  if (typeof raw !== "object" || raw === null) return "not an object";
  const o = raw as Record<string, unknown>;
  if (o["v"] !== 1) return "v is not 1";
  if (typeof o["slug"] !== "string") return "slug is not a string";
  if (typeof o["stage"] !== "string" || !STAGES.includes(o["stage"] as ReelStage)) return `stage must be one of ${STAGES.join(", ")}`;
  const idea = parseIdea(o["idea"]);
  if (typeof idea === "string") return `idea: ${idea}`;
  if (typeof o["cuts"] !== "object" || o["cuts"] === null) return "cuts is not an object";
  if (typeof o["updatedAt"] !== "string") return "updatedAt is not a string";
  return raw as ReelState;
}

export const newReel = (slug: string, idea: ReelIdea, now: string): ReelState => ({ v: 1, slug, stage: "idea", idea, cuts: {}, updatedAt: now });

/** A table landed. The same table changes nothing; a different one forgets the plan and every cut. */
export function withTable(state: ReelState, tableSha: string, now: string): { state: ReelState; reset: boolean } {
  if (state.tableSha === tableSha) return { state, reset: false };
  const reset = state.tableSha !== undefined;
  return { state: { v: 1, slug: state.slug, stage: "data", idea: state.idea, tableSha, cuts: {}, updatedAt: now }, reset };
}

/**
 * A track was attached to a cut. The cut is planned to the WHOLE track, so a track outside the cut's length is
 * refused with the length to ask for. A different track forgets that cut (its clock changed); the same one
 * changes nothing.
 */
export function withTrack(state: ReelState, cut: ReelCut, track: TrackRecord, now: string): ReelState {
  const [min, max] = CUT_SECONDS[cut];
  if (track.seconds < min || track.seconds > max + 0.5) {
    throw new ReelError(`the track is ${track.seconds.toFixed(1)} s and a ${cut} cut is ${min} to ${max} s: make a track with a duration inside it`);
  }
  if (state.tracks?.[cut]?.sha === track.sha) return state;
  const cuts = { ...state.cuts };
  delete cuts[cut];
  return { ...state, tracks: { ...state.tracks, [cut]: track }, cuts, updatedAt: now };
}

/** The frames a cut runs: its track's whole length, or undefined when the table decides. */
export const trackFrames = (state: ReelState, cut: ReelCut): number | undefined => {
  const t = state.tracks?.[cut];
  return t === undefined ? undefined : Math.round(t.seconds * REEL_FPS);
};

export function withPlan(state: ReelState, now: string): ReelState {
  if (state.tableSha === undefined) throw new ReelError("no table yet: run `data` first");
  return state.stage === "planned" ? state : { ...state, stage: "planned", updatedAt: now };
}

/** A brief was issued for a cut. A new block restarts that cut; the same block keeps its stage. */
export function withBrief(state: ReelState, cut: ReelCut, frames: number, dataSha: string, now: string): ReelState {
  if (state.stage !== "planned") throw new ReelError("no plan yet: run `plan` first");
  const had = state.cuts[cut];
  if (had !== undefined && had.dataSha === dataSha && had.frames === frames) return state;
  return { ...state, cuts: { ...state.cuts, [cut]: { stage: "briefed", frames, dataSha } }, updatedAt: now };
}

export function cutOf(state: ReelState, cut: ReelCut): CutRecord {
  const rec = state.cuts[cut];
  if (rec === undefined) throw new ReelError(`the ${cut} cut has no brief: run \`brief <dir> ${cut}\` first`);
  return rec;
}

/** Move a cut forward to `stage`; never back. Unchanged (same object) when already there or past it. */
export function advanceCut(state: ReelState, cut: ReelCut, stage: CutStage, now: string): ReelState {
  const rec = cutOf(state, cut);
  if (CUT_STAGES.indexOf(rec.stage) >= CUT_STAGES.indexOf(stage)) return state;
  return { ...state, cuts: { ...state.cuts, [cut]: { ...rec, stage } }, updatedAt: now };
}

/** The one verb to run next, as the CLI would be typed. */
export function nextVerb(state: ReelState, dir: string): string {
  if (state.stage === "idea") return `data ${dir} --table <file.json>`;
  if (state.stage === "data") return `plan ${dir}`;
  for (const cut of CUT_NAMES) {
    const rec = state.cuts[cut];
    if (rec === undefined) return `brief ${dir} ${cut}`;
    if (rec.stage === "briefed") return `proof ${dir} ${cut}   (after the page is written to ${cut}/out/strip.html)`;
    if (rec.stage === "proofed") return `cut ${dir} ${cut}   (after the operator has looked at ${cut}/proof/)`;
  }
  return "both cuts are rendered";
}
