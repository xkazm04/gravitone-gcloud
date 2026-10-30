// THE STAGE MACHINE of a clip folder, as data and pure functions: no fs here,
// so every transition is testable without a folder and the CLI's verbs only
// read, call one of these, and write.
//
// Two rules hold the machine together:
//   - A PICK IS IDEMPOTENT. Picking what is already picked returns the state
//     unchanged, `updatedAt` included, so a skill that retries a verb after a
//     dropped connection cannot tell the retry happened.
//   - A CHANGED PICK FORGETS WHAT GREW FROM IT. A new direction makes the old
//     story's approval and the stack choice meaningless, so they are dropped and
//     the stage falls back to the pick; a stale downstream pick that survives a
//     change upstream is how a bake-off gets run on a story nobody approved.
//
// The stack pick ends the machine: it moves the stage to `final` (the CLI copies
// that stack's full render to final.mp4 before writing the pick). A `b` pick
// names the story's direction - StoryV1 carries no other id to approve.
//
// Board T sits between the look and the hero (2026-10-30: the operator found a
// Board B built straight on a direction "a PowerPoint presentation"). A `t`
// pick chooses the treatment - characters, plot, the one camera device - so a
// hero is never built before someone decided what the film is about. It needs
// the direction picked and Board T rendered; changing it drops the story and
// the stack, like any changed pick upstream.

import type { ClipStack, ClipStage, StateV1 } from "./types";

/** A refusal the operator can act on: the message is the one line the CLI prints. */
export class ClipError extends Error {
  readonly code: string;
  constructor(message: string, code = "refused") {
    super(message);
    this.name = "ClipError";
    this.code = code;
  }
}

export const STAGES: readonly ClipStage[] = ["analyzed", "board-a", "picked-a", "board-t", "picked-t", "board-b", "picked-b", "proof", "bakeoff", "final"];
export const STACKS: readonly ClipStack[] = ["kernel", "hyperframes", "remotion"];

export const stageIndex = (s: ClipStage) => STAGES.indexOf(s);
export const atLeast = (state: StateV1, s: ClipStage) => stageIndex(state.stage) >= stageIndex(s);

/** The state, or a sentence saying what is wrong with it. */
export function parseState(raw: unknown): StateV1 | string {
  if (!raw || typeof raw !== "object") return "not an object";
  const o = raw as Record<string, unknown>;
  if (o["v"] !== 1) return "v is not 1";
  if (typeof o["stage"] !== "string" || !STAGES.includes(o["stage"] as ClipStage)) return `stage must be one of ${STAGES.join(", ")}`;
  if (typeof o["trackSha1"] !== "string") return "trackSha1 is not a string";
  if (typeof o["updatedAt"] !== "string") return "updatedAt is not a string";
  const p = o["picks"];
  if (!p || typeof p !== "object") return "picks is not an object";
  const picks = p as Record<string, unknown>;
  for (const k of ["a", "t", "b"]) if (picks[k] !== undefined && typeof picks[k] !== "string") return `picks.${k} is not a string`;
  if (picks["stack"] !== undefined && !STACKS.includes(picks["stack"] as ClipStack)) return `picks.stack must be one of ${STACKS.join(", ")}`;
  return raw as StateV1;
}

/**
 * After an analysis: a new folder starts at `analyzed`; the same track keeps
 * its stage and picks (re-analysing to sharpen lyric times is not a new clip);
 * a different track resets everything, and `reset` says so.
 */
export function stageAfterAnalyze(prev: StateV1 | undefined, trackSha1: string, now: string): { state: StateV1; reset: boolean } {
  if (prev && prev.trackSha1 === trackSha1) return { state: { ...prev, updatedAt: now }, reset: false };
  return { state: { v: 1, stage: "analyzed", trackSha1, picks: {}, updatedAt: now }, reset: prev !== undefined };
}

/** Move forward to `stage`; never back. Unchanged (same object) when already there or past it. */
export function advanceTo(state: StateV1, stage: ClipStage, now: string): StateV1 {
  return stageIndex(stage) > stageIndex(state.stage) ? { ...state, stage, updatedAt: now } : state;
}

