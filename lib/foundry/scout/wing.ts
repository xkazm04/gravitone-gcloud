// A SCOUT WING (spark scout-muse): a ROOT of nights, `scout` (foundry-out/scout) or `muse`
// (foundry-out/scout-muse). Absent anywhere means `scout`: every record written before the wings existed is
// the scout wing's.
//
// MERGED (spark scout-vision S3): there is one loop now. Every new night is a scout night; the four muse nights
// are a read-only ARCHIVE whose run ids `muse:<night>` - its packets pkt:scout:muse:<night>, its files, its
// Library links - decode here forever. A wing is no longer a rule's scope: character rules key on the
// candidate's own target and card. `withWing("muse")` survives for archive READS only (the Board, the file
// route, the ledger, the graph, the Library, `status --wing muse`).
//
// Pure and client-safe: no Node. The scope that picks the active root is wingScope.ts (server).

import { partRunId, splitPart } from "./parts";
import type { NightId } from "./types";

export const SCOUT_WINGS = ["scout", "muse"] as const;
export type ScoutWing = (typeof SCOUT_WINGS)[number];
export const DEFAULT_WING: ScoutWing = "scout";

export const isWing = (s: unknown): s is ScoutWing => typeof s === "string" && (SCOUT_WINGS as readonly string[]).includes(s);

/** The wing's folder under the out dir (`foundry-out/scout`, `foundry-out/scout-muse`). */
export const WING_OUT_DIR: Readonly<Record<ScoutWing, string>> = { scout: "scout", muse: "scout-muse" };
/** The wing's folder under `knowledge/` (watchlist; muse also techniques.md and characters.md). */
export const WING_KNOWLEDGE_DIR: Readonly<Record<ScoutWing, string>> = { scout: "scout", muse: "scout-muse" };

/**
 * A night's run id on the Board and in the ledger: the scout wing's is the bare night (every packet
 * minted before the wings keeps its id), any other wing's is `<wing>:<night>` - so `pkt:scout:muse:2026-10-24`.
 * parsePacketId takes everything after the source as the run id, colons included.
 *
 * A REMAINDER PACKET (spark scout-storyboards, ./parts.ts) adds its part: `2026-10-24:2`, `muse:2026-10-24:2`.
 */
export function wingRunId(wing: ScoutWing, night: NightId, part = 1): string {
  return partRunId(wing === DEFAULT_WING ? night : `${wing}:${night}`, part);
}

/** The inverse: a bare id is the scout wing's; `<wing>:<rest>` names a known wing, else null. A trailing `:<n>` (n >= 2) is the part. */
export function parseWingRunId(runId: string): { wing: ScoutWing; night: string; part?: number } | null {
  const { run, part } = splitPart(runId);
  const i = run.indexOf(":");
  const at = part === 1 ? {} : { part };
  if (i < 0) return { wing: DEFAULT_WING, night: run, ...at };
  const w = run.slice(0, i);
  if (!isWing(w) || w === DEFAULT_WING) return null;
  return { wing: w, night: run.slice(i + 1), ...at };
}

/** The word a packet title, a pile and a node carry for the wing (`scout 2026-10-24`, `muse 2026-10-24`). */
export const wingWord = (wing: ScoutWing): string => wing;
