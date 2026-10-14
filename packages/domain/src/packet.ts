import { z } from "zod";

import { candidateSchema } from "./candidate.ts";
import { packetIdSchema, partIdSchema, runIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { defineMachine } from "./transitions.ts";

// A PACKET: one pile at the Weir, decided at the Board in one of three desk
// modes (plan §2.1, §2.2). Every v1 decision surface — the forge cull, the
// extractor, Dojo, Strips triage, article approval, audio triage, the studio's
// per-step sign-off — is a packet `source`, not a screen of its own.

/** Where a pile came from (prototype model.js `sourceKind`). `trials` is the
 *  mechanism A/B the prototype draws as blind pairs; `step` is a Project
 *  part's gate (v1's per-step sign-off in /studio), and names its part. */
export const PACKET_SOURCES = ["forge", "extract", "dojo", "strips", "trials", "article", "triage", "step"] as const;
export const packetSourceSchema = z.enum(PACKET_SOURCES);
export type PacketSource = z.output<typeof packetSourceSchema>;

export const PACKET_MODES = ["matrix-cull", "blind-pair", "packet-review"] as const;
export const packetModeSchema = z.enum(PACKET_MODES);
export type PacketMode = z.output<typeof packetModeSchema>;

/**
 * Verdicts are cast while the packet is `open` (v1 lib/foundry/verdictLog.ts:
 * keyed revisioned patches, refused once the run is committed). The commit is
 * ONE act per packet and it is final — v1 deleted rejected plates and wrote
 * the catalogue in it, so there is nothing to reopen. A packet-review may
 * instead be `returned`: sent back for another turn with the operator's notes
 * (v1 articles, `awaiting-approval -> drafting`), and the next turn arrives as
 * a new packet. There is no `committing` state: v1's commit runs under one
 * lock with a write-ahead journal line, and a crash mid-commit leaves the
 * packet `open` for an idempotent retry (lib/foundry/catalogue.ts), which a
 * durable half-state would only make harder to reason about.
 */
export const packetMachine = defineMachine({
  open: ["committed", "returned"],
  committed: [],
  returned: [],
});
export const packetStateSchema = z.enum(packetMachine.states);
export type PacketState = z.output<typeof packetStateSchema>;

export const packetSchema = z
  .object({
    id: packetIdSchema,
    lane: mediaLaneSchema,
    source: packetSourceSchema,
    mode: packetModeSchema,
    items: z.array(candidateSchema).min(1),
    state: packetStateSchema,
    runId: runIdSchema.optional(),
    partId: partIdSchema.optional(),
  })
  .superRefine((p, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (new Set(p.items.map((c) => c.id)).size !== p.items.length) issue("items", "candidate ids are unique within a packet");
    if (p.mode === "blind-pair") {
      const rows = new Map<string, number>();
      for (const c of p.items) {
        if (c.row === undefined) issue("items", `blind-pair candidate ${c.id} names no pair`);
        else rows.set(c.row, (rows.get(c.row) ?? 0) + 1);
      }
      for (const [row, n] of rows) if (n !== 2) issue("items", `pair ${row} has ${n} arms; a blind pair has two`);
    }
    if (p.source === "step" && p.partId === undefined) issue("partId", "a step packet names the part it gates");
    if (p.state === "returned" && p.mode !== "packet-review") issue("state", "only a packet review is sent back for another turn");
  });
export type Packet = z.output<typeof packetSchema>;
