"use client";

// CUT / TIMELINE — the winner. The editor's grammar: three stacked tracks
// against one ruler, every clip a block to scale, drift and gaps drawn where
// they are. Polish round: a legend names the three block states, the
// playhead says what it marks, and the sync bench can snap back to zero.
//
// HONESTY ROUND (2026-08-14). Three things on this surface were typed rather
// than derived, and one of them was a claim about product behaviour:
//
//  · "Preview plays what exists and holds black over the gaps" sat in body copy
//    a user reads. There is no <video> here, no play control, and no preview
//    surface in anything this file imports. It is gone rather than built —
//    building playback is not a copy fix — and what replaced it is what the cut
//    actually is today.
//  · The 13s "the turn" marker was the literal `13`, which merely COINCIDED
//    with where the reversal scene starts. It is derived now, from the scenes.
//  · The gap sentence was hand-typed to match the four missing rows. It is read
//    off TIMELINE now, so a fixture edit cannot leave it lying.
//
// And the sync bench, which was the same defect in interactive form: it moved a
// counter and rewrote a sentence while `TimelineClip.offsetMs` — a real field,
// with a real value in the fixture — was never read by anything. It reads and
// writes it now, and the block moves on the ruler above.

// THE SEQUENCER ROUND (2026-10-05, platform-consolidation WP6). The standard
// branch below stopped being a picture of the fixture: it is ./CutWorkbench now
// — the cut derived from this project's own frames and spotting
// (./deriveTimeline.ts), a clock outside React (./clock.ts), a monitor showing
// the shot under the playhead, takes played against it, and the finish line.
// The sync bench survives in ./parts/SyncBench.tsx with the same arithmetic,
// which moved to ./offsets.ts and is re-exported below so the batching probe
// imports what it always imported. The music-video branch is untouched.

import { useState } from "react";

import { getProject, type Discipline } from "@/lib/projects";

import { useLoadFor } from "../_shared/useLoadFor";
import CutWorkbench from "./CutWorkbench";
import AdsFinish from "./ads/AdsFinish";
import MusicVideoExport from "./music-video/MusicVideoExport";

export { nudgeOffsets, offsetFrom, type Offsets } from "./offsets";

/** THE ROUTER — the FIRST top-level discipline branch this file has had,
 *  mirroring `FramesStep.tsx`'s own (WP3): route away BEFORE any of the
 *  fixture-reading code below runs. A music-video project has no TIMELINE, no
 *  TRACKS and no SCENES — one baked envelope driving one poster — so mounting
 *  the standard timeline for it would draw the fixed `app/_studio/score.ts`
 *  fixture under a project it has nothing to do with, the same
 *  wrong-content-under-a-foreign-project failure `ScriptStep.tsx`/
 *  `ScoreSpotting.tsx`/`FramesStep.tsx` already route away from for this
 *  discipline. */
export default function CutTimeline({ projectId }: { projectId: string }) {
  const [discipline, setDiscipline] = useState<Discipline | undefined>(undefined);
  const hydrated = useLoadFor(
    projectId,
    (id) => getProject(id),
    (p) => setDiscipline(p?.discipline ?? "educational"),
  );

  if (!hydrated)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );
  if (discipline === "music-video") return <MusicVideoExport projectId={projectId} />;
  if (discipline === "ads") return <AdsFinish projectId={projectId} />;
  return <CutWorkbench projectId={projectId} />;
}
