// THE STUDIO DESK'S ARITHMETIC (spark audio-agent-studio, variant "desk"), pure so it is tested
// without a DOM: which pieces stand on the desk after each turn (the arrangement stays until a
// newer turn replaces it; talk lives one turn), the timeline's columns in seconds or bars, the
// heard sentence cut into the words the agent linked, the proposal a desk control stands for, and
// a stem's level, pan and state said in plain words for someone who has never opened a DAW.
import type { StudioAction, StudioActionKind, StudioActionOf, StudioNodeKind, StudioNodeOf, StudioStem } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import type { Span, StemMix } from "../audio/mix.ts";

/** A piece on the desk and the turn it came from (its sounds and presses are that turn's). */
export type Placed<K extends StudioNodeKind> = { readonly node: StudioNodeOf<K>; readonly turnId: string; readonly carried: boolean };
export type DeskPieces = { readonly [K in StudioNodeKind]: readonly Placed<K>[] };

/**
 * Does a kind stay on the desk after a turn that does not mention it: the arrangement (track,
 * sections, parts) and what was heard do; a choice (candidates, a pull, a duel) and a reading
 * (measures, which name the take they measured) belong to the turn that offered them.
 */
export const DESK_CARRY: Readonly<Record<StudioNodeKind, boolean>> = {
  track: true, sections: true, stems: true, heard: true, candidates: false, pull: false, duel: false, measures: false,
};

const KINDS: readonly StudioNodeKind[] = ["track", "stems", "sections", "candidates", "heard", "pull", "duel", "measures"];

function nodesOf<K extends StudioNodeKind>(t: ParsedTurn, kind: K): StudioNodeOf<K>[] {
  return t.turn.show.filter((n): n is StudioNodeOf<K> => n.kind === kind);
}

/** The desk after the turns shown so far, speaking for `visibleId` (the newest agent turn). */
export function deskPieces(turns: readonly ParsedTurn[], visibleId: string | null): DeskPieces {
  const upTo = visibleId === null ? -1 : turns.findIndex((t) => t.turn.id === visibleId);
  const agentTurns = turns.slice(0, upTo + 1).filter((t) => t.turn.from === "agent");
  const pick = <K extends StudioNodeKind>(kind: K): Placed<K>[] => {
    const from = DESK_CARRY[kind] ? [...agentTurns].reverse().find((t) => nodesOf(t, kind).length > 0) : agentTurns[agentTurns.length - 1];
    if (from === undefined) return [];
    return nodesOf(from, kind).map((node) => ({ node, turnId: from.turn.id, carried: from.turn.id !== visibleId }));
  };
  const out = {} as { -readonly [K in StudioNodeKind]: Placed<K>[] };
  for (const k of KINDS) (out as Record<StudioNodeKind, unknown>)[k] = pick(k);
  return out;
}

/**
 * The timeline's columns: one weight per section (seconds when known, else bars), the tail of audio
 * past the last section, and how much of the width the audio covers (1, or less when the sections
 * run past the end of what was rendered - an arrangement planned longer than its take).
 */
export type DeskAxis = { readonly weights: readonly number[]; readonly tail: number; readonly by: "seconds" | "bars"; readonly audio: number };

/** Sections laid on the audio: by their spans when known, with the remainder of `totalS` as a tail. */
export function deskAxis(rows: readonly { readonly bars: number }[], spans: readonly Span[] | null, totalS: number | null): DeskAxis {
  if (spans === null || spans.length !== rows.length) return { weights: rows.map((r) => r.bars), tail: 0, by: "bars", audio: 1 };
  const weights = spans.map((s) => Math.max(0, s.endS - s.startS));
  const end = spans[spans.length - 1]?.endS ?? 0;
  const rest = totalS === null ? 0 : totalS - end;
  const slack = Math.max(0.25, Math.max(totalS ?? 0, end) * 0.02);
  const short = totalS !== null && end > 0 && -rest > slack;
  return { weights, tail: rest > slack ? rest : 0, by: "seconds", audio: short ? Math.round((totalS / end) * 1000) / 1000 : 1 };
}

/** The CSS grid track list for an axis ("2.6fr 5.2fr 0.4fr"); one column when there are no sections. */
export function axisTemplate(axis: DeskAxis | null): string {
  if (axis === null || axis.weights.length === 0) return "1fr";
  const w = [...axis.weights, ...(axis.tail > 0 ? [axis.tail] : [])];
  return w.map((x) => `${Math.max(0.01, Math.round(x * 1000) / 1000)}fr`).join(" ");
}

/** Where a playhead stands, 0..1; 0 for an unknown length. */
export const fracAt = (s: number, len: number | null): number => (len === null || !(len > 0) || !Number.isFinite(s) ? 0 : Math.max(0, Math.min(1, s / len)));

