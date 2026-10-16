import { z } from "zod";

import { blobRefSchema } from "../blob.ts";
import { RENDER_RES } from "../partView.album.ts";
import { defineStepRecord, engineField, textOrNull, versionField } from "./record.ts";

// THE ALBUM AND EXPLAINER PARTS' RECORDS (Phase 4 wave D, L43). v1 had no such steps: a music
// video's words and render were a notice and an export dialog (MusicVideoExport.tsx), and the
// explainer did not exist. L40 drew their editors over a RECORDS GAP - read on the real side,
// every op refused - because nothing here declared where their work is kept. These are those
// doors, each OWNED by its part kind, loose like every other record (a sibling writer's field
// survives a patch), with the shapes the editors reason in:
//   words   - the platform's title, description and tags, and what the metadata turn wrote, so an
//             edit since stays visible;
//   render  - the chosen resolution and every export (a blob ref, never base64);
//   article - the article run's sections; strips - the strips run's cards (their producers' runs
//             write these; the editor edits neither);
//   voice   - per line the operator's rewrite, its takes and the one in use.
// An absent field is the empty decision a fresh part starts from, so the defaults below are the
// editor's own seeds: a record written by an older build that never held one reads as untouched.

const RES = z.enum(RENDER_RES);
const mode = z.enum(["dry", "live"]);
const tags = z.array(z.string());

export const WORDS = defineStepRecord({
  key: "words",
  owner: "words",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    title: z.string().default(""),
    description: z.string().default(""),
    tags: tags.default([]),
    written: z.looseObject({ title: z.string(), description: z.string(), tags }).nullable().default(null),
    engine: engineField.optional(),
  }),
});

export const RENDER = defineStepRecord({
  key: "render",
  owner: "render",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    res: RES.default("1080p"),
    exports: z
      .array(z.looseObject({ id: z.string().min(1), at: z.number(), mode, label: z.string(), hash: z.string(), blob: blobRefSchema.optional() }))
      .default([]),
  }),
});

export const ARTICLE = defineStepRecord({
  key: "article",
  owner: "article",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    title: textOrNull.default(null),
    sections: z.array(z.looseObject({ id: z.string().min(1), heading: z.string(), body: z.string() })).default([]),
    engine: engineField.optional(),
  }),
});

export const STRIPS = defineStepRecord({
  key: "strips",
  owner: "strips",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    cards: z
      .array(
        z.looseObject({
          id: z.string().min(1),
          section: z.string(),
          title: z.string(),
          caption: z.string(),
          state: z.enum(["drawn", "pending", "refused"]),
          blob: blobRefSchema.optional(),
          why: z.string().optional(),
        }),
      )
      .default([]),
    engine: engineField.optional(),
  }),
});

const takeSchema = z.looseObject({
  id: z.string().min(1),
  label: z.string(),
  at: z.number(),
  seconds: z.number().nonnegative().nullable(),
  mark: z.enum(["kept", "rejected"]).nullable(),
  blob: blobRefSchema.optional(),
  sections: z.array(z.looseObject({ name: z.string(), startMs: z.number(), endMs: z.number() })).default([]),
});

export const VOICE = defineStepRecord({
  key: "voice",
  owner: "voice",
  version: 1,
  schema: z
    .looseObject({
      ...versionField,
      text: z.record(z.string(), z.string()).default({}),
      takes: z.record(z.string(), takeSchema).default({}),
      byLine: z.record(z.string(), z.looseObject({ takeIds: z.array(z.string()), active: textOrNull })).default({}),
    })
    // A line's take list names takes this record holds, and its active one is among them: a
    // dangling id would draw a take the cut cannot find (v1's score held the same rule per spot).
    .refine((v) => Object.values(v.byLine).every((l) => l.takeIds.every((id) => Object.hasOwn(v.takes, id)) && (l.active === null || l.takeIds.includes(l.active))), "a line names a take this record does not hold"),
});
