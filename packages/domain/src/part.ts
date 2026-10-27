import { OPERATOR_KINDS, WORK_KINDS } from "@gt/catalog/recipes";
import { z } from "zod";

import { partIdSchema } from "./ids.ts";
import { partMachine } from "./part.machine.ts";

// A PART: one line of a Project's plan (plan §2.2). What is STORED is the plan's choice - the
// model option and the units - and the parts it waits for. Its lane, model, price and STATE are
// read, never written: lane/model/price from the option table at read
// (packages/kernel/src/records/options.ts), state from its job and its gate packet
// (./plan.ts `partStatesOf`). v1's project record carried a per-step `progress` that surfaces wrote
// by hand (lib/projects.ts reportPhase) and that drifted from what had actually run; a state that
// is derived cannot drift.
//
// Phase 0 drew a gate as a PROPERTY of the part it judges (`gate: "verdict"`). Phase 4 makes it a
// part of its own (COMMON decision 10, the prototype's `gate:frames`), because a gate is not a job:
// it is a Board packet, opened when its upstream is done and ratified by its commit, and the
// parts after it wait for THAT, not for the job before it. The calendar slot is the same kind of
// act. Dropped from Phase 0's kinds: `draft`, `critique` (steps inside one article run, not parts)
// and `publish` (the slot).

export const PART_KINDS = [...WORK_KINDS, ...OPERATOR_KINDS] as const;
export const partKindSchema = z.enum(PART_KINDS);
export type PartKind = z.output<typeof partKindSchema>;
export const workKindSchema = z.enum(WORK_KINDS);

export const gateVerdictSchema = z.enum(["matrix-cull", "pick", "packet-review"]);

/** The table and its union live in ./part.machine.ts, zod-free, so a client can hold them. */
export { partMachine, type PartState } from "./part.machine.ts";
export const partStateSchema = z.enum(partMachine.states);

const after = z.array(partIdSchema);

/** What the operator confirmed at launch: the figures the receipt showed for this part. */
export const quotedSchema = z.object({ seconds: z.number().nonnegative(), usd: z.number().nonnegative().nullable() });

export const workPartSchema = z.object({
  id: partIdSchema,
  kind: workKindSchema,
  /** A ModelOption key (`<kind>/<provider>/<model>`). */
  option: z.string().min(1),
  units: z.number().int().positive(),
  after,
  quoted: quotedSchema.optional(),
});

export const gatePartSchema = z.object({ id: partIdSchema, kind: z.literal("gate"), judges: partIdSchema, verdict: gateVerdictSchema, after });
export const slotPartSchema = z.object({ id: partIdSchema, kind: z.literal("slot"), after });

export const partSchema = z.discriminatedUnion("kind", [workPartSchema, gatePartSchema, slotPartSchema]).superRefine((p, ctx) => {
  if (new Set(p.after).size !== p.after.length) ctx.addIssue({ code: "custom", path: ["after"], message: "a part names each dependency once" });
  if (p.after.includes(p.id)) ctx.addIssue({ code: "custom", path: ["after"], message: "a part cannot wait for itself" });
  if (p.kind === "gate" && !p.after.includes(p.judges))
    ctx.addIssue({ code: "custom", path: ["judges"], message: `a gate waits for the part it judges (${p.judges})` });
});
export type Part = z.output<typeof partSchema>;
/** A part before its door: ids are plain strings until `partSchema` mints them. */
export type PartInput = z.input<typeof partSchema>;
export type WorkPart = z.output<typeof workPartSchema>;

const OPERATOR: ReadonlySet<string> = new Set(OPERATOR_KINDS);
/** A work part, by the catalogue's own list of the kinds that are not (gate, slot, ...). */
export const isWork = (p: Part): p is WorkPart => !OPERATOR.has(p.kind);
