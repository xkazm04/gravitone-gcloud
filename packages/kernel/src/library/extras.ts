import { z } from "zod";

import { GENRE_STATES, VENTURE_KINDS } from "@gt/domain/genre";
import { MODEL_CLASSES, MODEL_TECHNIQUES } from "@gt/domain/library";

// The detail's per-kind extras (@gt/domain/library `LibraryExtras`) as a door:
// checked when a source hands them over (./write.ts) and when the detail reads
// them back (./detail.ts), so a row edited by hand is refused, not drawn.

const nul = <T extends z.ZodType>(s: T) => s.nullable();
/** A genre or a venture a detail links to (@gt/domain/library NamedRef). */
const named = z.object({ id: z.string().min(1), name: z.string().min(1) });

export const audioFactsSchema = z.object({
  asked: z.object({ tempoBpm: nul(z.number()), key: nul(z.string()), durationS: nul(z.number()) }),
  measured: z
    .object({
      tempoBpm: nul(z.number()),
      key: nul(z.string()),
      durationS: nul(z.number()),
      lufs: nul(z.number()),
      truePeakDb: nul(z.number()),
      energy: nul(z.number()),
    })
    .nullable(),
});

/** A glb's counts (@gt/domain/library MeshFacts), as media_facts.mesh holds them (JSON). */
export const meshFactsSchema = z.object({
  tris: z.number().int().nonnegative(),
  verts: z.number().int().nonnegative(),
  bones: z.number().int().nonnegative(),
  clips: z.number().int().nonnegative(),
  images: z.number().int().nonnegative(),
  bboxM: z.tuple([z.number(), z.number(), z.number()]).optional(),
});

export const extrasSchema = z.object({
  meta: z.string().optional(),
  prompt: z.string().optional(),
  negative: z.string().optional(),
  observables: z.record(z.string(), z.string()).optional(),
  palette: z.array(z.string().min(1)).max(8).optional(),
  evidence: z
    .array(
      z.object({
        run: z.string(),
        scene: z.string(),
        mechanism: z.string().optional(),
        verdict: z.enum(["keep", "reject"]),
        by: z.enum(["operator", "agent"]).optional(),
        at: z.string().optional(),
      }),
    )
    .optional(),
  audio: z
    .object({
      prompt: z.string(),
      negative: z.string().optional(),
      reasons: z.array(z.string()),
      facts: audioFactsSchema,
      peaks: z.array(z.number().min(0).max(1)),
      src: z.string().nullable(),
    })
    .optional(),
  file: z.object({ w: z.number().optional(), h: z.number().optional(), path: z.string().optional() }).optional(),
  run: z.object({ id: z.string(), stage: z.string().optional() }).optional(),
  captions: z.number().int().nonnegative().optional(),
  character: z
    .object({
      card: z.object({ name: z.string().min(1), age: z.number().int().nonnegative(), look: z.string(), personality: z.string() }),
      prompt: z.string(),
      looks: z.array(
        z.object({
          night: z.string().min(1),
          cell: z.string().min(1),
          look: z.string().min(1).optional(),
          genre: z.string().min(1).optional(),
          image: z.string().min(1),
          styleId: z.string().min(1).optional(),
        }),
      ),
    })
    .optional(),
  genre: z
    .object({
      state: z.enum(GENRE_STATES),
      use: z.string(),
      look: z.string(),
      grammar: z.array(z.string()),
      keptTrials: z.array(z.string().min(1)),
      piece: z.object({ ref: z.string().min(1), verdict: z.enum(["kept", "rejected", "open"]), video: z.string().min(1).optional() }).optional(),
      bornFrom: z.object({ ref: z.string().min(1), image: z.string().min(1).optional() }),
      proposal: z.string().min(1),
      venture: named.optional(),
      retiredAt: z.string().min(1).optional(),
    })
    .optional(),
  venture: z
    .object({
      kind: z.enum(VENTURE_KINDS),
      tone: z.string(),
      audience: z.string(),
      format: z.string(),
      look: z.string(),
      genres: z.array(named),
      characters: z.array(z.string().min(1)).optional(),
      proposal: z.string().min(1),
      retiredAt: z.string().min(1).optional(),
    })
    .optional(),
  model: z
    .object({
      asset: z.string().min(1),
      variant: z.string().min(1),
      class: z.enum(MODEL_CLASSES),
      technique: z.enum(MODEL_TECHNIQUES),
      approach: z.string().optional(),
      budgetTris: z.number().int().positive(),
      rig: z.literal("ue5-mannequin").optional(),
      poster: z.string().min(1).optional(),
      gates: z.array(
        z.object({
          name: z.string().min(1),
          verdict: z.enum(["pass", "warn", "fail", "unmeasured"]),
          score: z.number().optional(),
          fails: z.array(z.string()),
          warns: z.array(z.string()),
        }),
      ),
      limitations: z.array(z.string()),
    })
    .optional(),
});
