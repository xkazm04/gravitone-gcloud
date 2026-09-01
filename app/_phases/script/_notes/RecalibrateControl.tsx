"use client";

// Run the recalibration, then decide what to do with what came back.
//
// The rules it enforces: one run at a time, a candidate is never auto-accepted,
// and a plan that does not fit the runtime says so.
//
// The running state shows ELAPSED TIME and nothing else. It used to draw a
// percentage bar off a nine-second mock timer while a minutes-long Claude Opus 5
// turn was still in flight — a duration the app did not know, animated as though
// it did. An indeterminate bar is the honest shape for work with no schedule.
//
// THE GATE REACHES THE BUTTON. A blocking verdict does not disable accepting —
// `gate.ts` is lexical and says so about itself, and a checker that can strand a
// script its author knows is fine makes running the gate the expensive choice.
// It makes the click DELIBERATE, and the version keeps the receipt
// (versions.ts::GateOverride). A clean candidate is one click, unchanged.

import { useEffect, useState } from "react";

import { RENDERS } from "../renders";
import { overrideFrom, overrideLineOf, receiptOf } from "../versions";
import { inertNotes } from "../recalibrate";
import { MODEL } from "@/lib/model";
import DeclinedList, { declinedCount } from "./DeclinedList";
import type { GateRollup } from "../gate";
import type { VersionsApi } from "../useVersions";

/** Elapsed, in the unit the number deserves. Minutes-long work should read as
 *  minutes, not as a three-digit second count. */
