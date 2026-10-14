import { z } from "zod";

import { blobRefSchema } from "./blob.ts";
import { libraryItemIdSchema, styleIdSchema } from "./ids.ts";

// A LIBRARY ITEM: a reference or a ratified thing, of any medium, at thousands
// of items (plan §2.1 `/library`, §2.2). The vocabulary is the spine: Kind,
// then THAT kind's real vocabulary, then state, collections and origin
// (docs/next/prototype/app/library-data.js `KINDS`, `GROUPS`, `SHARED`).
//
// THE VOCABULARY IS A DISCRIMINATED UNION ON `kind`, not a bag of strings. The
// prototype's facet groups are per kind — a plate has a mechanism, a take has
// a tempo — and a `Record<string, unknown>` would let an audio item carry a
// mechanism and every reader find out at render time. Facet values that a
// Style already owns (family, the seven observables) are NOT copied onto a
// plate: the plate points at its style, and the Library reads them through it.

const word = z.string().trim().min(1);

const imageVocabulary = z.object({
  /** The gallery or forge run this reference came in with. */
  set: word.optional(),
  scene: word.optional(),
  /** Styles this reference was used to read or test. */
  styles: z.array(styleIdSchema),
  aspect: z.enum(["16:9", "3:2", "4:3", "1:1", "portrait"]).optional(),
});

const plateVocabulary = z.object({
  station: z.enum(["forge", "extract", "dojo"]),
  styleId: styleIdSchema.optional(),
  scene: word.optional(),
  mechanism: word.optional(),
  /** Extract's two outputs: the recipe redrawing a source, or carried to a new scene. */
  role: z.enum(["replica", "transfer"]).optional(),
  /** The Dojo lesson a plate was drawn for. */
  lesson: word.optional(),
});

const styleVocabulary = z.object({
  styleId: styleIdSchema,
  derivation: z.enum(["readback", "authored", "extracted"]),
});

const motionVocabulary = z.object({
  subject: word,
  format: z.enum(["clip", "poster"]),
});

const audioVocabulary = z.object({
  type: z.enum(["music", "sfx"]),
  genre: z.array(word),
  mood: z.array(word),
  instrument: z.array(word),
  provider: z.enum(["suno", "elevenlabs", "local"]),
  durationS: z.number().positive(),
  tempoBpm: z.number().positive().optional(),
  key: word.optional(),
  /** The sfx grouping ("risers", "impacts") or music lane. */
  group: word.optional(),
  /** Where a take is in its own edit loop (v1 lib/sound: pending, edit, remaster, finalized). */
  stage: z.enum(["pending", "edit", "remaster", "finalized"]).optional(),
});

const videoVocabulary = z.object({
  format: z.enum(["music-video", "ad", "film"]),
  captions: z.enum(["vtt", "srt", "none"]),
});

const docVocabulary = z.object({
  /** A registry bundle and subject: the article pipeline's topics. */
  bundle: word,
  subject: word,
  techniques: z.number().int().nonnegative(),
});

/** The Library's shared state facet (library-data.js `STATES`). */
export const LIBRARY_STATES = ["reference", "candidate", "ratified", "rejected", "unjudged"] as const;

/** `real` came from the studio's own runs; `fixture` from the fixture universe
 *  (plan §3.2, a store namespace of its own); `derived` was made from another
 *  item and must say which. The prototype's `illustrative` is not a source a
 *  stored record may have: illustration lives in the prototype, not the store. */
export const LIBRARY_SOURCES = ["real", "fixture", "derived"] as const;

/** Which mill or door an item came through. */
export const LIBRARY_ORIGINS = ["forge", "extract", "dojo", "strips", "suno", "elevenlabs", "studio", "registry", "import", "agent"] as const;

/** What the operator may do with it. A screenshot of somebody's game read for
 *  its look is `reference-only`: it may teach a style, never ship in a cut. */
export const rightsSchema = z.object({
  use: z.enum(["publishable", "reference-only", "unknown"]),
  holder: word.optional(),
  note: word.optional(),
});

/** One step back toward where an item came from, nearest first. A pointer, so
 *  the parent may later be gone; the Library shows that as a broken link, never
 *  as an item with no past. */
export const lineageSchema = z.object({
  kind: z.enum(["library-item", "run", "job", "candidate", "style", "project"]),
  id: word,
});

const shared = {
  id: libraryItemIdSchema,
  title: word,
  state: z.enum(LIBRARY_STATES),
  collections: z.array(z.object({ kind: z.enum(["project", "run", "hunt", "pin"]), id: word })),
  origin: z.enum(LIBRARY_ORIGINS),
  rights: rightsSchema,
  source: z.enum(LIBRARY_SOURCES),
  lineage: z.array(lineageSchema),
  media: blobRefSchema.optional(),
  at: z.iso.datetime().optional(),
};

export const LIBRARY_KINDS = ["image", "plate", "style", "motion", "audio", "video", "doc"] as const;

export const libraryItemSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("image"), vocabulary: imageVocabulary, ...shared }),
    z.object({ kind: z.literal("plate"), vocabulary: plateVocabulary, ...shared }),
    z.object({ kind: z.literal("style"), vocabulary: styleVocabulary, ...shared }),
    z.object({ kind: z.literal("motion"), vocabulary: motionVocabulary, ...shared }),
    z.object({ kind: z.literal("audio"), vocabulary: audioVocabulary, ...shared }),
    z.object({ kind: z.literal("video"), vocabulary: videoVocabulary, ...shared }),
    z.object({ kind: z.literal("doc"), vocabulary: docVocabulary, ...shared }),
  ])
  .superRefine((it, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (it.source === "derived" && !it.lineage.some((l) => l.kind === "library-item"))
      issue("lineage", "a derived item names the library item it was derived from");
    if (it.lineage.some((l) => l.kind === "library-item" && l.id === it.id)) issue("lineage", "an item is not its own ancestor");
  });
export type LibraryItem = z.output<typeof libraryItemSchema>;
export type LibraryKind = LibraryItem["kind"];
