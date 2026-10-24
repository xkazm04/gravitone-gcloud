import { z } from "zod";

import { AUDIO_PROFILE_IDS } from "../audio.accept.ts";
import { fxChainSchema } from "../audio.fx.ts";
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
//   article - the article's sections: an article run's, or a finished post's adopted by the
//             editor's one op (`from` names the post); strips - the strips run's cards (its
//             producer's run writes them; the editor does not edit them);
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
    /** The finished post the sections were adopted from (op `article-adopt`), by its digest at the
     *  adopt. OPTIONAL, not defaulted: a record written by a run, or before adoption existed,
     *  omits it, and an absent key is "not adopted". */
    from: z.looseObject({ source: z.enum(["run", "publication"]), id: z.string().min(1), sha: z.string().min(1) }).optional(),
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

/** A narration take. Every addition is OPTIONAL and absent on a take that never had it (a v1
 *  record, a dry stand-in): the absent-value convention is "omit the key", never null. */
const voiceTakeSchema = takeSchema.extend({
  /** Who spoke it: provider, model, the voice, and whether a vendor was billed. */
  engine: z.looseObject({ provider: z.string().min(1), model: z.string().min(1), voiceId: z.string().min(1).optional(), mode: z.enum(["dry", "live"]) }).optional(),
  /** An FX version: the take it was rendered from (a take on the same line), the words it was
   *  asked for, and the chain that rendered it. */
  fxOf: z.string().min(1).optional(),
  describe: z.string().min(1).max(400).optional(),
  chain: fxChainSchema.optional(),
  /** The advisory acceptance verdict (audio.accept.ts), mirrored from its ledger event. */
  accept: z.looseObject({ profile: z.enum(AUDIO_PROFILE_IDS), verdict: z.enum(["pass", "fail"]), reasons: z.array(z.string()) }).optional(),
});

export const VOICE = defineStepRecord({
  key: "voice",
  owner: "voice",
  version: 1,
  schema: z
    .looseObject({
      ...versionField,
      text: z.record(z.string(), z.string()).default({}),
      takes: z.record(z.string(), voiceTakeSchema).default({}),
      byLine: z.record(z.string(), z.looseObject({ takeIds: z.array(z.string()), active: textOrNull })).default({}),
      /** A voice fx asked for and not yet rendered, per line (op `voice-fx-ask`; the `fx-line`
       *  act renders it as a new take and clears it). OPTIONAL, not defaulted: a writer that
       *  never asks keeps compiling, and an absent key is "no ask". */
      fxAsk: z.record(z.string(), z.looseObject({ from: z.string().min(1), describe: z.string().trim().min(1).max(400) })).optional(),
    })
    // A line's take list names takes this record holds, and its active one is among them: a
    // dangling id would draw a take the cut cannot find (v1's score held the same rule per spot).
    .refine((v) => Object.values(v.byLine).every((l) => l.takeIds.every((id) => Object.hasOwn(v.takes, id)) && (l.active === null || l.takeIds.includes(l.active))), "a line names a take this record does not hold"),
});
