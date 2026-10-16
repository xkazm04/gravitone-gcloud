import "server-only";

import { z } from "zod";

import { PART_ACTS } from "@gt/domain/partView";

// THE DOOR every part edit passes before it reaches a side: the `PartOp` union of
// @gt/domain/partView as zod, strict (an extra field is a refusal, not a silent drop). The domain
// contract is zod-free so the client can hold it; this is the server's copy of its shape, and
// L36's records module validates the same union at its own door (lift it there when it lands).

const id = z.string().trim().min(1).max(200);
const text = (max: number) => z.string().max(max);
const note = z.enum(["more-focus", "less-focus", "descope", "move-earlier", "move-later", "custom"]);
const field = z.enum(["product", "audience", "proposition", "tone", "mustInclude", "cta", "platform"]);
const o = <S extends z.ZodRawShape>(shape: S) => z.object(shape).strict();

export const researchOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("descope"), cardId: id }),
  o({ op: z.literal("restore"), cardId: id }),
  o({ op: z.literal("like"), cardId: id, on: z.boolean() }),
  o({ op: z.literal("deepen"), cardId: id, on: z.boolean() }),
  o({ op: z.literal("confirm-scope") }),
  o({ op: z.literal("queue-follow-up"), prompt: text(500), cardId: id.optional() }),
  o({ op: z.literal("drop-follow-up"), id }),
  o({ op: z.literal("decide-effect"), followUpId: id, index: z.number().int().min(0).max(50), decision: z.enum(["applied", "rejected"]) }),
  o({ op: z.literal("set-face"), face: z.enum(["notebook", "beats"]) }),
  o({ op: z.literal("pick-beat"), slotId: id, variantId: id.nullable() }),
  o({ op: z.literal("compose-spine") }),
  o({ op: z.literal("set-brief"), field, value: z.union([text(300), z.array(text(120)).max(8)]) }),
  o({ op: z.literal("pick-idea"), ideaId: id }),
]);

export const scriptOpSchema = z.discriminatedUnion("op", [
  o({ op: z.literal("adopt"), candidateId: id.nullable() }),
  o({ op: z.literal("note-add"), cardId: id, kind: note, text: text(500).optional() }),
  o({ op: z.literal("note-remove"), noteId: id }),
  o({ op: z.literal("accept"), versionId: id }),
  o({ op: z.literal("accept-over-gate"), versionId: id }),
  o({ op: z.literal("discard-staged"), versionId: id }),
  o({ op: z.literal("restore-version"), versionId: id }),
  o({ op: z.literal("patch-beat"), beatId: id, label: text(200).optional(), text: text(2000).optional() }),
  o({ op: z.literal("set-connector"), beatId: id, connector: z.enum(["BUT", "THEREFORE", "AND THEN"]) }),
  o({ op: z.literal("reset-beat"), beatId: id }),
  o({ op: z.literal("pick-scenario"), scenarioId: id }),
]);

export const partOpSchema = z.union([researchOpSchema, scriptOpSchema]);
export const partActSchema = z.enum([...PART_ACTS.research, ...PART_ACTS.script]);
export const address = { projectId: id, key: z.string().regex(/^[a-z][a-z:-]{0,40}$/) };
