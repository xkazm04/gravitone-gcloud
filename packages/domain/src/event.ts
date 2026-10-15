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

/** How an event's `occurredAt` is known (COMMON decision 1). `recorded`: the
 *  source wrote the instant down when it happened (a manifest's `created`, a
 *  log line's `at`). `derived`: the instant was inferred - the sync observed a
 *  rewritten field and stamps its own clock, never a fabricated past time. The
 *  prototype spelled the first `real` (ledger-data.js `atSrc`), the same word as
 *  a cost's source; here the two vocabularies share no word. */
export const AT_SOURCES = ["recorded", "derived"] as const;
export type AtSource = (typeof AT_SOURCES)[number];

/** A projection's natural key, `<source>:<recordId>:<fact>` - the identity
 *  that makes re-running a projection append nothing it appended before. */
export const eventKeySchema = z.string().min(3).max(512).regex(/^[a-z][a-z0-9-]*:[^\s:][^\s]*$/);

// The two clocks travel together: an `occurredAt` without the word for how it
// is known is the prototype's `costUsd` without `costSrc` again.
const clocksPaired = (e: { occurredAt?: string | undefined; atSrc?: AtSource | undefined }): boolean =>
  (e.occurredAt === undefined) === (e.atSrc === undefined);
const PAIRED = { message: "occurredAt and atSrc come together or not at all", path: ["atSrc"] };

/** What a writer hands the ledger. `seq`, `at` and both hashes are the
 *  ledger's to assign, so a caller cannot forge them. `occurredAt`/`atSrc`/
 *  `key` are a PROJECTION's: an act the kernel itself performs happens at `at`
 *  and has no natural key; a fact projected from a v1 store happened earlier,
 *  and carries when and how that is known, plus the key that dedupes it. */
const inputShape = z.object({
  actor: actorSchema,
  type: eventTypeSchema,
  subject: subjectSchema,
  lane: z.string().min(1).optional(),
  cost: costSchema.optional(),
  data: eventDataSchema,
  // UTC `Z` with milliseconds, exactly `Date#toISOString`'s shape, like `at`:
  // the index orders by string, and "…00Z" sorts AFTER "…00.500Z" ('.' < 'Z'),
  // so a second-precision v1 stamp (forge.py's `+00:00`) is normalised at the
  // adapter, never stored as written.
  occurredAt: z.iso.datetime({ precision: 3 }).optional(),
  atSrc: z.enum(AT_SOURCES).optional(),
  key: eventKeySchema.optional(),
});
export const eventInputSchema = inputShape.refine(clocksPaired, PAIRED);
export type EventInput = z.output<typeof eventInputSchema>;

export const eventSchema = inputShape
  .extend({
    seq: z.number().int().positive(),
    at: z.iso.datetime(),
    prevHash: hashSchema,
    hash: hashSchema,
  })
  .refine(clocksPaired, PAIRED);
export type Event = z.output<typeof eventSchema>;

/** The instant the Ledger orders and filters by: when it happened if known, else when it was recorded. */
export const eventTime = (e: Pick<Event, "at" | "occurredAt">): string => e.occurredAt ?? e.at;
