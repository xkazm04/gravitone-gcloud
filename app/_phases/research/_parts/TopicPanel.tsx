"use client";

// The Topic tab: the input, the run controls, the background-job note and the
// run log. Everything up to the point a notebook exists.

import { Button, Eyebrow } from "@/components/ui/Primitives";
import { LocalProcessNote, OutcomePicker, TopicField } from "../run/controls";
import RunTrace from "../run/RunTrace";
import { secs, type useResearchRun } from "../run/useResearchRun";
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
  const noTension = run.state.status === "no-tension";

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

        {/* No fraction. The job is DRIVEN — `measured: false`, and lib/jobs is
            explicit that `progress` means nothing on one — so the bar that used
            to sit here would now read 0% for the whole run. The run's own clock
            is the honest number, and the trace below is the real answer to
            "how far along". */}
        {running && (
          <div
            data-testid="running-note"
            className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-jetbrains text-[11px] tracking-[0.14em] text-cyan-200 uppercase">
                running in the background
              </p>
              <span className="font-jetbrains text-[10px] text-white/40">
                {run.state.status === "running" ? secs(run.state.elapsedMs) : ""}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-slate-300">
              You can leave this step. The bell reports the result.
            </p>
          </div>
        )}
      </section>

      {run.state.status !== "idle" && !running && (
        <section className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
          <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/50 uppercase">run log</p>
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
          {noTension && run.state.status === "no-tension" && (
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
