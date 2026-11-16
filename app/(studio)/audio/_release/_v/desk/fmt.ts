// The desk's small pure helpers (spark audio-distribution, S1 - layout "desk"): figures as the
// desk prints them, where a problem lives on the page, and the tone each state is drawn in.
import type { Tone } from "@gt/ui/components/chip/tone.ts";
import type { ChannelState, ReleaseKind, ReleaseStatus } from "@gt/domain/release";
import type { ProblemAt, ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";

export const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** One decimal, the sign kept only for a delta. */
export const fig = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : n.toFixed(1));
export const delta = (n: number): string => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(1)}`;

/** An empty field is the absent value (`null`), never an empty string. */
export const orNull = (v: string): string | null => (v.trim() === "" ? null : v);

/** The element a problem jumps to. */
export const anchorOf = (at: ProblemAt): string => (at.startsWith("track:") ? `desk-track-${at.slice(6)}` : `desk-${at}`);

export const KIND_LABEL: Readonly<Record<ReleaseKind, string>> = { single: "single", ep: "EP", album: "album" };

export const STATUS_TONE: Readonly<Record<ReleaseStatus, Tone>> = { draft: "neutral", ready: "emerald", scheduled: "violet", published: "emerald" };

export const CHANNEL_TONE: Readonly<Record<ChannelState, Tone>> = { ready: "emerald", dry: "amber", "not-wired": "neutral", "not-reachable": "neutral" };

export const CHANNEL_STATE_LABEL: Readonly<Record<ChannelState, string>> = { ready: "ready", dry: "dry", "not-wired": "not wired", "not-reachable": "not reachable" };

/** The worst severity among the problems a field or a row owns, for its edge mark. */
export function worst(ps: readonly ReleaseProblem[], codes?: readonly ProblemCode[]): "block" | "warn" | undefined {
  const own = codes === undefined ? ps : ps.filter((p) => codes.includes(p.code));
  if (own.some((p) => p.severity === "block")) return "block";
  if (own.length > 0) return "warn";
  return undefined;
}

export const count = (ps: readonly ReleaseProblem[], sev: "block" | "warn"): number => ps.filter((p) => p.severity === sev).length;

/** Where a problem sits, as the rail names it. */
export function placeOf(at: ProblemAt, trackTitle: (n: number) => string | undefined): string {
  if (!at.startsWith("track:")) return at;
  const n = Number(at.slice(6));
  const t = trackTitle(n);
  return t === undefined || t.trim() === "" ? `track ${n}` : `${n} ${t}`;
}
