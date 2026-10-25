import { UNIT_INPUTS } from "@gt/catalog/recipes";
import { z } from "zod";

import { usdSchema } from "./estimate.ts";
import { IMAGE_MECHANISMS, RECEIPT_MODES, type ComposerInput, type NativeProducer } from "./produce.ts";

// THE DOORS for the produce contract (./produce.ts, zod-free). Kept apart so a client that only
// holds the shapes never loads zod; a server action parses here before the kernel sees anything.
// The composer union is pinned to its contract type by `satisfies`; the two optional-field shapes
// cannot be (zod's output spells an optional as `T | undefined`, which exactOptionalPropertyTypes
// keeps apart from an absent key), so test/plan.test.ts holds them to the contract instead.

const text = z.string().trim().min(1).max(4000);

// The five composers, written once over the sentence rule each door takes: the launch's and the
// estimate's unions held two copies of every branch, and a branch dropped from one was invisible
// to tsc and to every test.
const mechanisms = z.array(z.enum(IMAGE_MECHANISMS)).min(1);
const composers = (sentence: z.ZodString) =>
  z.union([
    z.object({ lane: z.literal("image"), text: sentence, mechanisms, styleId: z.string().min(1) }).strict(),
    z.object({ lane: z.literal("image"), text: sentence, mechanisms, sweep: z.literal(true) }).strict(),
    z.object({ lane: z.literal("article"), text: sentence, topic: z.string().trim().min(1) }).strict(),
    z.object({ lane: z.literal("audio"), text: sentence, kind: z.enum(["music", "sfx"]) }).strict(),
    z.object({ lane: z.literal("video"), text: sentence, subject: z.string().trim().min(1) }).strict(),
  ]);

export const composerInputSchema = composers(text) satisfies z.ZodType<ComposerInput>;

/** The estimate's door: the composer union with the sentence allowed empty (the receipt is drawn before
 *  a word is typed; the launch takes `composerInputSchema`). Shared by the Floor's action and the MCP door. */
export const composerEstimateSchema = composers(z.string().max(4000)) satisfies z.ZodType<ComposerInput>;

/**
 * A producer's own launch (./produce.ts `ProducerRunInput`). Not pinned by `satisfies`: every
 * branch has optional fields, which zod spells `T | undefined` (see the header), so
 * test/plan.test.ts holds each branch's keys to the contract instead.
 */
const ref = z.string().trim().min(1).max(400);
const soundId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, "a sound-store id is letters, digits, _ and -");
const knob = (max: number) => z.number().int().positive().max(max);
export const producerRunInputSchema = z.union([
  z
    .object({
      producer: z.literal("extract"),
      slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "a slug is lower-case letters, digits and dashes"),
      sources: knob(1000),
      folder: ref.optional(),
      rounds: knob(10).optional(),
      replicas: knob(50).optional(),
      transfers: z.number().int().nonnegative().max(20).optional(), // v1 allows 0 transfers
      grouping: z.enum(["engine", "none"]).optional(),
    })
    .strict(),
  z.object({ producer: z.literal("article"), subject: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, "a subject is bundle/slug"), angle: text.optional() }).strict(),
  z.object({ producer: z.literal("article"), topic: text, angle: text.optional() }).strict(),
  z.object({ producer: z.literal("mv"), track: ref }).strict(),
  z.object({ producer: z.literal("suno"), proposal: ref }).strict(),
  z.object({ producer: z.literal("strips"), lane: z.enum(["edu", "stat", "all"]), only: z.array(ref).min(1).optional() }).strict(),
  z.object({ producer: z.literal("forge"), plan: ref }).strict(),
  z.object({ producer: z.literal("dojo"), cycle: ref }).strict(),
  // The sound store's id grammar (lib/sound/store.ts), and at most the desk's render ask (48).
  z.object({ producer: z.literal("hunt"), hunt: soundId, kind: z.enum(["music", "sfx"]), leaves: z.array(soundId).min(1).max(48) }).strict(),
]);

export const NATIVE_PRODUCERS = ["extract", "article", "mv", "suno", "strips", "forge", "dojo", "hunt"] as const satisfies readonly NativeProducer[];

/** What a Run was launched from (./produce.ts `RunInput`): a composer's input or a producer's own. */
export const runInputSchema = z.union([composerInputSchema, producerRunInputSchema]);
/** A run input as the door hands it on (zod's spelling of the optionals; see the header). */
export type ParsedRunInput = z.output<typeof runInputSchema>;

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
export const receiptModeSchema = z.enum(RECEIPT_MODES);
