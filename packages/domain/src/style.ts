import { DISCIPLINES } from "@gt/catalog/projects";
import type { ColorRole } from "@gt/catalog/style";
import { z } from "zod";

import { blobRefSchema } from "./blob.ts";
import type { Parsed } from "./door.ts";
import { runIdSchema, styleIdSchema } from "./ids.ts";
import { keptCells, PROVEN_KEEPS, statusOf } from "./style.ratchet.ts";
import { styleMachine } from "./style.machine.ts";

// A STYLE: a visual identity the studio can reproduce, earned at the Weir and ratified in the
// atelier (plan §2.2, §3.1, Phase 5 decision 1). ONE record where v1 kept two: the catalogue
// entry (lib/foundry/types.ts `StyleDef`, in pipeline/foundry/styles.json, written by six
// writers through lib/foundry/catalogue.ts) and the theme (lib/themes.ts `Theme`, in the
// browser's IndexedDB, written by any surface). The catalogue half says what the style IS
// (observables, recipe, negative, the forge's evidence); the theme half says how it is DRAWN
// (the four-slot block, its elements, the proof sheet) and when it was locked. v1 joined them
// by a pointer (`foundryStyleId`) that nothing kept true; here they cannot disagree.

/** The table and its union live in ./style.machine.ts, zod-free, so a client can hold them. */
export { styleMachine, type StyleStatus } from "./style.machine.ts";
export { PROVEN_KEEPS } from "./style.ratchet.ts";
export const styleStatusSchema = z.enum(styleMachine.states);

const isoSchema = z.iso.datetime();

export const evidenceSchema = z.object({
  run: runIdSchema,
  scene: z.string().min(1),
  mechanism: z.string().min(1),
  verdict: z.enum(["keep", "reject"]),
  at: isoSchema,
  /** Required here; a v1 row without it was a human's, and imports as "operator". */
  by: z.enum(["operator", "agent"]),
});
export type Evidence = Parsed<z.output<typeof evidenceSchema>>;

/** A file that shows the style outside the forge (v1 `Exemplar`, extract's). */
export const exemplarSchema = z
  .object({
    role: z.enum(["source", "replica", "transfer"]),
    media: blobRefSchema,
    run: runIdSchema,
    /** Where v1 kept the file, run-relative (`sources/s01.png`): lineage, and what the v1 Foundry
     *  shelf serves it by until that shelf retires. The bytes are `media`. */
    file: z.string().min(1).optional(),
    /** Why a replica's critique loop stopped. `generation-failed` and
     *  `no-usable-fix` mean it was ABANDONED — kept as material, never as
     *  proof that the recipe produces the style. */
    settled: z.enum(["round-cap", "generation-failed", "target-met", "no-usable-fix"]).optional(),
  })
  .refine((e) => e.settled === undefined || e.role === "replica", { message: "only a replica has a settle reason", path: ["settled"] });

const COLOR_ROLES: { readonly [K in ColorRole]: K } = { ground: "ground", objects: "objects", accent: "accent" };

/** @gt/catalog's style block rule: exactly three colours, one per role, so the
 *  model is never left to re-cast which colour carries meaning. */
