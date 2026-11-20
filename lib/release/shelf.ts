// A SOUND-STORE TAKE AS THE RELEASE READS IT (spark studio-to-release WP1): the shelf's card and a new release's track
// are drawn from the same reading, so a take reads the same in the picker and on the release made from it. Its title is
// the library label when it has one (a finalized take is selected by it), else the take's own title. Pure.
import type { ShelfTake } from "@gt/domain/release";

import { takeFileHref } from "../sound/takeHref.ts";
import type { SoundTake } from "../sound/types.ts";

export function shelfTakeOf(t: SoundTake): ShelfTake {
  return {
    takeId: t.id,
    title: t.label ?? t.title,
    durationS: t.measured?.durationS ?? t.durationS ?? 0,
    audioHref: t.file === null ? null : takeFileHref(t.id),
    provider: t.provider,
    label: t.label,
    lufs: t.measured?.lufs ?? null,
    truePeakDb: t.measured?.truePeakDb ?? null,
  };
}
