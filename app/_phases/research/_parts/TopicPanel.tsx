"use client";

// The Topic tab: the input, the run controls, the background-job note and the
// run log. Everything up to the point a notebook exists.

import { Button, Eyebrow } from "@/components/ui/Primitives";
import { LocalProcessNote, OutcomePicker, RunStatus, TopicField } from "../run/controls";
import RunTrace from "../run/RunTrace";
import type { useResearchRun } from "../run/useResearchRun";
import { NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import Notice from "../../_shared/ui/Notice";

type Run = ReturnType<typeof useResearchRun>;

export default function TopicPanel({
  run,
  topic,
  setTopic,
  running,
  onStart,
  onAbort,
  onClear,
  onOpenNotebook,
  onOpenEvidence,
  onGoToBoard,
}: {
  run: Run;
  topic: string;
  setTopic: (v: string) => void;
  running: boolean;
  onStart: () => void;
  onAbort: () => void;
  onClear: () => void;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onGoToBoard: () => void;
}) {
  const ready = run.state.status === "done";

  return (
    <>
      <section className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[18rem] flex-1">
            <Eyebrow>step 1 · research</Eyebrow>
            <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
              A topic in, a notebook out. This runs as a background job — you can leave this step,
              open another project, and the bell will tell you when it lands.
            </p>
          </div>
          <OutcomePicker
            outcome={run.outcome}
            setOutcome={run.setOutcome}
            disabled={running}
            onLoad={run.load}
            loaded={ready}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TopicField topic={topic} setTopic={setTopic} disabled={running} className="min-w-[20rem] flex-1" />
          {running ? (
            <Button variant="ghost" onClick={onAbort} className="shrink-0">
              Abort
            </Button>
          ) : (
            <>
              <Button data-testid="run-research" onClick={onStart} disabled={!topic.trim()} className="shrink-0">
                Research this
              </Button>
              {ready && (
                <Button variant="ghost" data-testid="clear-research" onClick={onClear} className="shrink-0">
                  Clear
                </Button>
              )}
            </>
          )}
        </div>
        <LocalProcessNote className="mt-3" />
      </section>

      {/* THE LOG IS NOT GATED ON `!running` ANY MORE. It used to be, which meant
          the one moment the trace exists for — watching the process work through
          nine named phases — was the one moment it was hidden, and all fifteen
          steps arrived at once after it was over. What sat here instead was a
          percentage box driven by the job timer and unrelated to the trace. Both
          are gone: a progress fraction over a replayed fixture and a
          phase-by-phase log are two answers to one question, and this is the
          better one. Nothing here animates, so it reads the same under
          prefers-reduced-motion — it is a list that grows. */}
      {run.state.status !== "idle" && (
        <section className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/50 uppercase">run log</p>
            <RunStatus state={run.state} />
          </div>
          {running && (
            <p data-testid="running-note" className="font-jetbrains mt-1.5 text-[11px] text-white/35">
              running in the background — you can leave this step, and the bell reports the result.
            </p>
          )}
          <div className="mt-3">
            <RunTrace state={run.state} emitted={run.emitted} failedStepId={run.failedStepId} />
          </div>

          {/* The run died and the reason used to die with it: the step reset to
              "no notebook yet" and threw away the one sentence the user most
              needs — that re-running resumes from the cached spine. The trace
              row above says WHERE it stopped; this says what and what now. */}
          {run.state.status === "failed" && (
            <div className="mt-4 border-t border-white/8 pt-4">
              <Notice severity="error" title="the run did not finish">
                <p data-testid="run-error">{run.state.error}</p>
              </Notice>
            </div>
          )}

          {/* An ending of its own. "Finds no tension" used to walk to the full
              Bitcoin notebook — the exact opposite of what was asked for. The
              run succeeded; it just has no video in it, and the reason it gives
              is the product decision, not an error message. */}
          {run.state.status === "no-tension" && (
            <div className="mt-4 border-t border-white/8 pt-4">
              <Notice severity="warning" title="no tension found">
                <p data-testid="no-tension-reason">{run.state.reason}</p>
              </Notice>
            </div>
          )}

          {ready && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/8 pt-4">
              {/* Two artifacts, not one. The notebook is the argument; the
                  evidence log is the claim-level audit underneath it. The log
                  used to live in Step 2, which was the wrong step for it —
                  evidence is produced and checked here. */}
              <button
                data-testid="open-notebook"
                onClick={onOpenNotebook}
                className="font-jetbrains rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] text-white/75 transition hover:bg-white/5"
              >
                notebook · the argument
              </button>
              <button
                data-testid="open-evidence"
                onClick={onOpenEvidence}
                className="font-jetbrains rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] text-white/75 transition hover:bg-white/5"
              >
                evidence log · {NOTEBOOK_COUNTS.facts} claims
                {NOTEBOOK_COUNTS.flagged > 0 && <span className="ml-1.5 text-rose-300">{NOTEBOOK_COUNTS.flagged} flagged</span>}
              </button>
              <button
                data-testid="goto-board"
                onClick={onGoToBoard}
                className="font-jetbrains ml-auto rounded-full border border-cyan-400/35 bg-cyan-400/[0.07] px-3.5 py-1.5 text-[11px] text-cyan-200 transition hover:bg-cyan-400/15"
              >
                triage board →
              </button>
            </div>
          )}
        </section>
      )}

      {run.state.status === "idle" && (
        <Notice severity="info" title="no notebook yet">
          <p>Run the research, or load the saved Bitcoin run, and the board unlocks.</p>
        </Notice>
      )}
    </>
  );
}
