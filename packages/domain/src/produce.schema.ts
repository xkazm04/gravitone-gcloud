import { UNIT_INPUTS } from "@gt/catalog/recipes";
import { z } from "zod";

import { usdSchema } from "./estimate.ts";
import type { ComposerInput } from "./produce.ts";

// THE DOORS for the produce contract (./produce.ts, zod-free). Kept apart so a client that only
// holds the shapes never loads zod; a server action parses here before the kernel sees anything.
// The composer union is pinned to its contract type by `satisfies`; the two optional-field shapes
// cannot be (zod's output spells an optional as `T | undefined`, which exactOptionalPropertyTypes
// keeps apart from an absent key), so test/produce.test.ts holds them to the contract instead.

const text = z.string().trim().min(1).max(4000);

export const composerInputSchema = z.union([
  z.object({ lane: z.literal("image"), text, mechanisms: z.array(z.enum(["text", "ref-early"])).min(1), styleId: z.string().min(1) }).strict(),
  z.object({ lane: z.literal("image"), text, mechanisms: z.array(z.enum(["text", "ref-early"])).min(1), sweep: z.literal(true) }).strict(),
  z.object({ lane: z.literal("article"), text, topic: z.string().trim().min(1) }).strict(),
  z.object({ lane: z.literal("audio"), text, kind: z.enum(["music", "sfx"]) }).strict(),
  z.object({ lane: z.literal("video"), text, subject: z.string().trim().min(1) }).strict(),
]) satisfies z.ZodType<ComposerInput>;

export const composeInputSchema = z
  .object({
    recipe: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    styleId: z.string().min(1).optional(),
    takeId: z.string().min(1).optional(),
    topic: z.string().trim().min(1).optional(),
    units: z.partialRecord(z.enum(UNIT_INPUTS), z.number().int().positive()).optional(),
  })
  .strict();

export const partPatchSchema = z
  .object({ option: z.string().min(1).optional(), units: z.number().int().positive().optional() })
  .strict()
  .refine((p) => p.option !== undefined || p.units !== undefined, { message: "a part change names an option, units, or both" });

export const ceilingUsdSchema = usdSchema.positive().max(10_000);
export const receiptModeSchema = z.enum(["dry", "live"]);
