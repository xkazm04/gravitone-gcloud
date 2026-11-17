// THE RELEASE DRAFT (spark audio-distribution; persisted by spark studio-to-release): the reducer, the pure edit and
// the release a pick of takes makes now live in lib/release/draft.ts (WP1: the store runs the same `applyEdit` and
// lib/ may not import app/); they are re-exported here so the wizard and the session keep one import. What stays is
// the page's own reading: the Calendar slots a release would take.
import type { ChannelRow, Release, ReleaseChannelId } from "@gt/domain/release";

export { applyEdit, initialDraft, isReleaseEdit, reduceDraft, releaseOf, trackOf } from "../../../../lib/release/draft.ts";
export type { DraftEvent, DraftState, ReleaseEdit, ReleaseFields, TrackFields } from "../../../../lib/release/draft.ts";

/** One Calendar slot per picked channel (S2's `release:<id>` item kind): what Publish would create. */
export interface PlannedSlot {
  readonly channel: ReleaseChannelId;
  readonly at: string | null;
  readonly state: ChannelRow["state"];
  readonly detail: string | null;
}

export function plannedSlots(r: Release, rows: readonly ChannelRow[]): PlannedSlot[] {
  return r.channels.map((c) => {
    const row = rows.find((x) => x.id === c);
    return { channel: c, at: r.releaseDate, state: row?.state ?? "not-wired", detail: row?.detail ?? null };
  });
}
