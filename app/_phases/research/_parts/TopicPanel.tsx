"use client";

// The Topic tab: the input, the run controls, the background-job note and the
// run log. Everything up to the point a notebook exists.

import { Button, Eyebrow } from "@/components/ui/Primitives";
import type { Job } from "@/lib/jobs";
import { LocalProcessNote, OutcomePicker, TopicField } from "../run/controls";
import RunTrace from "../run/RunTrace";
import type { useResearchRun } from "../run/useResearchRun";
import { NOTEBOOK_COUNTS } from "../../_shared/notebook/notebook";
import Notice from "../../_shared/ui/Notice";

type Run = ReturnType<typeof useResearchRun>;

export default function TopicPanel({
  run,
  topic,
  setTopic,
  job,
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
  job?: Job;
  running: boolean;
  onStart: () => void;
  onAbort: () => void;
  onClear: () => void;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onGoToBoard: () => void;
}) {
  const ready = run.state.status === "done";
  const pct = Math.round((job?.progress ?? 0) * 100);

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

        {running && (
          <div
            data-testid="running-note"
            className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-jetbrains text-[11px] tracking-[0.14em] text-cyan-200 uppercase">
                running in the background
              </p>
              <span className="font-jetbrains text-[10px] text-white/40">{pct}%</span>
            </div>
            <p className="mt-1.5 text-[13px] text-slate-300">
              You can leave this step. The bell reports the result.
            </p>
            <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full bg-cyan-300/70 transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {run.state.status !== "idle" && !running && (
        <section className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
          <p className="font-jetbrains text-[11px] tracking-[0.16em] text-white/50 uppercase">run log</p>
          <div className="mt-3">
            <RunTrace state={run.state} emitted={run.emitted} />
          </div>

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

      {run.state.status === "idle" && !running && (
        <Notice severity="info" title="no notebook yet">
          <p>Run the research, or load the saved Bitcoin run, and the board unlocks.</p>
        </Notice>
      )}
    </>
  );
}
