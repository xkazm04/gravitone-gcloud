import { z } from "zod";

import { blobRefSchema } from "../blob.ts";
import { err, ok, type Result } from "../errors.ts";
import { defineStepRecord, textOrNull, versionField } from "./record.ts";

// THE FRAMES PART'S RECORDS (v1 app/_phases/frames/records.ts, lib/frames/stepData.ts,
// lib/frames/alternatives/alts.ts, app/_phases/_shared/records/ads.ts ads-shots).
//
// THE ONE SHAPE CHANGE IN THIS LOT, and why it is a version bump: v1 `frames` v2 held every
// plate as a base64 data: URL, twice - in `units` and again in the `frames` shadow rebuilt from
// them (useFrames.ts:11-15, 420) - about 5 MB a cut, and `frames-alts` about 1.5 MB a scene.
// Here a plate's bytes are a BLOB REF (the kernel's content-addressed store) and the record
// holds `units` only:
//   frames v3       units with `plate.blob`; no `frames` shadow (a reader that wants frames
//                   derives them, lib/frames/picture/unit.ts framesFromUnits);
//   frames-alts v2  every alternative's plate the same way.
// The walk up from v1's versions is pure where it can be and REFUSES where it cannot: a plate
// whose `src` is a data: URL needs the blob store to become a ref, which is the importer's act
// (wave D), not a migration's. v1 `frames` v1 (the positional frame list) needs v1's own
// `framesV1ToV2` (app/_phases/frames/picture/migrate.ts), which reads the render registry; the
// importer runs it on the browser side first.

const PLATE_STATES = ["empty", "generating", "ready", "refused"] as const;

// A data: URL as a browser reads one: the scheme is case-insensitive (RFC 2397 over RFC 3986) and a
// src's leading whitespace is stripped before it is parsed, so `DATA:` and ` data:` are inline bytes too.
const INLINE = /^\s*data:/i;
const isInline = (src: string): boolean => INLINE.test(src);

export const plateSchema = z
  .looseObject({
    state: z.enum(PLATE_STATES),
    /** The plate's bytes in the blob store. */
    blob: blobRefSchema.optional(),
    /** A public path is allowed; inline bytes are not (see the header). */
    src: z.string().optional(),
    model: z.string().optional(),
    costUsd: z.number().nonnegative().optional(),
    subject: z.string().optional(),
    /** The subject the pixels were rendered from: differs from `subject` = the plate is stale. */
    renderedSubject: z.string().optional(),
    receipt: z.string().optional(),
  })
  .refine((p) => p.src === undefined || !isInline(p.src), { message: "a plate carries its bytes as a blob ref, never a data: URL" });

const textSchema = z.looseObject({ role: z.string(), factId: z.string().optional() });

export const unitSchema = z.looseObject({
  id: z.string().min(1),
  kind: z.enum(["beat", "shot"]).optional(),
  plate: plateSchema,
  clip: z.looseObject({ status: z.string(), motion: z.string() }).default({ status: "not-started", motion: "" }),
  elements: z.array(z.looseObject({})),
  texts: z.array(textSchema),
});

const inlineBytes = (x: unknown): boolean => typeof x === "object" && x !== null && "src" in x && typeof x.src === "string" && isInline(x.src);

function refuseInline(where: string, plates: readonly unknown[]): Result<null> {
  const n = plates.filter(inlineBytes).length;
  return n === 0 ? ok(null) : err("invalid", `${where}: ${n} plate(s) carry base64 bytes; they enter through the importer, which writes them to the blob store`);
}

const platesOf = (units: unknown): unknown[] => (Array.isArray(units) ? units.map((u: unknown) => (typeof u === "object" && u !== null && "plate" in u ? u.plate : undefined)) : []);

export const FRAMES = defineStepRecord({
  key: "frames",
  owner: "frames",
  version: 3,
  migrate: {
    1: () => err("invalid", "a v1 frames record (the positional frame list) walks up through v1's framesV1ToV2 in the importer"),
    2: (raw) => {
      const r = refuseInline("frames", platesOf(raw["units"]));
      if (!r.ok) return r;
      const { frames: _shadow, ...rest } = raw;
      void _shadow;
      return ok(rest);
    },
  },
  schema: z
    .looseObject({
      ...versionField,
      units: z.array(unitSchema),
      /** The chain the units were derived from; another chain is another cut. */
      renderId: z.string(),
      direction: z.looseObject({ runs: z.number().int().nonnegative() }).optional(),
      turn: z.string().optional(),
    })
    .refine((r) => !("frames" in r), { message: "frames v3 holds units only; the frames shadow is derived, never stored" }),
});

const altSchema = z.looseObject({ id: z.string().min(1), plate: plateSchema, createdAt: z.number().optional(), seeded: z.boolean().optional() });

export const FRAMES_ALTS = defineStepRecord({
  key: "frames-alts",
  owner: "frames",
  version: 2,
  migrate: {
    1: (raw) => {
      const scenes = typeof raw["byFrame"] === "object" && raw["byFrame"] !== null ? Object.values(raw["byFrame"]) : [];
      const plates = scenes.flatMap((s: unknown) => (typeof s === "object" && s !== null && "alts" in s && Array.isArray(s.alts) ? platesOf(s.alts) : []));
      const r = refuseInline("frames-alts", plates);
      return r.ok ? ok({ ...raw }) : r;
    },
  },
  // Keyed by PICTURE UNIT id, so another render's scenes can never be handed these plates.
  schema: z.looseObject({
    ...versionField,
    byFrame: z.record(z.string(), z.looseObject({ activeId: z.string().nullable().optional(), alts: z.array(altSchema) })).default({}),
  }),
});

export const ADS_SHOTS = defineStepRecord({
  key: "ads-shots",
  owner: "frames",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    /** The scenario the takes were made for: another picked scenario makes them stale. */
    scenarioId: textOrNull.default(null),
    shots: z
      .record(
        z.string(),
        z.looseObject({
          imageTakes: z.array(z.string()).default([]),
          adoptedImage: textOrNull.default(null),
          clips: z.array(z.looseObject({ id: z.string().min(1), status: z.string().optional() })).default([]),
          adoptedClip: textOrNull.default(null),
        }),
      )
      .default({}),
  }),
});
