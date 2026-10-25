// THE GENRE AND VENTURE KINDS' WORDS (spark scout-vision S2): one Library item per genre and per venture the
// kernel holds (packages/kernel/src/ventures/), with what the scout nights' verdicts derive about a genre
// (lib/foundry/scout/genres.ts genreViews) - its state on the ladder, its kept trials, its piece. Pure and zod-free:
// it imports only ./genre.ts (itself pure), so the Library screen holds these.
//
// The Library's shared `state` is the record's verdict word, so a genre maps onto it (perfecting and piece-due are
// a candidate, publishable is ratified, retired is rejected) and its OWN state rides as the `ladder` facet. The
// facet is not called `state` - that key is the shared column group (./library.ts COLUMN_GROUPS) - nor is a
// venture's kind called `kind`, which is the search grammar's key for the item kind (./library.ts SEARCH_KEYS); a
// venture's channel | album | game is its `type`.

import { GENRE_STATES, type GenreState, type VentureKind } from "./genre.ts";

/** The `ladder` facet's values, in the ladder's order (retired last). */
export const LADDER_VALUES = GENRE_STATES;

/** The rungs a live genre climbs; `retired` is off the ladder. */
export const GENRE_RUNGS = ["perfecting", "piece-due", "publishable"] as const satisfies readonly GenreState[];

/** A genre's state as the Library's shared state word. */
export function genreLibraryState(s: GenreState): "candidate" | "ratified" | "rejected" {
  return s === "publishable" ? "ratified" : s === "retired" ? "rejected" : "candidate";
}

/** A venture's state as the Library's shared state word: live is ratified, retired rejected. */
export function ventureLibraryState(retiredAt: string | undefined): "ratified" | "rejected" {
  return retiredAt === undefined ? "ratified" : "rejected";
}

/** The Library item id of a genre (`gn-...`) and of a venture (`vn-...`). */
export const genreItemId = (genreId: string): string => `genre:${genreId}`;
export const ventureItemId = (ventureId: string): string => `venture:${ventureId}`;

/** A genre or a venture named by its id and its name: a link the detail draws. */
export type NamedRef = { readonly id: string; readonly name: string };

/** The genre kind's extras: its head's words, the evidence's numbers and the addresses its detail draws. */
export type GenreExtras = {
  readonly state: GenreState;
  readonly use: string;
  readonly look: string;
  /** The beats a video of the genre moves through, in order. */
  readonly grammar: readonly string[];
  /** `<night>/<c-id>` of every kept trial, oldest first. */
  readonly keptTrials: readonly string[];
  /** The newest piece: its `<night>/<c-id>`, its verdict, and the cut as an address when it was cut. */
  readonly piece?: { readonly ref: string; readonly verdict: "kept" | "rejected" | "open"; readonly video?: string };
  /** The kept storyboard it was born from, and that storyboard's first panel as an address when it was drawn. */
  readonly bornFrom: { readonly ref: string; readonly image?: string };
  /** The kept proposal that birthed it. */
  readonly proposal: string;
  readonly venture?: NamedRef;
  readonly retiredAt?: string;
};

/** The venture kind's extras: its kind and its frame, the frame's genres named, the proposal it was born from. */
export type VentureExtras = {
  readonly kind: VentureKind;
  readonly tone: string;
  readonly audience: string;
  readonly format: string;
  readonly look: string;
  readonly genres: readonly NamedRef[];
  readonly characters?: readonly string[];
  readonly proposal: string;
  readonly retiredAt?: string;
};

/** The scout night a `<night>/<c-id>` ref was made on. */
export const nightOfRef = (ref: string): string => ref.slice(0, Math.max(0, ref.indexOf("/")));
