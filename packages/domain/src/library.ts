// THE LIBRARY'S READ CONTRACT (Phase 5, plan §2.1 `/library`) - the query, the
// page and the detail the index answers and the route draws; zod-free, so a client
// holds it (the record's door is ./libraryItem.ts). Absorbed from the prototype
// (docs/next/prototype/app/library{,-data}.js), which computed it all over 5,000
// items in memory: the vocabulary as the spine (Kind, that kind's `GROUPS`, then
// attention, state, collections, origin); OR within a group, AND across, each
// group counted with its own selection left out (library.js `compute`); free words
// plus `key:value` tokens with its aliases (`parseQ`, `ALIAS`). Upgraded: the
// counting moves to the server (kernel library/), so the grammar here is the ONE
// door user text goes through (search: query-parsing), and it folds diacritics,
// which the prototype's `toLowerCase().replace(/[-_]/g, " ")` did not.

import { AGE_BANDS } from "./libraryCharacter.ts";
import { TRIS_BANDS, type LibraryExtras, type MediaFacts, type ModelExportProject } from "./libraryMedia.ts";

export * from "./libraryCharacter.ts";
export * from "./libraryMedia.ts";

// ── the closed sets (moved here from ./libraryItem.ts so the client holds them zod-free) ──

export const LIBRARY_KINDS = ["image", "plate", "style", "motion", "audio", "video", "doc", "model", "character"] as const;
export type LibraryKindName = (typeof LIBRARY_KINDS)[number];

/** The Library's shared state facet (library-data.js `STATES`). */
export const LIBRARY_STATES = ["reference", "candidate", "ratified", "rejected", "unjudged"] as const;
export type LibraryState = (typeof LIBRARY_STATES)[number];

/** `real` came from the studio's own runs; `fixture` from the fixture universe
 *  (plan §3.2, a store namespace of its own); `derived` was made from another
 *  item and must say which. The prototype's `illustrative` is not a source a
 *  stored record may have: illustration lives in the prototype, not the store. */
export const LIBRARY_SOURCES = ["real", "fixture", "derived"] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];

/** Which mill or door an item came through. */
export const LIBRARY_ORIGINS = ["forge", "extract", "dojo", "strips", "suno", "elevenlabs", "studio", "registry", "import", "agent", "scout", "mesh"] as const;
export type LibraryOrigin = (typeof LIBRARY_ORIGINS)[number];

/** Why an item cannot lead: its media is gone, or it is there and does not decode
 *  (a media fact, measured at ingest - never a browser-side probe). */
export const ATTENTION = ["unreadable", "missing"] as const;
export type Attention = (typeof ATTENTION)[number];

/** The kinds whose item is its media: one with no blob is `missing`. Audio has a
 *  waveform face and a doc or a style a designed one, so neither is ever missing. */
export const MEDIA_KINDS: readonly LibraryKindName[] = ["image", "plate", "motion", "video", "model", "character"];

/** library-data.js `KINDS`, in rail order. */
export const KIND_LABELS: readonly { readonly kind: LibraryKindName | "all"; readonly label: string; readonly short: string }[] = [
  { kind: "all", label: "All", short: "all" },
  { kind: "image", label: "Images · references", short: "image" },
  { kind: "plate", label: "Plates", short: "plate" },
  { kind: "style", label: "Styles", short: "style" },
  { kind: "motion", label: "Motion", short: "motion" },
  { kind: "audio", label: "Audio", short: "audio" },
  { kind: "video", label: "Video", short: "video" },
  { kind: "doc", label: "Documents", short: "document" },
  { kind: "model", label: "3D models", short: "model" },
  { kind: "character", label: "Characters", short: "character" },
];

/**
 * The style observables the Library facets on: the enum fields of the vocab's
 * `style_source` subset that a still can show (pipeline/vocab/cinematography.json;
 * `motion_treatment` and `consistency_across_frames` are about motion). A tuple
 * because it is a rail ORDER; test/library.contract.test.ts holds it equal to the
 * vocab file, so a renamed field is a red test, not a group that silently empties.
 */
export const STYLE_OBSERVABLES = ["render_mode", "palette_strategy", "black_handling", "atmospherics", "edge_treatment", "detail_density", "surface_realism"] as const;

