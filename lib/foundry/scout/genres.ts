// GENRES AND VENTURES IN THE NIGHTS (spark scout-vision S2) - what the kernel's heads (packages/kernel/src/ventures/)
// have proven, DERIVED from the scout wing's nights on read and never stored: a genre's kept trials (storyboards
// carrying its `genre`, kept on a live committed night - ./storyboardKept.ts storyboardVerdict's rule) and its newest
// piece's verdict. WP0 stub: the signatures are final; WP2 writes the evidence, the views and the command, WP3 the
// trial and piece schedules.

import type { Genre, GenreEvidence, GenreState, Venture } from "@gt/domain/genre";
import type { Store } from "@gt/kernel/store";

import type { Night, NightId } from "./types";

/** A genre as the taste brief, the CLI and the Library read it: its head, its evidence and the state they derive. */
export type GenreView = Genre & { readonly state: GenreState; readonly evidence: GenreEvidence };

/** One genre's evidence over the scout wing's nights. */
export function genreEvidenceOf(_nights: readonly Night[], _genreId: string): GenreEvidence {
  throw new Error("genreEvidenceOf: WP2");
}

/** Every genre with its evidence and derived state (genreStateOf), in the order the kernel lists them. */
export function genreViews(_nights: readonly Night[], _genres: readonly Genre[]): readonly GenreView[] {
  throw new Error("genreViews: WP2");
}

/** The trial slots each LIVE genre has left on night `id` (TRIALS_PER_GENRE minus its trials already on that night). */
export function trialSlots(_nights: readonly Night[], _genres: readonly Genre[], _id: NightId): ReadonlyMap<string, number> {
  throw new Error("trialSlots: WP3");
}

/** Genres whose piece is due (state piece-due and no piece in flight), each with its best kept trial `<night>/<c-id>`. */
export function piecesDue(_nights: readonly Night[], _genres: readonly Genre[]): readonly { readonly genre: string; readonly trial: string }[] {
  throw new Error("piecesDue: WP3");
}

/** The taste brief's `## Genres` and `## Ventures` sections. */
export function genreSections(_views: readonly GenreView[], _ventures: readonly Venture[]): string[] {
  throw new Error("genreSections: WP2");
}

/** `genre list | retire <id>` and `venture list | retire <id>` - the CLI's lines, its --json doc and its exit code. */
export async function genresCommand(
  _what: "genre" | "venture",
  _args: readonly string[],
  _o: { readonly store: Store; readonly actor: { readonly kind: "operator"; readonly id: string } },
): Promise<{ readonly code: number; readonly lines: readonly string[]; readonly doc: Readonly<Record<string, unknown>> }> {
  throw new Error("genresCommand: WP2");
}
