import type { EditorKind } from "@gt/domain/partView";

// WHICH PART ACT MAY BE PRICED LIVE - one act, by operator decision (2026-10-24, spark
// audio-postproduction-research wave 4: "live arming -> voice only, behind its priced receipt";
// a general part-act live path was rejected). Every other act's receipt and launch stay `dry`,
// whatever the environment says.
//
// A live receipt is still only a PRICE: nothing spends until the operator confirms its token, and
// that confirm is the arm (kernel dryrun `armLive`, attributed to the operator). It is live only
// when the process may run live (not GRAVITONE_DRY_ONLY=1) and the vendor's key is configured -
// a fresh clone with no key reads dry and records silent stand-ins, as before.
//
// Pure and client-free so its test pins it over every act of every kind (tests/next-server
// parts-act-mode.test.ts); real.ts reads the environment and passes it in.

export const LIVE_ACTS: ReadonlySet<string> = new Set(["voice:record-line"]);

export type ArmFacts = {
  /** GRAVITONE_DRY_ONLY=1: this process may only run dry. */
  readonly dryOnly: boolean;
  /** The live act's vendor key is configured (lib/music/elevenlabs.ts `isMusicConfigured`). */
  readonly keyed: boolean;
};

export function actModeOf(kind: EditorKind, act: string, facts: ArmFacts): "dry" | "live" {
  return !facts.dryOnly && facts.keyed && LIVE_ACTS.has(`${kind}:${act}`) ? "live" : "dry";
}
