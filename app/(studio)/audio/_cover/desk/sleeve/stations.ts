// THE GROOVE'S STATIONS: where a cover's work has come to, read off its record alone. Pure.
//
// The order puts the brief before the section, where the spec drew it after: a finished brief writes the section
// and the style (../useCover.ts resets both fields on `brief.state === "done"`; ../fixture.ts briefDone sets the
// section to the whole song), so a section set before the brief is a section the brief overwrites.
import type { CoverRecord } from "@gt/domain/cover";
import { sunoSendInFlight } from "@gt/domain/cover.suno";

import { briefOffered } from "../brief/brief.ts";

export const STATIONS = ["brief", "section", "score", "takes", "winner", "suno", "remix"] as const;
export type Station = (typeof STATIONS)[number];

/** The stations whose panel is sized to what it holds: a control or two, not a width's worth of work. */
export const FITTED: ReadonlySet<Station> = new Set<Station>(["brief", "winner"]);

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
    suno: picked,
    remix: picked,
  };
}

/** The station the work stands at: where the desk opens a cover, and where it moves when the record moves. */
export function frontier(r: CoverRecord): Station {
  // A cover sent to Suno stays there until a remix from elsewhere stands: the filed take is the station's to show.
  if (r.state === "picked") {
    if ((r.suno?.sends.length ?? 0) > 0 && (r.remix === undefined || r.remix.sunoClipId !== undefined || sunoSendInFlight(r.suno))) return "suno";
    return r.remix === undefined ? "winner" : "remix";
  }
  if (r.state !== "draft") return "takes";
  if (r.brief === undefined || r.brief.state !== "done") return "brief";
  return "score";
}

/** +1 forward along the groove, -1 back: the panel slides with it. */
export const direction = (from: Station, to: Station): number => Math.sign(STATIONS.indexOf(to) - STATIONS.indexOf(from));