/** A piece of the heard sentence: plain words, words the agent linked to what they became, or words it did not use. */
export type SentencePiece = { readonly text: string; readonly to?: string; readonly unheard?: boolean };

/** The sentence cut at the linked and unheard words (first match, case-insensitive, no overlaps); links it could not find come back `loose`. */
export function sentencePieces(sentence: string, links: readonly { readonly words: string; readonly to: string }[], unheard: readonly string[] = []): { readonly pieces: readonly SentencePiece[]; readonly loose: readonly { readonly words: string; readonly to: string }[] } {
  const low = sentence.toLowerCase();
  const marks: { at: number; end: number; to?: string; unheard?: boolean }[] = [];
  const loose: { words: string; to: string }[] = [];
  const free = (at: number, end: number): boolean => marks.every((m) => end <= m.at || at >= m.end);
  const place = (words: string): number => {
    const w = words.toLowerCase();
    for (let i = low.indexOf(w); i !== -1 && w !== ""; i = low.indexOf(w, i + 1)) if (free(i, i + w.length)) return i;
    return -1;
  };
  for (const l of links) {
    const at = place(l.words);
    if (at === -1) loose.push({ words: l.words, to: l.to });
    else marks.push({ at, end: at + l.words.length, to: l.to });
  }
  for (const u of unheard) {
    const at = place(u);
    if (at !== -1) marks.push({ at, end: at + u.length, unheard: true });
  }
  marks.sort((a, b) => a.at - b.at);
  const pieces: SentencePiece[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.at > at) pieces.push({ text: sentence.slice(at, m.at) });
    const text = sentence.slice(m.at, m.end);
    pieces.push(m.unheard === true ? { text, unheard: true } : { text, to: m.to ?? "" });
    at = m.end;
  }
  if (at < sentence.length) pieces.push({ text: sentence.slice(at) });
  return { pieces, loose };
}

/** The turn's own proposal of this kind that a desk control stands for (so a scripted answer still answers). */
export function proposal<K extends StudioActionKind>(actions: readonly StudioAction[], kind: K, test: (a: StudioActionOf<K>) => boolean): StudioActionOf<K> | undefined {
  return actions.find((a): a is StudioActionOf<K> => a.kind === kind && test(a as StudioActionOf<K>));
}

/** A desk control's own action when the turn proposed none (same vocabulary, a `desk.` id). */
export const deskAct = {
  use: (node: string, candidate: string, label: string): StudioActionOf<"use_candidate"> => ({ id: `desk.use.${node}`, kind: "use_candidate", label, node, candidate }),
  hear: (node: string, candidate: string, mode: "alone" | "in_mix"): StudioActionOf<"hear"> => ({ id: `desk.hear.${node}`, kind: "hear", label: "hear", node, candidate, mode }),
  settle: (node: string, side: 0 | 1, label: string): StudioActionOf<"settle_pull"> => ({ id: `desk.settle.${node}`, kind: "settle_pull", label, node, side }),
  pick: (node: string, side: "a" | "b", label: string): StudioActionOf<"pick"> => ({ id: `desk.pick.${node}`, kind: "pick", label, node, side }),
};

/** A stem's settings as the turn rendered them (the base its live mix is drawn over). */
export function rowMix(r: StudioStem): StemMix {
  return { ...(r.muted !== undefined ? { muted: r.muted } : {}), ...(r.solo !== undefined ? { solo: r.solo } : {}), ...(r.levelDb !== undefined ? { levelDb: r.levelDb } : {}), ...(r.pan !== undefined ? { pan: r.pan } : {}) };
}

/** A level in words: "as made", "3 dB louder", "6 dB quieter", "silent". */
export function levelWords(db: number): string {
  if (db <= -60) return "silent";
  if (Math.abs(db) < 0.5) return "as made";
  const n = Math.round(Math.abs(db));
  return db > 0 ? `${n} dB louder` : `${n} dB quieter`;
}

/** A pan in words: "in the middle", "a little left", "left", "far right". */
export function panWords(p: number): string {
  const a = Math.abs(p);
  if (a < 0.1) return "in the middle";
  const side = p < 0 ? "left" : "right";
  if (a < 0.45) return `a little ${side}`;
  if (a < 0.85) return side;
  return `far ${side}`;
}

export type LaneState = "planned" | "muted" | "hushed" | "solo" | "on";

/** What a lane does in the mix now: planned (no audio yet), muted, hushed (another part is solo), solo, or on. */
export function laneState(hasAudio: boolean, mix: StemMix, anySolo: boolean): LaneState {
  if (!hasAudio) return "planned";
  if (mix.muted === true) return "muted";
  if (mix.solo === true) return "solo";
  return anySolo ? "hushed" : "on";
}

export const LANE_WORDS: Readonly<Record<LaneState, string>> = {
  planned: "planned, not yet audible",
  muted: "muted",
  hushed: "quiet while another part plays alone",
  solo: "playing alone",
  on: "in the mix",
};
