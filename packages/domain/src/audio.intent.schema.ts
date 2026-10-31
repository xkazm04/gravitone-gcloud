import { z } from "zod";

// THE DOOR for an audio intent (./audio.intent.ts holds no types of its own: the intent shape
// lives with its compiler in @gt/ui, and this schema is held to it by the MCP/CLI callers).
// One schema, read by the MCP ops and by `pipeline/sound.mts intent`, so a file an agent
// writes compiles identically through both doors.

const word = z.string().trim().min(1).max(80);
const words = z.array(word).max(12);

export const audioIntentSchema = z
  .object({
    use: z.string().trim().min(1).max(400).optional(),
    sentence: z.string().trim().min(1).max(1000).optional(),
    mood: words,
    genres: words.optional(),
    instruments: words.optional(),
    paletteId: z.string().trim().min(1).max(120).optional(),
    lengthS: z.number().int().positive().max(3600),
    loop: z.boolean().optional(),
    avoid: words.optional(),
    bpm: z.number().int().min(1).max(400).nullable().optional(),
    key: z.string().trim().min(1).max(40).nullable().optional(),
    energy: z.enum(["calm", "steady", "driving"]).optional(),
    vocals: z.enum(["none", "soft", "full"]).optional(),
  })
  .strict();

export const audioPaletteInputSchema = z
  .object({
    mood: words.optional(),
    use: z.string().trim().min(1).max(400).optional(),
    energy: z.enum(["calm", "steady", "driving"]).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export const audioMeasuredSchema = z
  .object({
    tempoBpm: z.number().positive().nullable(),
    key: z.string().min(1).max(40).nullable(),
    durationS: z.number().positive().nullable(),
  })
  .strict();
