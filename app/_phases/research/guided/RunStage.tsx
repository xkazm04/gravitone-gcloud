"use client";

// Stage 1 of the guided wizard — the run, in the deck's visual language.
//
// The SAME wiring as the expert Topic tab (useEducationalResearch — one engine,
// one job round-trip, one topic record), drawn as the wizard's opening table:
// the topic goes in, and the trace arrives as a card on the table. The trace
// itself is the expert face's RunTrace, reused — it is already the honest form
// (a list that grows, phase headings, the run's own elapsed clock, and NO
// percentage anywhere; a fraction over a replayed fixture answers nothing).
//
// Two shapes:
//  · the notebook PRE-DATES this visit → a compact "notebook exists" card, so
//    the wizard can open on stage 2 without pretending a run just happened;
//  · anything else → the full run surface, which stays up when the run lands
//    in front of you — completing a run and watching its trace vanish would be
//    the surface eating the thing it just made.

import { useState } from "react";

import { Bell } from "lucide-react";

import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, Hint, TALLY_TONE } from "@/components/ui/signal";

import { NOTEBOOK, NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import Notice from "../../_shared/ui/Notice";
import { LocalProcessNote, RealRunControl, RunStatus, TopicField } from "../run/controls";
import LiveResult from "../run/LiveResult";
import RunTrace from "../run/RunTrace";
import type { EducationalResearchApi } from "./useEducationalResearch";

/** The three things you can do to a notebook that exists: read the argument,
 *  audit the claims under it, throw it away.
 *
 *  ONE DEFINITION, BOTH FACES (2026-09-08). It used to be a copy of the expert
 *  Topic tab's row — "same words and testids" by hand. The Topic tab is gone and
 *  the expert face is the triage board, which needs the identical row in its
 *  header, so ResearchStep imports this rather than writing a third spelling.
 *  Only one face is ever mounted, so the testids stay unique on the page. */
const PILL =
  "font-jetbrains rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/75 transition hover:bg-white/5";

export function ArtifactPills({
  onOpenNotebook,
  onOpenEvidence,
  onClear,
}: {
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
        evidence log · {NOTEBOOK_COUNTS.facts} claims
        {NOTEBOOK_COUNTS.flagged > 0 && (
          <span className="ml-1.5 text-rose-300">{NOTEBOOK_COUNTS.flagged} flagged</span>
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

/** THE ONE FACT THE PROTOTYPE OWES BEFORE A DECISION — the SUBJECT is fixed.
 *  Every research surface says the process is replayed; none said this, so a
 *  creator typed their own topic, ran, and scoped cards about Bitcoin under
 *  their own heading.
 *
 *  IT IS DRAWN NOW RATHER THAN NARRATED. The substitution is two topics, one of
 *  which is not in force, so the picture is the typed topic struck through
 *  beside the notebook's own — which is the same information the three
 *  branches of prose carried and does not have to be read to be seen. `landed`
 *  is gone with them: the notebook's topic is the notebook's topic before the
 *  run and after it, and the branch existed only to re-word the sentence. */
export function StandInNote({ topic }: { topic: string }) {
  const own = topic.trim() && topic.trim() !== NOTEBOOK.topic;
  return (
    <span data-testid="stand-in-note" className="flex flex-wrap items-center gap-1.5">
      {own && (
        // TRUNCATED, and that is a fix rather than a style. The typed topic is
        // whatever the creator typed, and this span rendered it whole: a pasted
        // paragraph ran straight off the right edge of the page and took the
        // body's horizontal scroll with it (measured 2026-09-08 with a
        // 400-character topic, driving the real-run path). `title` keeps the
        // whole string reachable, which is what a struck-through label owes.
        <span
          title={topic.trim()}
          className="font-jetbrains max-w-[32ch] truncate text-label text-white/35 line-through decoration-amber-300/50"
        >
          {topic.trim()}
        </span>
      )}
      <span className={`${CHIP_CLASS} ${TALLY_TONE.amber}`}>
        <span aria-hidden className="opacity-60">stand-in</span>
        <span className="sr-only">the notebook this run replays:</span>
        {NOTEBOOK.topic}
      </span>
      <Hint variant="warn" tone="amber" label="Why the notebook names another topic">
        every card is from the saved {NOTEBOOK.researched} Bitcoin run
      </Hint>
    </span>
  );
}

export default function RunStage({
  research,
  onOpenNotebook,
  onOpenEvidence,
  onClear,
}: {
  research: EducationalResearchApi;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onClear: () => void;
}) {
  const {
    run,
    topic,
    setTopic,
    ready,
    running,
    startResearch,
    abortResearch,
    live,
    liveRunning,
    preflight,
    startLiveResearch,
    abortLiveResearch,
  } = research;

  // Whether a notebook already existed when this stage was DEALT — not whether
  // one exists now. A run that lands while you watch keeps its trace on the
  // table; leaving the stage and coming back re-deals it as the compact card
  // (the deck's "this decision is open again", answered honestly: it was
  // decided, here is the record).
  const [openedReady] = useState(ready);

  if (openedReady && run.state.status === "done") {
    return (
      // THE DEAD BAND UNDER THIS CARD IS NOT FIXABLE FROM HERE, and the attempt
      // is recorded rather than left as CSS that looks like it works.
      //
      // Measured at 1920×1080 on 2026-09-08: Deck's stage-content div
      // (`mt-8 grow`) is 625px tall, this card is 312px, and all 313px of slack
      // sits underneath it. `min-h-full justify-center` on this wrapper was
      // tried and measured at zero effect — a percentage min-height cannot
      // resolve against a parent whose height comes from `flex-grow` rather than
      // from a specified height, so the flex container collapsed to its content
      // and `justify-center` had nothing to centre in.
      //
      // The fix is one class on components/ui/deck/Deck.tsx (`flex flex-col` on
      // that div, then `my-auto` here) and it is NOT made: that div is the stage
      // slot for four other surfaces — the create wizard's three card stages,
      // the script duel and the passes deck — and turning it into a flex
      // container stops margin collapsing for all of them. That is a change to
      // the deck, on a page whose redesign is already the operator's; it is in
      // the report rather than in this diff.
      //
      // WHAT IS DONE HERE IS SPACING: a roomier card (p-6), a wider gap between
      // the card and what follows it, and — in the states that matter — more IN
      // the band, because a real run now draws its own result underneath.
      <div className="gt-rise mx-auto w-full max-w-3xl space-y-5">
        <div className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.03]">
          <div
            aria-hidden
            className="h-1.5 bg-gradient-to-r from-cyan-400/50 via-sky-400/20 to-transparent"
          />
          <div className="p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-jetbrains text-label tracking-[0.16em] text-cyan-200/80 uppercase">
                a notebook exists
              </p>
              <RunStatus state={run.state} />
            </div>
            {/* THE NOTEBOOK'S OWN TOPIC, not the typed one. The card used to
                headline whatever the creator typed over the Bitcoin counts —
                the one surface that should have said "stand-in" said the
                opposite (uat 2026-09-05). */}
            <h3 className="font-instrument mt-1.5 text-2xl leading-snug text-slate-100">
              {NOTEBOOK.topic}
            </h3>
            <p className="font-jetbrains mt-2 text-label text-white/40">
              {NOTEBOOK_COUNTS.facts} facts · {NOTEBOOK_COUNTS.mechanisms} mechanisms ·{" "}
              {NOTEBOOK_COUNTS.reversals} reversals · researched {NOTEBOOK.researched}
            </p>
            <div className="mt-2">
              <StandInNote topic={topic} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <ArtifactPills
                onOpenNotebook={onOpenNotebook}
                onOpenEvidence={onOpenEvidence}
                onClear={onClear}
              />
            </div>
          </div>
        </div>

        {/* The creator's own notebook, if one has been reasoned for this
            project. It sits BESIDE the replay rather than replacing it: they are
            two different objects and the surface says which is which. */}
        <LiveResult state={live.state} />
      </div>
    );
  }

  return (
    // Roomier, not re-laid-out — see the compact branch above for the
    // measurement of the dead band, why it cannot be closed from this file, and
    // what was deliberately left for the redesign.
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-6">
        <div className="flex flex-wrap items-center gap-3">
          <TopicField
            topic={topic}
            setTopic={setTopic}
            disabled={running || liveRunning}
            maxLength={preflight?.maxTopicChars}
            className="min-w-[16rem] flex-1"
          />
          {running ? (
            <Button variant="ghost" onClick={abortResearch} className="shrink-0">
              Abort
            </Button>
          ) : (
            <Button
              data-testid="run-research"
              onClick={startResearch}
              disabled={!topic.trim() || liveRunning}
              className="shrink-0"
            >
              Research this
            </Button>
          )}
        </div>
        {/* THE TWO PATHS, EACH LABELLED WITH WHAT IT ACTUALLY IS. The default
            button above walks the replay, and the substitution stands beside it
            — typed topic struck out, the notebook's own topic in the chip. The
            row below is the real engine and the money: explicit, second, and
            carrying its price before it is pressed. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <StandInNote topic={topic} />
          <LocalProcessNote />
        </div>
        <div className="mt-4 border-t border-white/8 pt-4">
          <RealRunControl
            preflight={preflight}
            onStart={startLiveResearch}
            onAbort={abortLiveResearch}
            running={liveRunning}
            disabled={!topic.trim() || running}
          />
        </div>
      </div>

      {/* What a real run is doing, or produced, or failed to produce. */}
      <LiveResult state={live.state} />

      {run.state.status !== "idle" && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          {/* the card's art strip — a ground, not a meter. It does not grow. */}
          <div
            aria-hidden
            className="h-1.5 bg-gradient-to-r from-cyan-400/40 via-violet-400/15 to-transparent"
          />
          <div className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-jetbrains text-label tracking-[0.16em] text-white/50 uppercase">
                run log
              </p>
              <RunStatus state={run.state} />
            </div>
            {/* THE BACKGROUND-JOB FACT, ONCE. It was three statements of one
                thing on one screen — the panel's opening paragraph, the deck
                stage's `sub`, and this. What is left is the half a reader
                cannot deduce (they may leave, and the bell will find them),
                carried by the glyph that will do the finding. The testid stays:
                tests/live/golden-path.live.spec.ts and two pipeline drivers
                assert on it. */}
            {running && (
              <p
                data-testid="running-note"
                className="font-jetbrains mt-1.5 flex items-center gap-1.5 text-label text-white/40"
              >
                <Bell className="h-3.5 w-3.5 shrink-0 animate-pulse text-cyan-300/70" aria-hidden />
                in the background — the bell reports the result
              </p>
            )}
            <div className="mt-3">
              <RunTrace state={run.state} emitted={run.emitted} failedStepId={run.failedStepId} />
            </div>

            {/* The three endings, each in its own honest colour — the expert
                face's exact vocabulary: failed is rose, no-tension is amber
                (a successful run with no video in it, not a defect). */}
            {run.state.status === "failed" && (
              <div className="mt-4 border-t border-white/8 pt-4">
                <Notice severity="error" title="the run did not finish">
                  <p data-testid="run-error">{run.state.error}</p>
                  <button
                    type="button"
                    onClick={startResearch}
                    disabled={!topic.trim()}
                    className="font-jetbrains mt-2 rounded-full border border-rose-400/40 px-3.5 py-1.5 text-label text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-40"
                  >
                    run it again
                  </button>
                </Notice>
              </div>
            )}
            {run.state.status === "no-tension" && (
              <div className="mt-4 border-t border-white/8 pt-4">
                <Notice severity="warning" title="no tension found">
                  <p data-testid="no-tension-reason">{run.state.reason}</p>
                  <button
                    type="button"
                    onClick={startResearch}
                    disabled={!topic.trim()}
                    className="font-jetbrains mt-2 rounded-full border border-amber-400/40 px-3.5 py-1.5 text-label text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-40"
                  >
                    research another topic
                  </button>
                </Notice>
              </div>
            )}
            {run.state.status === "done" && (
              <div className="mt-3">
                <StandInNote topic={topic} />
              </div>
            )}
            {run.state.status === "done" && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-white/8 pt-4">
                <ArtifactPills
                  onOpenNotebook={onOpenNotebook}
                  onOpenEvidence={onOpenEvidence}
                  onClear={onClear}
                />
                <span className="font-jetbrains ml-auto text-label text-cyan-200/80">
                  Next deals the takes →
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NO "no notebook yet" NOTICE. An empty state that says the stage is
          empty, on the stage whose entire content is the control that fills it,
          is the app describing the screen the reader is looking at. The deck's
          own Next is disabled and carries `blockedHint` (Deck#blockedHint,
          GuidedResearch's run stage) — a gate that names what opens it, in the
          place the reader is trying to press. */}
    </div>
  );
}
