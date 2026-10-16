import { z } from "zod";

// The detail's per-kind extras (@gt/domain/library `LibraryExtras`) as a door:
// checked when a source hands them over (./write.ts) and when the detail reads
// them back (./detail.ts), so a row edited by hand is refused, not drawn.

const nul = <T extends z.ZodType>(s: T) => s.nullable();

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
});
