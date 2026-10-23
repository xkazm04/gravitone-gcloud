// A SCOUT WING (spark scout-muse): one nightly loop's own store, taste and knowledge, beside the
// others on the same code. `scout` is the YouTube-video loop (/scout); `muse` is the SFW study of how
// fictional adult women are drawn as characters, poster and scene, photoreal to anime to 3D (/scout-muse).
//
// A wing is a ROOT, not a tag: every cross-night rule (taste, seed bans, steer, source dedupe, leads)
// reads one root, so the two loops never see each other's verdicts. The readers that show both - the
// /scout screen, the Board, the Floor - ask for each wing by name. Absent anywhere means `scout`: every
// record written before the wings existed is the scout wing's.
//
// Pure and client-safe: no Node. The scope that picks the active root is wingScope.ts (server).

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
 */
export function wingRunId(wing: ScoutWing, night: NightId): string {
  return wing === DEFAULT_WING ? night : `${wing}:${night}`;
}

/** The inverse: a bare id is the scout wing's; `<wing>:<rest>` names a known wing, else null. */
export function parseWingRunId(runId: string): { wing: ScoutWing; night: string } | null {
  const i = runId.indexOf(":");
  if (i < 0) return { wing: DEFAULT_WING, night: runId };
  const w = runId.slice(0, i);
  if (!isWing(w) || w === DEFAULT_WING) return null;
  return { wing: w, night: runId.slice(i + 1) };
}

/** The word a packet title, a pile and a node carry for the wing (`scout 2026-10-24`, `muse 2026-10-24`). */
export const wingWord = (wing: ScoutWing): string => wing;
