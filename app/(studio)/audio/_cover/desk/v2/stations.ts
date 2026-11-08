// THE GROOVE'S STATIONS (prototype v2, Sleeve): where a cover's work has come to, read off its record alone. Pure.
//
// The order puts the brief before the section, where the spec drew it after: a finished brief writes the section
// and the style (../useCover.ts resets both fields on `brief.state === "done"`; ../fixture.ts briefDone sets the
// section to the whole song), so a section set before the brief is a section the brief overwrites.
import type { CoverRecord } from "@gt/domain/cover";

import { briefOffered } from "../brief/brief.ts";

export const STATIONS = ["brief", "section", "score", "takes", "winner", "remix"] as const;
export type Station = (typeof STATIONS)[number];

/** Whether a station can open for this record: one the work has reached. */
export function reachedOf(r: CoverRecord): Readonly<Record<Station, boolean>> {
  const launched = r.state !== "draft";
  const picked = r.state === "picked";
  return {
    brief: r.brief !== undefined || briefOffered(r),
    section: true,
    score: true,
    takes: launched,
    winner: picked,
    remix: picked,
  };
}

/** The station the work stands at: where the desk opens a cover, and where it moves when the record moves. */
export function frontier(r: CoverRecord): Station {
  if (r.state === "picked") return r.remix === undefined ? "winner" : "remix";
  if (r.state !== "draft") return "takes";
  if (r.brief === undefined || r.brief.state !== "done") return "brief";
  return "score";
}

/** +1 forward along the groove, -1 back: the panel slides with it. */
export const direction = (from: Station, to: Station): number => Math.sign(STATIONS.indexOf(to) - STATIONS.indexOf(from));