function elapsedSince(started: number, now: number) {
  const s = Math.max(0, Math.round((now - started) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export default function RecalibrateControl({ api, gate }: { api: VersionsApi; gate?: GateRollup }) {
  // The clock only exists while something is running, so it is created and
  // destroyed with the run rather than reset inside an effect body.
  const [now, setNow] = useState(() => Date.now());
  useTicker(api.running, setNow);

  // ARMED = the first of the two deliberate actions has been taken, and it is
  // DERIVED rather than reset.
  //
  // It was `useState(false)` plus `useEffect(() => setArmed(false), [staged])`,
  // and an effect fires after the render it is correcting has already been
  // committed. So a newly staged candidate got one painted frame carrying the
  // PREVIOUS candidate's arming: the button read "record the override and
  // accept", and its handler — which reads `armed` at click time — would have
  // spent `overrideFrom(gate, …)` on a verdict the creator never saw. Reachable
  // by arming on a blocked candidate, discarding, and running again.
  //
  // That is the one thing the comment here always said it prevented ("an
  // override armed against one verdict may not be spent on another"), and a
  // reset cannot prevent it, because a reset is always one frame late. Storing
  // WHICH candidate the arming belongs to makes the stale state unrepresentable
  // instead of merely short-lived — the same move `hydratedFor` makes in
  // useScope and useBeatPicks.
  const staged = api.candidate?.createdAt;
  const [armedFor, setArmedFor] = useState<number | null>(null);
  const armed = staged !== undefined && armedFor === staged;

  const blocked = Boolean(gate?.blocked);
  const n = api.notes.length;
  const inert = inertNotes(api.notes).length;
  // Only a recalibrated baseline can have declined anything — the original
  // renders were not produced from notes.
  const declinedBaseline = api.baseline.basedOn ? declinedCount(api.baseline) : 0;
  // The engine does not always itemise. Asked to descope steel-man evidence it
  // explained itself in `summary` and returned an empty `refusals[]` — so a
  // record keyed only on the itemised lists still lost the reasoning. The
  // summary is part of the version's history too.
  // An override is part of that record too, and the loudest part: a baseline
  // accepted over a violation says so for as long as it IS the baseline, not
  // only in the second the button was clicked.
  const baselineHasRecord =
    Boolean(api.baseline.basedOn) &&
    (declinedBaseline > 0 || Boolean(api.baseline.summary) || Boolean(api.baseline.override));

  if (api.candidate) {
    const over = RENDERS.filter((r) => (api.candidate!.budget[r.id]?.overrunS ?? 0) > 0);
    return (
      <div data-testid="candidate-bar" className="rounded-xl border border-cyan-400/30 bg-cyan-400/[0.06] p-2.5">
        <p className="font-jetbrains text-content tracking-[0.14em] text-cyan-200 uppercase">
          {api.candidate.label} · {api.candidate.notes.length} note
          {api.candidate.notes.length === 1 ? "" : "s"}
          {api.candidate.engine === "simulated" && (
            <span className="ml-1.5 text-amber-300">· simulated</span>
          )}
        </p>
        {/* The reason for a fallback belongs BESIDE the fallback's result. It
            used to render only in the idle state, so it was invisible at exactly
            the moment the creator was looking at output it explains. */}
        {api.engineNote && (
          <p data-testid="engine-note" className="font-jetbrains mt-1.5 text-content leading-snug text-amber-200/90">
            {api.engineNote}
          </p>
        )}
        {api.candidate.summary && (
          <p className="mt-1 text-content leading-snug text-slate-300">{api.candidate.summary}</p>
        )}
        {/* What it cost, beside the button that decides whether it was worth it. */}
        {receiptOf(api.candidate) && (
          <p
            data-testid="candidate-receipt"
            title={
              api.candidate.engineRun?.sessionId
                ? `claude session ${api.candidate.engineRun.sessionId}`
                : undefined
            }
            className="font-jetbrains mt-1.5 text-label text-white/40"
          >
            {receiptOf(api.candidate)}
          </p>
        )}
        {over.length > 0 && (
          <p data-testid="overrun" className="font-jetbrains mt-1.5 text-content leading-snug text-amber-200">
            over budget —{" "}
            {over.map((r) => `${r.engineLabel} +${api.candidate!.budget[r.id].overrunS}s`).join(" · ")}
          </p>
        )}

        {blocked && (
          <p data-testid="gate-blocking" className="font-jetbrains mt-1.5 text-content leading-snug text-rose-200">
            The gate is blocking on {gate!.blocking.join(", ")} — {gate!.violations} finding
            {gate!.violations === 1 ? "" : "s"}, {gate!.enforced}% of it enforced. It reads a narrow
            lexical band, so it cannot stop you; accepting anyway is recorded on the version.
          </p>
        )}

        <DeclinedList version={api.candidate} />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {/* Two deliberate actions when the gate blocks, one when it does not.
              The label changes with the meaning: the first click no longer
              accepts, so it may not go on saying that it does. */}
          <button
            data-testid="accept-candidate"
            onClick={() =>
              blocked && !armed
                ? setArmedFor(staged ?? null)
                : api.accept(armed && gate ? overrideFrom(gate, Date.now()) : undefined)
            }
            className={`font-jetbrains rounded-full border px-3 py-1 text-label transition ${
              blocked
                ? "border-rose-400/45 bg-rose-400/10 text-rose-200 hover:bg-rose-400/20"
                : "border-cyan-400/45 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20"
            }`}
          >
            {!blocked ? "accept as baseline" : armed ? "record the override and accept" : "accept over the gate…"}
          </button>
          <button
            data-testid={armed ? "cancel-override" : "discard-candidate"}
            onClick={() => (armed ? setArmedFor(null) : api.discard())}
            className="font-jetbrains rounded-full border border-white/15 px-3 py-1 text-label text-white/60 transition hover:bg-white/5"
          >
            {armed ? "not yet" : "discard"}
          </button>
        </div>
      </div>
    );
  }

  if (api.running)
    return (
      <div data-testid="recalibrating" className="rounded-xl border border-cyan-400/25 bg-cyan-400/[0.04] p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-jetbrains text-content tracking-[0.14em] text-cyan-200 uppercase">
            recalibrating
          </p>
          <span data-testid="recalibrate-elapsed" className="font-jetbrains text-label text-white/40">
            {api.runningSince === null ? "starting…" : elapsedSince(api.runningSince, now)}
          </span>
        </div>
        {/* Indeterminate on purpose — see the header note. */}
        <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-full animate-pulse rounded-full bg-cyan-300/70" />
        </div>
        <p className="font-jetbrains mt-1.5 text-content leading-snug text-white/35">
          a real {MODEL} turn — minutes, not seconds. the pad stays locked until it lands.
        </p>
      </div>
    );

  return (
    <div className="space-y-1.5">
      <button
        data-testid="run-recalibration"
        onClick={api.run}
        disabled={!n}
        className="font-jetbrains w-full rounded-xl border border-cyan-400/40 bg-cyan-400/[0.08] px-3 py-2 text-label text-cyan-200 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/25"
      >
        {n ? `Recalibrate · ${n} note${n === 1 ? "" : "s"}` : "Recalibrate"}
      </button>
      <div className="flex items-center justify-between gap-2">
        {/* Derived from the last result's provenance, never hand-removed: the
            label disappears on its own when a real model produced the version,
            and comes back on its own if the call falls back. */}
        <span className="font-jetbrains text-label text-white/30">
          {api.engineNote ? "simulated fallback" : `local claude code · ${MODEL} · edits, not rewrites`}
        </span>
        {n > 0 && (
          <button
            onClick={api.clearNotes}
            className="font-jetbrains text-label text-white/30 transition hover:text-rose-300"
          >
            clear all
          </button>
        )}
      </div>
      {inert > 0 && (
        <p className="font-jetbrains text-content text-white/35">{inert} will not move a bar</p>
      )}

      {/* A candidate is staged, never persisted — accepting is what makes a
          version real. So closing the project throws one away, and saying so is
          the difference between "my run vanished" and "I never accepted it". */}
      {api.lostCandidate && (
        <p data-testid="lost-candidate" className="font-jetbrains text-content leading-snug text-amber-200/90">
          {api.lostCandidate.label} was staged when this project last closed and never accepted, so it is
          gone.{" "}
          {api.lostCandidate.notes === 1
            ? "The note that produced it is still on the pad"
            : `The ${api.lostCandidate.notes} notes that produced it are still on the pad`}{" "}
          — recalibrate to rebuild it.
        </p>
      )}

      {/* THE ACCEPTED BASELINE'S OWN REFUSALS.
          Accepting clears the candidate bar, which used to be the only place
          these were shown — so "we asked for X and it was declined because Y"
          disappeared exactly when it became the version of record. It is part of
          the baseline's history, and it stays visible until the baseline changes. */}
      {baselineHasRecord && (
        <div
          data-testid="baseline-declined"
          className="mt-1 rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
        >
          <p className="font-jetbrains text-content tracking-[0.14em] text-white/45 uppercase">
            {api.baseline.label}
            {declinedBaseline > 0 ? ` · declined ${declinedBaseline}` : ""}
          </p>
          {overrideLineOf(api.baseline) && (
            <p data-testid="baseline-override" className="font-jetbrains mt-1 text-content leading-snug text-rose-200/90">
              {overrideLineOf(api.baseline)}
            </p>
          )}
          {api.baseline.summary && (
            <p className="mt-1 text-content leading-snug text-slate-300">{api.baseline.summary}</p>
          )}
          <DeclinedList version={api.baseline} />
        </div>
      )}
      {api.engineNote && (
        <p data-testid="engine-note" className="font-jetbrains text-content leading-snug text-amber-200/90">
          {api.engineNote}
        </p>
      )}
    </div>
  );
}

/** The elapsed-time clock, alive only while a run is.
 *
 *  Split out so the effect body no longer opens with `setNow(Date.now())` — a
 *  synchronous setState inside an effect, and one of this area's ratcheted lint
 *  findings. The reset it removed bought a first frame that was exact; without
 *  it a second run on a still-mounted pad reads a `now` up to one second stale,
 *  which `elapsedSince`'s own `Math.max(0, …)` renders as "0s" until the first
 *  tick. A run that has been going for under a second reading "0s" is the right
 *  answer arriving a beat early, not a wrong one — and the label beside it says
 *  "minutes, not seconds". */
function useTicker(running: boolean, set: (n: number) => void) {
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => set(Date.now()), 1_000);
    return () => clearInterval(iv);
  }, [running, set]);
}
