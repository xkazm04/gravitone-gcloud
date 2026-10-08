"use client";

// The three things you can do to a notebook that exists: read the argument,
// audit the claims under it, throw it away.
//
// ONE DEFINITION, BOTH FACES (2026-09-08). It used to be a copy of the expert
// Topic tab's row — "same words and testids" by hand. The Topic tab is gone and
// the expert face is the triage board, which needs the identical row in its
// header, so ResearchStep imports this rather than writing a third spelling.
// Only one face is ever mounted, so the testids stay unique on the page.
//
// ITS OWN MODULE (Wave 2, 2026-10-08). It sat in RunStage.tsx, so the expert
// face's header imported the run stage — the topic field, the real-run control,
// the live engine client and the trace fixture — to draw three buttons. The
// faces are split into separate chunks now (ResearchStep), and this is the row
// both of them share.

import type { NotebookCounts } from "../../_shared/notebook/counts";

const PILL =
  "font-jetbrains rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/75 transition hover:bg-white/5";

export function ArtifactPills({
  counts,
  onOpenNotebook,
  onOpenEvidence,
  onClear,
}: {
  /** The counts of the notebook the pills open (`countsOf(source.notebook)`):
   *  the replay's, or the creator's own when that is what is dealt. */
  counts: NotebookCounts;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onClear: () => void;
}) {
  return (
    <>
      <button data-testid="open-notebook" onClick={onOpenNotebook} className={PILL}>
        notebook · the argument
      </button>
      <button data-testid="open-evidence" onClick={onOpenEvidence} className={PILL}>
        evidence log · {counts.facts} claims
        {counts.flagged > 0 && (
          <span className="ml-1.5 text-rose-300">{counts.flagged} flagged</span>
        )}
      </button>
      <button
        data-testid="clear-research"
        onClick={onClear}
        className="font-jetbrains rounded-full border border-white/12 px-3.5 py-1.5 text-label text-white/45 transition hover:bg-white/5 hover:text-white/70"
      >
        clear the research
      </button>
    </>
  );
}
