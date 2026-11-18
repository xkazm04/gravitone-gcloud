// THE ONE WRITER OF A FILM OR RELEASE VERDICT (spark reel-studio). The /reels screen's actions and the Board's
// apply both come here, so a stop decided in one place reads decided in the other. A `release` keep lands both
// publish copies on the Calendar (lib/producers/reelActs.ts `landReelFilm`); nothing else lands a film.
//
// WP-0 STUB: the signature is the contract; WP1 fills the body.

import type { Result } from "@gt/domain/errors";
import type { Recorded, ReelVerdict } from "./store.ts";
import { ReelError } from "./types.ts";

export type FilmStopKey = "film" | "release";

export type Decided = {
  readonly recorded: Recorded;
  /** The Calendar slots a release keep made or found, one per face. */
  readonly slots?: readonly string[];
};

/** Record `verdict` for the film or release stop of `slug` (its `of` must be the current `filmSubjectSha`). */
export async function decideReelStop(slug: string, key: FilmStopKey, verdict: ReelVerdict): Promise<Result<Decided>> {
  void slug;
  void key;
  void verdict;
  throw new ReelError("decideReelStop is not built yet (spark reel-studio WP1)", "unbuilt");
}
