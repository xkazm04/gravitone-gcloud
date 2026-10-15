import type { ColorRole } from "@gt/catalog/style";
import { z } from "zod";

import { blobRefSchema } from "./blob.ts";
import { runIdSchema, styleIdSchema } from "./ids.ts";
import { styleMachine } from "./style.machine.ts";

// A STYLE: a visual identity the studio can reproduce, earned at the Weir
// (plan §2.2, §3.1: the catalogue ratchet lives in the Library). The fields
// are v1's catalogue entry (lib/foundry/types.ts `StyleDef`, written by six
// writers through lib/foundry/catalogue.ts) — the ratchet reads every one.

/** The table and its union live in ./style.machine.ts, zod-free, so a client can hold them. */
export { styleMachine, type StyleStatus } from "./style.machine.ts";
export const styleStatusSchema = z.enum(styleMachine.states);

/** v1's promotion threshold: distinct run/scene cells an operator kept. */
export const PROVEN_KEEPS = 2;

export const evidenceSchema = z.object({
  run: runIdSchema,
  scene: z.string().min(1),
  mechanism: z.string().min(1),
  verdict: z.enum(["keep", "reject"]),
  at: z.iso.datetime(),
  /** Required here; a v1 row without it was a human's, and imports as "operator". */
  by: z.enum(["operator", "agent"]),
});
export type Evidence = z.output<typeof evidenceSchema>;

/** A file that shows the style outside the forge (v1 `Exemplar`, extract's). */
export const exemplarSchema = z
  .object({
    role: z.enum(["source", "replica", "transfer"]),
    media: blobRefSchema,
    run: runIdSchema,
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

export const styleSchema = z
  .object({
    id: styleIdSchema,
    name: z.string().trim().min(1),
    family: z.string().trim().min(1),
    status: styleStatusSchema,
    /** `readback` — read off a reference by a vision model; `authored` — written
     *  by hand; `extracted` — grouped from a gallery by Extract and kept at the Weir. */
    origin: z.object({
      kind: z.enum(["readback", "authored", "extracted"]),
      source: z.string().min(1).optional(),
      models: z.array(z.string().min(1)).optional(),
    }),
    /** The fixed vocabulary the Library facets on (render_mode, palette_strategy, …). */
    observables: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.string().min(1)),
    recipe: z.string().trim().min(1),
    negative: z.string(),
    palette: paletteSchema.optional(),
    evidence: z.array(evidenceSchema),
    exemplars: z.array(exemplarSchema).optional(),
  })
  .superRefine((s, ctx) => {
    if (s.status === "candidate") return;
    const kept = new Set(s.evidence.filter((e) => e.verdict === "keep" && e.by === "operator").map((e) => `${e.run}/${e.scene}`));
    if (kept.size < PROVEN_KEEPS)
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: `a ${s.status} style needs operator keeps in ${PROVEN_KEEPS} distinct run/scene cells; it has ${kept.size}`,
      });
  });
export type Style = z.output<typeof styleSchema>;
