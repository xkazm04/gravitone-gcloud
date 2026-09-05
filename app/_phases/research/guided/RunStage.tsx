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

import { Button } from "@/components/ui/Primitives";

import { NOTEBOOK, NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import Notice from "../../_shared/ui/Notice";
import { LocalProcessNote, OutcomePicker, RunStatus, TopicField } from "../run/controls";
import RunTrace from "../run/RunTrace";
import type { EducationalResearchApi } from "./useEducationalResearch";

/** The expert face's artifact pills, same words and testids — only one face is
 *  ever mounted, so the ids stay unique on the page. */
const PILL =
  "font-jetbrains rounded-full border border-white/15 px-3.5 py-1.5 text-label text-white/75 transition hover:bg-white/5";

function ArtifactPills({
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

/** THE ONE SENTENCE THE PROTOTYPE OWES BEFORE A DECISION. Every research
 *  surface says the process is replayed; none said the SUBJECT is fixed — so a
 *  creator typed their own topic, ran, and scoped cards about Bitcoin under
 *  their own heading. Shown before the run (what will happen) and after it
 *  (what did), in the creator's words, not the engine's. */
export function StandInNote({ topic, landed = false }: { topic: string; landed?: boolean }) {
  const own = topic.trim() && topic.trim() !== NOTEBOOK.topic;
  return (
    <p data-testid="stand-in-note" className="font-jetbrains mt-2 text-label leading-snug text-amber-200/85">
      {landed
        ? own
          ? `prototype · this notebook is the saved ${NOTEBOOK.researched} Bitcoin run, not research on “${topic.trim()}” — every card below is about Bitcoin`
          : `prototype · this notebook is the saved ${NOTEBOOK.researched} Bitcoin run`
        : `prototype · whatever topic you type, the run replays the saved ${NOTEBOOK.researched} Bitcoin notebook — the cards you scope next will be about Bitcoin, not your topic`}
    </p>
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
  const { run, topic, setTopic, ready, running, startResearch, abortResearch } = research;

  // Whether a notebook already existed when this stage was DEALT — not whether
  // one exists now. A run that lands while you watch keeps its trace on the
  // table; leaving the stage and coming back re-deals it as the compact card
  // (the deck's "this decision is open again", answered honestly: it was
  // decided, here is the record).
  const [openedReady] = useState(ready);

  if (openedReady && run.state.status === "done") {
    return (
      <div className="gt-rise mx-auto w-full max-w-2xl space-y-4">
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
            <StandInNote topic={topic} landed />
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <ArtifactPills
                onOpenNotebook={onOpenNotebook}
                onOpenEvidence={onOpenEvidence}
                onClear={onClear}
              />
            </div>
          </div>
        </div>
        <OutcomePicker
          outcome={run.outcome}
          setOutcome={run.setOutcome}
          disabled={running}
          onLoad={run.load}
          loaded={ready}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
        <OutcomePicker
          outcome={run.outcome}
          setOutcome={run.setOutcome}
          disabled={running}
          onLoad={run.load}
          loaded={ready}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TopicField
            topic={topic}
            setTopic={setTopic}
            disabled={running}
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
              disabled={!topic.trim()}
              className="shrink-0"
            >
              Research this
            </Button>
          )}
        </div>
        <LocalProcessNote className="mt-3" />
      </div>

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
            {running && (
              <p data-testid="running-note" className="font-jetbrains mt-1.5 text-label text-white/35">
                running in the background — you can leave this step, and the bell reports the result.
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
                <StandInNote topic={topic} landed />
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

      {run.state.status === "idle" && (
        <Notice severity="info" title="no notebook yet">
          <p>Run the research, or load the saved Bitcoin run, and the next stages unlock.</p>
          <StandInNote topic={topic} />
        </Notice>
      )}
    </div>
  );
}
