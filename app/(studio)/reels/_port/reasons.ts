// The reason words each film stop offers, drawn from @gt/domain's `reel` source (the Board binds the same eleven; a
// twelfth is never added). The film stop judges the picture, the release stop the copy with its bed: so `sound` is
// the release stop's alone, and the data stop's three (thin, source, story) belong to neither.
import { SOURCES } from "@gt/domain/source";

type ReelReason = (typeof SOURCES)["reel"]["reasons"][number];

const FILM: readonly ReelReason[] = ["hook", "legibility", "layout", "look", "accuracy", "pacing", "motion"];
const RELEASE: readonly ReelReason[] = ["sound", "pacing", "legibility", "look"];

export const REEL_REASONS: { readonly film: readonly string[]; readonly release: readonly string[] } = { film: FILM, release: RELEASE };

/** How many reasons one verdict or one pin may carry (the reel source's own bound). */
export const MAX_REASONS: number = SOURCES.reel.maxReasons;
