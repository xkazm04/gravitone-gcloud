import type { CoverRights } from "@gt/domain/cover";

// WHAT A COVER'S RIGHTS COMPUTE TO (spark track-mirror-studio), the one place that decides it. The owner chose
// warn-only on 2026-11-07: export is never blocked, and this is what is recorded and shown instead.
//
// Nothing here answers `publishable`, even for a song the owner wrote: the takes come from weights licensed
// CC BY-NC, and the final remix descends from them. Whether a use is cleared is a decision with facts behind it
// (registry: rights-and-provenance-record), and this record holds the facts, not the decision.

export const YUE2_WEIGHTS = "YuE2 weights: CC BY-NC 4.0";

export type CoverLibraryRights = { readonly use: "reference-only" | "unknown"; readonly holder?: string; readonly note: string };

export function coverRights(rights: CoverRights, holder?: string, note?: string): CoverLibraryRights {
  const own = holder === undefined ? {} : { holder };
  const said = note === undefined ? "" : ` ${note}`;
  if (rights === "third-party-uncleared") return { use: "reference-only", ...own, note: `Cover of a third-party song, uncleared. ${YUE2_WEIGHTS}.${said}` };
  return { use: "unknown", ...own, note: `Source declared ${rights}. ${YUE2_WEIGHTS}.${said}` };
}

/** The consequence stated once, on downloading an uncleared winner; absent for a declared song. */
export function exportWarning(rights: CoverRights): string | undefined {
  return rights === "third-party-uncleared" ? `This is a cover of a third-party song with no licence recorded. Publishing it needs one. ${YUE2_WEIGHTS}.` : undefined;
}
