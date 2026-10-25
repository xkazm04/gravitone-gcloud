import { z } from "zod";

import { candidateSchema } from "./candidate.ts";
import type { Parsed } from "./door.ts";
import { packetIdSchema, partIdSchema, runIdSchema } from "./ids.ts";
import { mediaLaneSchema } from "./lane.ts";
import { packetMachine } from "./packet.machine.ts";
import { PACKET_MODES, PACKET_SOURCES, SOURCES } from "./source.ts";

// A PACKET: one pile at the Weir, decided at the Board in one of three desk
// modes (plan §2.1, §2.2). Every v1 decision surface — the forge cull, the
// extractor, Dojo, Strips triage, article approval, audio triage, the studio's
// per-step sign-off — is a packet `source`, not a screen of its own.

/** The sources and modes live in ./source.ts, zod-free, beside each source's
 *  reason vocabulary; the enums here are built from the same arrays. */
export { PACKET_MODES, PACKET_SOURCES, type PacketMode, type PacketSource } from "./source.ts";
export const packetSourceSchema = z.enum(PACKET_SOURCES);
export const packetModeSchema = z.enum(PACKET_MODES);

/** The table and its union live in ./packet.machine.ts, zod-free, so a client can hold them. */
export { packetMachine, type PacketState } from "./packet.machine.ts";
export const packetStateSchema = z.enum(packetMachine.states);

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
    /** What the rail calls the pile (a run's name, an article's title), set by its adapter. */
    title: z.string().min(1).max(200).optional(),
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
    const modes: readonly string[] = SOURCES[p.source].modes;
    if (!modes.includes(p.mode)) issue("mode", `a ${p.source} packet is decided in ${modes.join(" or ")}, not ${p.mode}`);
    if (p.source === "step" && p.partId === undefined) issue("partId", "a step packet names the part it gates");
    if (p.state === "returned" && p.mode !== "packet-review") issue("state", "only a packet review is sent back for another turn");
  });
export type Packet = Parsed<z.output<typeof packetSchema>>;