/** Fall back to `stage`, dropping every pick made at or after it. */
export function resetTo(state: StateV1, stage: ClipStage, now: string): StateV1 {
  const keep = (pickStage: ClipStage) => stageIndex(pickStage) < stageIndex(stage);
  const picks: StateV1["picks"] = {};
  if (state.picks.a !== undefined && keep("picked-a")) picks.a = state.picks.a;
  if (state.picks.t !== undefined && keep("picked-t")) picks.t = state.picks.t;
  if (state.picks.b !== undefined && keep("picked-b")) picks.b = state.picks.b;
  if (state.picks.stack !== undefined && keep("final")) picks.stack = state.picks.stack;
  return { ...state, stage, picks, updatedAt: now };
}

export type PickKind = "a" | "t" | "b" | "stack";
export interface Pick {
  kind: PickKind;
  id: string;
}

export function parsePick(arg: string | undefined): Pick {
  const m = /^(a|t|b|stack):(.+)$/.exec(arg ?? "");
  if (!m) throw new ClipError(`pick needs a:<direction-id>, t:<treatment-id>, b:<direction-id> or stack:<${STACKS.join("|")}>, got ${arg ?? "nothing"}`, "usage");
  return { kind: m[1] as PickKind, id: m[2] as string };
}

/**
 * Apply a pick already known to name a real id (`valid` is the list it was
 * checked against, quoted back when it is not in it). Returns the same object
 * when nothing changes, so the caller can skip the write.
 */
export function applyPick(state: StateV1, pick: Pick, valid: readonly string[], now: string): { state: StateV1; changed: boolean } {
  if (!valid.includes(pick.id)) throw new ClipError(`unknown ${pick.kind} id "${pick.id}"; valid: ${valid.join(", ") || "(none)"}`, "unknown-id");
  const same = (s: StateV1) => ({ state: s, changed: false });
  if (pick.kind === "a") {
    if (!atLeast(state, "board-a")) throw new ClipError(`pick a: needs board a first (stage ${state.stage})`, "stage");
    if (state.picks.a === pick.id) return same(state);
    return { state: { ...state, stage: "picked-a", picks: { a: pick.id }, updatedAt: now }, changed: true };
  }
  if (pick.kind === "t") {
    if (state.picks.a === undefined || !atLeast(state, "board-t")) throw new ClipError(`pick t: needs board t first (stage ${state.stage})`, "stage");
    if (state.picks.t === pick.id) return same(state);
    return { state: { ...state, stage: "picked-t", picks: { a: state.picks.a, t: pick.id }, updatedAt: now }, changed: true };
  }
  if (pick.kind === "b") {
    if (state.picks.a === undefined || state.picks.t === undefined || !atLeast(state, "board-b")) throw new ClipError(`pick b: needs board b first (stage ${state.stage})`, "stage");
    if (state.picks.b === pick.id) return same(state);
    return { state: { ...state, stage: "picked-b", picks: { a: state.picks.a, t: state.picks.t, b: pick.id }, updatedAt: now }, changed: true };
  }
  if (!atLeast(state, "bakeoff")) throw new ClipError(`pick stack: needs the bake-off first (stage ${state.stage}); run pack`, "stage");
  if (state.picks.stack === pick.id) return same(state);
  return { state: { ...state, stage: "final", picks: { ...state.picks, stack: pick.id as ClipStack }, updatedAt: now }, changed: true };
}

/** The verb that moves the folder on, given its stage and what is on disk. */
export function nextVerb(state: StateV1 | undefined, has: { directions: boolean; treatments: boolean; story: boolean; results: number }): string {
  if (!state) return "analyze <dir> --dry | --yes";
  switch (state.stage) {
    case "analyzed":
    case "board-a":
      if (!has.directions) return "author music-clip/directions.json, then board a <dir>";
      return state.stage === "analyzed" ? "board a <dir>" : "pick <dir> a:<direction-id>";
    case "picked-a":
    case "board-t":
      if (!has.treatments) return "author music-clip/treatments.json + board-t/<id>/scene.html, then board t <dir>";
      return state.stage === "picked-a" ? "board t <dir>" : "pick <dir> t:<treatment-id>";
    case "picked-t":
    case "board-b":
      if (!has.story) return "author music-clip/story.json + board-b/hero.html (from the picked treatment's scene.html), then board b <dir>";
      return state.stage === "picked-t" ? "board b <dir>" : `pick <dir> b:${state.picks.a ?? "<direction-id>"}`;
    case "picked-b":
    case "proof":
      return "pack <dir>";
    case "bakeoff":
      if (has.results === 0) return "run the bake-off into music-clip/bakeoff/<stack>/result.json, then compare <dir>";
      return `compare <dir>, then pick <dir> stack:<${STACKS.join("|")}>`;
    case "final":
      return "done";
  }
}
