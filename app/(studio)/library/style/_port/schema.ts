// The style port's wire doors (zod): what a Server Action admits before the side sees it. The
// shapes are @gt/domain/styleView's `StyleOp` and `StyleAct`; the bounds are this door's - a name
// a person types, an element list a person keeps, a note of one line ("rejection without a note
// is half a decision", and a paragraph is not a note). The palette rule is the record's own
// (@gt/domain/style `styleBlockSchema`), so a block the door admits is a block the record admits;
// the receipt mode is the produce door's (@gt/domain/produce.schema `receiptModeSchema`).
import { z } from "zod";

import { styleBlockSchema } from "@gt/domain/style";

const id = z.string().min(1).max(200);

/** A style id as every verb takes it (the load's door is this too). */
export const styleIdSchema = id;

const note = z.string().trim().min(1).max(400);

export const styleOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set-block"), block: styleBlockSchema }).strict(),
  z.object({ kind: z.literal("set-elements"), elements: z.array(z.string().min(1).max(60)).max(40) }).strict(),
  z.object({ kind: z.literal("judge-proof"), proofId: id, state: z.enum(["pending", "approved", "rejected"]), note: note.optional() }).strict(),
  z.object({ kind: z.literal("remove-proof"), proofId: id }).strict(),
  z.object({ kind: z.literal("promote-proof"), proofId: id }).strict(),
  z.object({ kind: z.literal("lock") }).strict(),
  z.object({ kind: z.literal("duplicate"), name: z.string().trim().min(1).max(120).optional() }).strict(),
  z.object({ kind: z.literal("rename"), name: z.string().trim().min(1).max(120) }).strict(),
]);

export const styleOpRequestSchema = z.object({ styleId: id, baseRev: z.number().int().positive(), op: styleOpSchema }).strict();

// A trial named twice is two priced plates the landing then refuses (one plate id per trial per
// receipt): each trial once.
const trialIds = z
  .array(id)
  .min(1)
  .max(5)
  .refine((ts) => new Set(ts).size === ts.length, { message: "each trial is rendered once per receipt" });

export const styleActSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("adopt"), fromStyleId: id }).strict(),
  z.object({ kind: z.literal("generate-proofs"), styleId: id, baseRev: z.number().int().positive(), trialIds }).strict(),
]);