export const paletteSchema = z
  .array(z.object({ name: z.string().min(1), hex: z.string().regex(/^#[0-9a-f]{6}$/i), role: z.enum(COLOR_ROLES) }))
  .length(3)
  .refine((p) => new Set(p.map((c) => c.role)).size === 3, { message: "a palette has one colour per role" });

/** The four slots (@gt/catalog/style `StyleBlock`), in plain language: what the operator edits. */
export const styleBlockSchema = z.object({
  technique: z.string(),
  subject: z.string(),
  palette: paletteSchema,
  finish: z.string(),
});

/** One rendered reference on the sheet (v1 lib/themes.ts `Proof`; base64 became a blob). */
export const proofSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  media: blobRefSchema,
  state: z.enum(["pending", "approved", "rejected"]),
  note: z.string().min(1).optional(),
  /** Which trial it answered; absent = a free subject, or a proof kept before lineage. */
  trialId: z.string().min(1).optional(),
  /** `blockDigest(block)` at render time; absent = before lineage (reported, never guessed). */
  blockDigest: z.string().regex(/^[0-9a-f]{8}$/).optional(),
  model: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  /** Absent when the vendor said nothing: counted as unpriced, never as free. */
  costUsd: z.number().nonnegative().optional(),
  /** Where the picture came from when it was not rendered for this sheet (`forge:<run>/<rel>`). */
  source: z.string().min(1).optional(),
  /** When it was put on the Library shelf (v1 parts.tsx promote). */
  promotedAt: isoSchema.optional(),
  at: isoSchema,
});
export type StyleProof = Parsed<z.output<typeof proofSchema>>;

export const styleSchema = z
  .object({
    id: styleIdSchema,
    name: z.string().trim().min(1),
    family: z.string().trim().min(1),
    /** DERIVED (./style.ratchet.ts `statusOf`): the door refuses a record whose status its own
     *  evidence and lock do not give. Stored so a reader can filter without the function. */
    status: styleStatusSchema,
    /** `readback` — read off a reference by a vision model; `authored` — written by hand;
     *  `extracted` — grouped from a gallery by Extract and kept at the Weir; `preset`, `plate`,
     *  `foundry` — v1 themes started from a preset, forked off a plate, adopted from the Foundry. */
    origin: z.object({
      kind: z.enum(["readback", "authored", "extracted", "preset", "plate", "foundry"]),
      source: z.string().min(1).optional(),
      models: z.array(z.string().min(1)).optional(),
      /** A readback's one-line description of the look (acquire.py), and whether the operator
       *  has since edited the recipe by hand - the readback is a hypothesis until then. */
      signature: z.string().optional(),
      edited: z.boolean().optional(),
      presetId: z.string().min(1).optional(),
    }),
    /** The style this one was duplicated from: lineage, never a live pointer. */
    duplicatedFrom: styleIdSchema.optional(),
    /** The kind of video it was made for. Untagged means every discipline (v1 `styleFits`). */
    discipline: z.enum(DISCIPLINES).optional(),
    /** The fixed vocabulary the Library facets on (render_mode, palette_strategy, …). */
    observables: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.string().min(1)),
    recipe: z.string().trim().min(1),
    negative: z.string(),
    palette: paletteSchema.optional(),
    /** Absent on a catalogue style nobody has adopted yet: it has no look to proof or lock. */
    block: styleBlockSchema.optional(),
    elements: z.array(z.string().min(1)).default([]),
    evidence: z.array(evidenceSchema),
    exemplars: z.array(exemplarSchema).default([]),
    proofs: z.array(proofSchema).default([]),
    /** THE LOCK EVENT: who locked it and when. Never cleared (the machine has no way out). */
    /** `grandfathered`: locked in v1 under v1's gate and imported locked (ruled 2026-10-17); a
     *  lock made here never carries it, so the record says which gate each lock passed. */
    lock: z.object({ at: isoSchema, by: z.string().min(1), grandfathered: z.literal(true).optional() }).optional(),
  })
  .superRefine((s, ctx) => {
    // The ratchet reads the parsed shape (absent, never undefined); the lock is its only optional input.
    const read = { evidence: s.evidence, ...(s.lock === undefined ? {} : { lock: { at: s.lock.at, by: s.lock.by } }) };
    const derived = statusOf(read);
    if (s.status !== derived) {
      const cells = keptCells(read);
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: `status is derived: this record reads ${derived}, not ${s.status} (operator keeps in ${cells} of ${PROVEN_KEEPS} distinct run/scene cells${s.lock === undefined ? ", no lock" : ", locked"})`,
      });
    }
    if (s.block === undefined && (s.proofs.length > 0 || s.lock !== undefined))
      ctx.addIssue({ code: "custom", path: ["block"], message: "a proof sheet or a lock needs a block: proofs are renders of one" });
    const ids = s.proofs.map((p) => p.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["proofs"], message: "proof ids are unique on a sheet" });
  });
export type Style = Parsed<z.output<typeof styleSchema>>;
