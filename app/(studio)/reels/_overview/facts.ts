// How a reel's stage, verdict and figures are spelled on the /reels screens. One table, so the three overview
// variants and the review cannot disagree about which hue a stage wears: amber is the operator's turn (a film or a
// release waiting on a verdict, a bed to upload), cyan a machine working (author, render), violet a seat's research,
// emerald on the Calendar, rose sent back.
import type { Tone } from "@gt/ui/components/chip/tone.ts";

import type { FilmStage } from "@/lib/reel/film";

import type { ReelLastVerdict, ReelRow } from "../_port/types.ts";

export const STAGE_LOOK: Readonly<Record<FilmStage, { readonly label: string; readonly tone: Tone; readonly yours: boolean }>> = {
  idea: { label: "idea", tone: "neutral", yours: false },
  data: { label: "data", tone: "violet", yours: true },
  authoring: { label: "authoring", tone: "cyan", yours: false },
  rendering: { label: "rendering", tone: "cyan", yours: false },
  review: { label: "review", tone: "amber", yours: true },
  redo: { label: "redo", tone: "rose", yours: false },
  sound: { label: "sound", tone: "amber", yours: true },
  release: { label: "release", tone: "amber", yours: true },
  released: { label: "released", tone: "emerald", yours: false },
  dropped: { label: "dropped", tone: "neutral", yours: false },
};

/** The board's columns and the rail's walk: a redo walks back to authoring, a drop leaves the walk. */
export const WALK: readonly FilmStage[] = ["idea", "data", "authoring", "rendering", "review", "sound", "release", "released"];

const VERDICT_WORD: Readonly<Record<string, Readonly<Record<ReelLastVerdict["verdict"], string>>>> = {
  film: { keep: "taken", reject: "redo", drop: "dropped" },
  release: { keep: "kept", reject: "sent back", drop: "dropped" },
};

export function verdictLook(v: ReelLastVerdict): { readonly label: string; readonly tone: Tone } {
  const word = VERDICT_WORD[v.stop]?.[v.verdict] ?? v.verdict;
  return { label: `${v.stop} ${word}`, tone: v.verdict === "keep" ? "emerald" : v.verdict === "reject" ? "rose" : "neutral" };
}

export const secs = (t: number): string => (t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}` : `${Math.round(t)} s`);

export const mb = (b: number): string => `${b >= 1e9 ? (b / 1e9).toFixed(1) : b >= 1e8 ? Math.round(b / 1e6) : (b / 1e6).toFixed(1)} ${b >= 1e9 ? "GB" : "MB"}`;

/** `1:36 · 0:48`, desktop then phone, or undefined before a render. */
export function lengths(r: Pick<ReelRow, "seconds">): string | undefined {
  const d = r.seconds?.desktop;
  const p = r.seconds?.phone;
  if (d === undefined && p === undefined) return undefined;
  return [d, p].map((x) => (x === undefined ? "—" : secs(x))).join(" · ");
}

export function sizes(r: Pick<ReelRow, "bytes">): string | undefined {
  const d = r.bytes?.desktop;
  const p = r.bytes?.phone;
  if (d === undefined && p === undefined) return undefined;
  return [d, p].map((x) => (x === undefined ? "—" : mb(x))).join(" · ");
}

/** A render's reach as a share, 0..1. */
export const progressShare = (p: NonNullable<ReelRow["progress"]>): number => (p.frames <= 0 ? 0 : Math.min(1, p.frame / p.frames));

export const reelHref = (slug: string): string => `/reels/${encodeURIComponent(slug)}`;