/** Each kind's own vocabulary groups, in rail order (library-data.js `GROUPS`).
 *  A plate's family and observables are its STYLE's, read through `styleId`. */
export const VOCAB_GROUPS: { readonly [K in LibraryKindName | "all"]: readonly string[] } = {
  all: [],
  image: ["set", "scene", "style", "aspect"],
  plate: ["style", "family", ...STYLE_OBSERVABLES, "station", "mechanism", "lesson"],
  style: ["family", ...STYLE_OBSERVABLES, "derivation"],
  motion: ["subject", "format"],
  audio: ["type", "genre", "mood", "instrument", "provider", "group", "stage"],
  video: ["format", "captions"],
  doc: ["bundle", "techniques"],
  model: ["class", "technique", "rig", "tris"],
  character: ["age", "build", "look", "application"],
};
export type RailSection = "vocabulary" | "attention" | "state" | "collections" | "origin";

/** The groups every kind shares, by section, after the vocabulary (library-data.js
 *  `SHARED`). `origin` is the mill, `source` real|fixture|derived - the prototype's
 *  one `src` group was the second; the record now carries both. */
export const SHARED_GROUPS: readonly { readonly section: Exclude<RailSection, "vocabulary">; readonly keys: readonly string[] }[] = [
  { section: "attention", keys: ["attention"] },
  { section: "state", keys: ["state"] },
  { section: "collections", keys: ["project", "run", "hunt", "pin"] },
  { section: "origin", keys: ["origin", "source"] },
];

/** Groups stored as columns of the item, not as facet rows (kernel library/schema.ts). */
export const COLUMN_GROUPS = ["state", "origin", "source", "attention"] as const;

const SHARED_KEYS: ReadonlySet<string> = new Set(SHARED_GROUPS.flatMap((s) => s.keys));

/** Is `key` a group every kind has (so it narrows the kind counts too)? */
export const isSharedGroup = (key: string): boolean => SHARED_KEYS.has(key);

/** The rail for `kind`, top to bottom. */
export function railGroups(kind: LibraryKindName | "all"): readonly { readonly section: RailSection; readonly key: string }[] {
  return [
    ...VOCAB_GROUPS[kind].map((key) => ({ section: "vocabulary" as const, key })),
    ...SHARED_GROUPS.flatMap((s) => s.keys.map((key) => ({ section: s.section, key }))),
  ];
}

const GROUP_LABEL: Readonly<Record<string, string>> = {
  ...{ render_mode: "render mode", palette_strategy: "palette", black_handling: "blacks", edge_treatment: "edges" },
  ...{ detail_density: "detail density", surface_realism: "surface realism", pin: "pinned", project: "projects", run: "runs", hunt: "hunts", tris: "triangles" },
};

export const groupLabel = (key: string): string => GROUP_LABEL[key] ?? key.replace(/[-_]/g, " ");

/** Values whose order is the vocabulary's, not the count's (library.js `groupHTML`). */
export const FIXED_ORDER: Readonly<Record<string, readonly string[]>> = {
  state: LIBRARY_STATES,
  source: LIBRARY_SOURCES,
  attention: ATTENTION,
  techniques: ["1–4", "5–8", "9–15", "16+"],
  tris: TRIS_BANDS,
  age: AGE_BANDS,
};

/** library.js `CHIPKEYS`: the facets a list row shows, first value of each, at most three. */
export const CHIP_GROUPS: { readonly [K in LibraryKindName]: readonly string[] } = {
  ...{ image: ["scene", "set"], plate: ["family", "render_mode", "station"], style: ["family", "render_mode", "palette_strategy"] },
  ...{ motion: ["subject", "format"], audio: ["genre", "mood", "type"], video: ["format", "captions"], doc: ["bundle", "techniques"], model: ["class", "technique", "tris"] },
  ...{ character: ["age", "build", "application"] },
};

/** A doc's technique count as its facet band (library-data.js `band`). */
export function techniqueBand(n: number): string {
  return n <= 4 ? "1–4" : n <= 8 ? "5–8" : n <= 15 ? "9–15" : "16+";
}
// ── the search grammar ──────────────────────────────────────────────────────

/** The prototype's aliases (library.js `ALIAS`), `origin` and `src` re-aimed at
 *  the record's two fields. */
