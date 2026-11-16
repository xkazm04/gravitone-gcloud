// THE BRIEF'S SMALL VOCABULARY (cover brief, WP-B): its state as the desk reads it off the record, the chip a
// state wears, how long since the state last moved, and whether the desk has anything in flight to re-read for.
// Pure. The record is the only source: no brief on it means none was ever started.
import type { CoverBrief, CoverBriefState, CoverRecord } from "@gt/domain/cover";
import { sunoSendInFlight } from "@gt/domain/cover.suno";
import type { Tone } from "@gt/ui/components/chip/tone.ts";

export type BriefShown = CoverBriefState | "none";

export const briefShown = (b: CoverBrief | undefined): BriefShown => b?.state ?? "none";

export const BRIEF_TONE: Readonly<Record<CoverBriefState, Tone>> = { queued: "cyan", running: "cyan", done: "emerald", failed: "rose" };

/** The button is offered for a cover the brief may still write into, and only when no brief is under way or done. */
export function briefOffered(r: CoverRecord): boolean {
  if (r.state !== "draft" && r.state !== "failed") return false;
  const b = briefShown(r.brief);
  return b === "none" || b === "failed";
}

export const briefInFlight = (b: CoverBrief | undefined): boolean => b?.state === "queued" || b?.state === "running";

/** Whether the desk re-reads its view: a brief queued or running, the cover's own job queued or rendering, or a Suno send queued or running. */
export function inFlight(r: CoverRecord | undefined): boolean {
  if (r === undefined) return false;
  return briefInFlight(r.brief) || r.state === "queued" || r.state === "rendering" || sunoSendInFlight(r.suno);
}

/** "<n> of 3 listens agreed": the brief's genre held as the hypothesis it is. */
export const agreedWords = (n: number): string => `${n} of 3 listens agreed`;

/** How long since `at`, coarse: seconds under a minute, minutes under two hours, hours after. */
export function since(at: string, nowMs: number): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 120) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
