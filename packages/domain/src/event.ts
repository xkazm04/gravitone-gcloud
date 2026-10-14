import { z } from "zod";

// THE LEDGER RECORD (plan §2.2 `Event`, §4 "the ledger is the spine").
//
// One row per act, written by @gt/kernel/events in the same transaction as the
// state change it records. The schema lives here, below the kernel, because the
// Ledger route, the CLI's `ledger query` and an agent reading the feed all
// parse the same record; only the kernel writes it.
//
// Absorbed from the prototype's ledger (docs/next/prototype/app/ledger-data.js):
// its rows carried `costUsd: number | null` beside a separate `costSrc`, so a
// figure and the word for where it came from could drift apart (a null cost
// with a "real" source, a number with none). Here they are one optional value,
// `cost: {usd, src}`: an unpriced act has no `cost` key at all, and a priced one
// cannot exist without its provenance.

export const ACTOR_KINDS = ["operator", "agent", "machine"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** Where a cost figure comes from. Only `real` is money that left an account. */
export const COST_SOURCES = ["real", "model", "illustrative"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

/** A dotted, lowercase act name: `job.lease`, `verdict.keep`, `commit`. The
 *  prototype's facets filter on the first segment (`job.*`), so it is the group. */
const TYPE_RE = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;
const KIND_RE = /^[a-z][a-z0-9-]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export const actorSchema = z.object({ kind: z.enum(ACTOR_KINDS), id: z.string().min(1) });
export type Actor = z.output<typeof actorSchema>;

/** What the act was about. `id` is any record's id, so it is a plain string:
 *  a subject points at runs, packets, styles and slots alike. */
export const subjectSchema = z.object({ kind: z.string().regex(KIND_RE), id: z.string().min(1) });
export type Subject = z.output<typeof subjectSchema>;

/** A refund is a negative figure, so the sign is free; the value must be finite. */
export const costSchema = z.object({ usd: z.number(), src: z.enum(COST_SOURCES) });
export type Cost = z.output<typeof costSchema>;

/** Plain JSON: what survives a JSON round trip unchanged, in any language. */
function isJson(v: unknown): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(isJson);
  if (typeof v !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(v);
  // An undefined value is an absent key: the door drops it before the ledger sees it.
  return (proto === Object.prototype || proto === null) && Object.values(v).every((x) => x === undefined || isJson(x));
}

/** An act's details: always an object (a bag keyed by name, never a bare
 *  scalar), plain JSON all the way down. Typed as `unknown` values on purpose:
 *  each event type reads its own keys through its own schema, and a recursive
 *  JSON type would make every consumer's types infinitely deep. */
export const eventDataSchema = z.record(z.string(), z.unknown()).refine(isJson, "data must be plain JSON (finite numbers, no undefined, no class instances)");
export type EventData = z.output<typeof eventDataSchema>;

export const eventTypeSchema = z.string().regex(TYPE_RE);
export const hashSchema = z.string().regex(HASH_RE);

/** What a writer hands the ledger. `seq`, `at` and both hashes are the
 *  ledger's to assign, so a caller cannot forge them. */
export const eventInputSchema = z.object({
  actor: actorSchema,
  type: eventTypeSchema,
  subject: subjectSchema,
  lane: z.string().min(1).optional(),
  cost: costSchema.optional(),
  data: eventDataSchema,
});
export type EventInput = z.output<typeof eventInputSchema>;

export const eventSchema = eventInputSchema.extend({
  seq: z.number().int().positive(),
  at: z.iso.datetime(),
  prevHash: hashSchema,
  hash: hashSchema,
});
export type Event = z.output<typeof eventSchema>;