export const SEARCH_ALIASES: Readonly<Record<string, string>> = {
  ...{ palette: "palette_strategy", render: "render_mode", blacks: "black_handling", edges: "edge_treatment", density: "detail_density" },
  ...{ surface: "surface_realism", src: "source", collection: "project", tag: "mood", tech: "techniques", instr: "instrument" },
};

/** Every key a `key:value` token may name; anything else is a free word ("16:9" stays a word). */
export const SEARCH_KEYS: ReadonlySet<string> = new Set(["kind", "id", ...Object.values(VOCAB_GROUPS).flat(), ...SHARED_KEYS, ...Object.keys(SEARCH_ALIASES)]);

/**
 * The matching policy, once: lower case, diacritics folded (NFKD, marks dropped),
 * every run of non-letters/digits one space. The index tokenizes the same way
 * (FTS5 unicode61 remove_diacritics 2), so a word the parser keeps is a word the
 * index holds.
 */
export function normText(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export type SearchToken = { readonly key: string; readonly value: string };

export type ParsedSearch = {
  /** Free words, normalised; every one must prefix-match some word of the item (AND). */
  readonly words: readonly string[];
  /** `key:value` tokens, aliases resolved; each must match the item (AND). */
  readonly tokens: readonly SearchToken[];
};

// Case-blind like KV_RE's lowercased input: without `i`, `Mood:"dark ambient"` split at the
// space into a one-word token and a stray word, while `Mood:dark` was already a token.
const TOKEN_RE = /[a-z_]+:"[^"]*"|"[^"]*"|\S+/gi;
const KV_RE = /^([a-z_]+):(.+)$/;

/**
 * Raw text to the parsed query - pure, total, never throws. `id:` keeps its value
 * verbatim (ids carry `:` and `-`); every other value is normalised like a word.
 * A token whose value normalises to nothing is dropped, never matched as "".
 */
export function parseSearch(q: string): ParsedSearch {
  const words: string[] = [];
  const tokens: SearchToken[] = [];
  for (const raw of q.match(TOKEN_RE) ?? []) {
    const m = KV_RE.exec(raw.toLowerCase());
    const key = m?.[1];
    const rawValue = m?.[2];
    if (key !== undefined && rawValue !== undefined && SEARCH_KEYS.has(key)) {
      const unq = rawValue.replace(/"/g, "");
      const value =
        key === "id"
          ? raw
              .slice(raw.indexOf(":") + 1)
              .replace(/"/g, "")
              .trim()
          : normText(unq);
      if (value !== "") tokens.push({ key: SEARCH_ALIASES[key] ?? key, value });
      continue;
    }
    for (const w of normText(raw).split(" ")) if (w !== "") words.push(w);
  }
  return { words, tokens };
}

/** A value as a token the parser reads back to itself (the route's chips, an agent). */
export function tokenOf(key: string, value: string): string {
  return /^[^\s"]+$/.test(value) ? `${key}:${value}` : `${key}:"${value.replace(/"/g, "")}"`;
}
// ── the query and the page ──────────────────────────────────────────────────

export const LIBRARY_SORTS = ["newest", "name", "kind"] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** A page is at most this many rows (bounded-enumeration: required-limit). A
 *  virtual grid at the S density on a 2560 px screen shows ~110 tiles. */
export const LIBRARY_PAGE_MAX = 500;
/** Each group returns at most this many values, largest first; `more` counts the rest. */
export const LIBRARY_GROUP_TOP = 50;

export type LibraryQuery = {
  /** Absent is All. */
  readonly kind?: LibraryKindName;
  /** Free words and `key:value` tokens (parseSearch). */
  readonly q?: string;
  /** Selected values per group: OR within a group, AND across groups. */
  readonly facets?: Readonly<Record<string, readonly string[] | undefined>>;
  readonly sort?: LibrarySort;
  /** Where the page starts in the ordered match (a virtual window asks by index). */
  readonly offset?: number;
  /** 1..LIBRARY_PAGE_MAX; 0 asks for counts only. */
  readonly limit: number;
};

export type LibraryCover = {
  /** The bytes a tile draws: an image's own blob, a video's poster; null when there is none. */
  readonly blobSha: string | null;
  readonly mime: string | null;
  /** Mean luma under 16/255, measured at ingest: a pile should not lead with it. */
  readonly nearBlack: boolean;
};

export type LibraryChip = { readonly group: string; readonly value: string; readonly label: string };export type LibraryRow = {
  readonly id: string;
  readonly kind: LibraryKindName;
  readonly title: string;
  readonly meta: string;
  readonly state: LibraryState;
  readonly origin: LibraryOrigin;
  readonly source: LibrarySource;
  /** When it was made, if its source recorded it. */
  readonly date: string | null;
  readonly cover: LibraryCover;
  readonly attention?: Attention;
  readonly chips: readonly LibraryChip[];
  /** A designed face's inputs: an audio item's waveform (0..1, <= 64 buckets), a style's swatch colours. */
  readonly peaks?: readonly number[];
  readonly palette?: readonly string[];
  /** A model's poster render, as an address (a glb has no picture of its own for the cover query). */
  readonly poster?: string;
};

export type LibraryValue = {
  readonly value: string;
  readonly label: string;
  /** Matches if this value were the group's whole selection plus the rest of the filter. */
  readonly count: number;
  readonly selected: boolean;
};

export type LibraryGroup = {
  readonly key: string;
  readonly label: string;
  readonly section: RailSection;
  /** Count order (FIXED_ORDER groups: vocabulary order); a selected value at 0 is kept. */
  readonly values: readonly LibraryValue[];
  /** Distinct values past LIBRARY_GROUP_TOP, not shown. */
  readonly more: number;
};

export type LibraryPage = {
  readonly items: readonly LibraryRow[];
  /** Rows matching the whole query. */
  readonly total: number;
  readonly offset: number;
  /** Per kind under the shared groups only, plus `all`. */
  readonly kindCounts: { readonly [K in LibraryKindName | "all"]: number };
  /** The rail for the query's kind, in railGroups order; a group with no values is omitted. */
  readonly groups: readonly LibraryGroup[];
  /** Some group had more than LIBRARY_GROUP_TOP values. */
  readonly truncated: boolean;
  /** What the search text was read as: the chips the route draws for it. */
  readonly parsed: ParsedSearch;
};

// ── the detail ──────────────────────────────────────────────────────────────
export type LineageNode = {
  /** The work's word for the step: source, run, style, lesson, project, bundle, derived from. */
  readonly role: string;
  readonly ref: { readonly kind: "self" | "library-item" | "run" | "job" | "candidate" | "style" | "project"; readonly id: string };
  readonly label: string;
  /** The library item this node opens, when the index holds one; absent is a broken link or a non-item. */
  readonly itemId?: string;
  /** Clicking it filters by this facet instead (a lesson, a bundle, a project). */
  readonly facet?: { readonly group: string; readonly value: string };
};

export const LIBRARY_ACTS = ["pin", "unpin", "use-in-project", "export"] as const;
export type LibraryActName = (typeof LIBRARY_ACTS)[number];

/** The operator's acts on an item; each is an event (`library.pinned`, `library.unpinned`, `library.used`,
 *  `library.exported`). `export` hands a model to a game project's folder: files only, never its git. */
export type LibraryAct =
  | { readonly act: "pin"; readonly collection?: string }
  | { readonly act: "unpin"; readonly collection?: string }
  | { readonly act: "use-in-project"; readonly projectId: string }
  | { readonly act: "export"; readonly project: ModelExportProject };

/** The pin collection an act without one lands in. */
export const DEFAULT_PIN = "pinned";

/** `Item` is the record (`@gt/domain/libraryItem` LibraryItemDetail binds it): a
 *  parameter, so this zod-free file imports nothing from the schema door. */
export type LibraryDetail<Item = unknown> = {
  readonly item: Item;
  readonly row: LibraryRow;
  /** The item's facets, every value, labelled, in railGroups order. */
  readonly vocabulary: readonly {
    readonly key: string;
    readonly label: string;
    readonly values: readonly { readonly value: string; readonly label: string }[];
  }[];
  readonly lineage: readonly LineageNode[];
  readonly extras: LibraryExtras;
  readonly media: MediaFacts | null;
  /** The acts open on it now (an item already pinned offers unpin). */
  readonly acts: readonly LibraryActName[];
};
