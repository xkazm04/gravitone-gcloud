"use client";

// Run the recalibration, then decide what to do with what came back.
//
// Shared by all three notebook placements, because the RULES are not a placement
// question: one run at a time, a candidate is never auto-accepted, and a plan
// that does not fit the runtime says so.

import { RENDERS } from "../renders";
import { inertNotes } from "../versions";
import type { VersionsApi } from "../useVersions";

export default function RecalibrateControl({ api }: { api: VersionsApi }) {
  const n = api.notes.length;
  const inert = inertNotes(api.notes).length;

  if (api.candidate) {
    const over = RENDERS.filter((r) => (api.candidate!.budget[r.id]?.overrunS ?? 0) > 0);
    return (
      <div data-testid="candidate-bar" className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] p-2.5">
        <p className="font-jetbrains text-[10px] tracking-[0.14em] text-cyan-200 uppercase">
          candidate staged · {api.candidate.label}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-slate-300">
          Built from {api.candidate.notes.length} note{api.candidate.notes.length === 1 ? "" : "s"}.
          Compare it in Coverage or the Spend bar — Candidates and Tracks stay on the baseline until
          you accept.
        </p>

        {over.length > 0 && (
          <p data-testid="overrun" className="font-jetbrains mt-1.5 text-[11px] leading-snug text-amber-200">
            {over.length} render{over.length === 1 ? "" : "s"} no longer fit:{" "}
            {over.map((r) => `${r.engineLabel} +${api.candidate!.budget[r.id].overrunS}s`).join(" · ")}.
            The runtime is fixed, so something has to give — this is not rescaled away for you.
          </p>
        )}

        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            data-testid="accept-candidate"
            onClick={api.accept}
            className="font-jetbrains rounded-full border border-cyan-400/45 bg-cyan-400/10 px-3 py-1 text-[11px] text-cyan-200 transition hover:bg-cyan-400/20"
          >
            accept as new baseline
          </button>
          <button
            data-testid="discard-candidate"
            onClick={api.discard}
            className="font-jetbrains rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 transition hover:bg-white/5"
          >
            discard, keep my notes
          </button>
        </div>
      </div>
    );
  }

  if (api.running)
    return (
      <div data-testid="recalibrating" className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-jetbrains text-[10px] tracking-[0.14em] text-cyan-200 uppercase">
            recalibrating
          </p>
          <span className="font-jetbrains text-[10px] text-white/40">{Math.round(api.progress * 100)}%</span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-slate-300">
          Notes are locked for this project until it lands.
        </p>
        <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
          <span
            className="block h-full rounded-full bg-cyan-300/70 transition-[width] duration-200"
            style={{ width: `${Math.round(api.progress * 100)}%` }}
          />
        </div>
      </div>
    );

  return (
    <div className="space-y-1.5">
      <button
        data-testid="run-recalibration"
        onClick={api.run}
        disabled={!n}
        className="font-jetbrains w-full rounded-xl border border-cyan-400/40 bg-cyan-400/[0.08] px-3 py-2 text-[12px] text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/25"
      >
        {n ? `Recalibrate from ${n} note${n === 1 ? "" : "s"}` : "No notes yet"}
      </button>
      {n > 0 && (
        <button
          onClick={api.clearNotes}
          className="font-jetbrains w-full text-[10px] text-white/30 transition hover:text-rose-300"
        >
          clear all notes
        </button>
      )}
      {inert > 0 && (
        <p className="font-jetbrains text-[10px] leading-snug text-white/35">
          {inert} of them ({inert === 1 ? "a note" : "notes"} about ordering or free text) will be
          sent but cannot move a bar in this prototype.
        </p>
      )}
      <p className="font-jetbrains text-[10px] leading-snug text-white/30">
        Simulated: the recalibration re-weights the research, it does not rewrite beat text.
      </p>
    </div>
  );
}
