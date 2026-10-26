import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema, type CandidateId, type PacketId } from "@gt/domain/ids";
import { packetSchema, type Packet } from "@gt/domain/packet";
import { eventsMigrations } from "../src/events.ts";
import { decisionMigrations } from "../src/decision/schema.ts";
import { calibrationMigrations } from "../src/calibration/series.ts";
import { consequenceToken } from "../src/decision/consequence.ts";
import { currentDecisions } from "../src/decision/read.ts";
import type { Store } from "../src/store.ts";
import { must } from "./helpers.ts";

// Packets for the decision, calibration and blind tests. Ids and grades follow
// the prototype's forge pile (docs/next/prototype/app/model.js): scenes as
// matrix rows, a judge score on each arm of a trials pair.

export const MODULES = [eventsMigrations, decisionMigrations, calibrationMigrations];

const SHA = "9f2c6a1e0b7d4c3f8a5e2d1c0b9a8f7e6d5c4b3a29180f7e6d5c4b3a2918a0b1";

export const pid = (s: string): PacketId => must(parseAt("t", packetIdSchema, s));
export const cid = (s: string): CandidateId => must(parseAt("t", candidateIdSchema, s));

type Item = { id: string; row?: string; judge?: number };

export function packet(id: string, mode: Packet["mode"], items: readonly Item[], source?: Packet["source"]): Packet {
  return must(
    parseAt("fixture packet", packetSchema, {
      id,
      lane: "image",
      source: source ?? (mode === "blind-pair" ? "trials" : mode === "packet-review" ? "article" : "forge"),
      mode,
      state: "open",
      items: items.map((it) => ({
        id: it.id,
        jobId: `job-${it.id}`,
        media: { sha256: SHA, bytes: 1024, mime: "image/png" },
        ...(it.row === undefined ? {} : { row: it.row }),
        grades:
          it.judge === undefined
            ? []
            : [{ field: "judge", value: it.judge, series: "gemini@abc123", calibration: { status: "insufficient", short: "floor", nKeep: 0, nReject: 0 } }],
      })),
    }),
  );
}

/** A forge pile: two scenes of three plates. */
export const cull = (id = "run-0412"): Packet =>
  packet(id, "matrix-cull", [
    { id: "s1/a", row: "s1" }, { id: "s1/b", row: "s1" }, { id: "s1/c", row: "s1" },
    { id: "s2/a", row: "s2" }, { id: "s2/b", row: "s2" }, { id: "s2/c", row: "s2" },
  ]);

export const operator = { by: "operator", surface: "board", who: "op-kazda" } as const;
export const agent = { by: "agent", surface: "cli", who: "agent-forge" } as const;

/** The v1 digest a test's adapter "read" (the kernel never reads v1; it only carries the digest). */
export const V1 = "v1-state-0412";

/** What a Board preview would hand the commit: the token over the current decisions and `v1`. */
export function preview(s: Store, packetId: PacketId, v1: string = V1): { token: string; v1Digest: string } {
  const decisions = must(s.read((r) => currentDecisions(r, packetId))).decisions;
  return { token: consequenceToken(decisions, v1), v1Digest: v1 };
}
