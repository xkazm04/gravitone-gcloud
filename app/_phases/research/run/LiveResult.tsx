"use client";

// WHAT A REAL RUN PRODUCED — the notebook, its provenance, and its receipt.
//
// The counterpart to `StandInNote` (guided/RunStage.tsx), and written against
// the same rule: a surface that fakes a completed run must say that is what it
// did — so a surface that DOES complete a run must say that with the same
// clarity, and must say what kind of run it was. Two notebooks can be on this
// step at once and they are different objects:
//
//   REPLAYED   the saved 2026-08-11 Bitcoin run. Somebody else's completed
//              research, drawn from a fixture, struck through against the
//              creator's own topic by `StandInNote`.
//   REASONED   this notebook. The creator's own topic, a real engine, real
//              money, minutes ago — and NOT SEARCHED, which is the one thing
//              this card must never let a reader forget.
//
// ── WHY "REASONED" AND NOT "RESEARCHED" ────────────────────────────────────
//
// pipeline/RESEARCH-PROMPT.md § Phase 1 asks for 4–8 web searches. The engine
// behind /api/research has no tools on either rung — the local transport spawns
// `--allowed-tools "" --max-turns 1` and the cloud adapter declares none — so
// every source in this notebook is the model's RECOLLECTION of a publication,
// not a retrieval of one. A recollected citation is the most confident-looking
// wrong thing a language model produces, and calling the result "researched"
// would put this app's own name behind it.
//
// So the word on the card is `reasoned`, the provenance chip carries it, and the
// warn hint says what it costs the reader: check the sources. That is the same
// machinery `StandInNote` uses for the replay — a chip and one clause — pointed
// at a different, and newer, kind of dishonesty.
//
// ── WHAT THIS CARD DOES NOT DO ─────────────────────────────────────────────
//
// It does not unlock the triage board, and the line at its foot says so. The
// board, the conclusions deck and the scope arithmetic are all built from the
// SHIPPED FIXTURE (`_shared/notebook/cards.ts`), so dealing them under a
// creator's own topic would put Bitcoin cards behind their heading — the exact
// substitution this step already fights. Wiring the board onto a live notebook
// is real work in another file and is not smuggled in here.

import { useEffect, useState } from "react";

import { CHIP_CLASS, Hint, TALLY_TONE } from "@/components/ui/signal";

import Notice from "../../_shared/ui/Notice";
import type { EngineReceipt, LiveState } from "./live";
import { secs } from "./useResearchRun";

/** THE PROVENANCE, DRAWN RATHER THAN NARRATED — `StandInNote`'s shape, for the
 *  other kind of notebook. The topic is NOT struck through here, because this
 *  time it is the notebook's own subject: the route re-stamps it from what the
 *  creator typed rather than trusting the model's echo. */
export function ReasonedNote({ topic, engine }: { topic: string; engine: EngineReceipt }) {
  return (
    <span data-testid="reasoned-note" className="flex flex-wrap items-center gap-1.5">
      <span className={`${CHIP_CLASS} ${TALLY_TONE.cyan}`}>
        <span aria-hidden className="opacity-60">reasoned</span>
        <span className="sr-only">this notebook was reasoned about:</span>
        {topic}
      </span>
      {/* The MODEL is named, not just the fact. "Every source is a recollection"
          is the warning; whose recollection it was is what makes it checkable —
          and it is the same string the receipt below carries, so the two cannot
          disagree about which engine wrote this. */}
      <Hint variant="warn" tone="amber" label="What “reasoned” means here">
        no search ran — every source is {engine.model}’s recollection
      </Hint>
    </span>
  );
}

/** The receipt, in one line: which engine, which rung, what it cost.
 *
 *  NEVER `$0.00`. lib/text/pricing.ts's first rule is "never invent a price",
 *  and `costBasis: "unpriced"` is a decision rather than a missing number — so
 *  it renders as the word, exactly as the imaging and music surfaces render
 *  theirs. `vendor-reported` is the local CLI's own `total_cost_usd`, which is
 *  the one figure on this path that is not an estimate of anything. */
function Receipt({ engine, at }: { engine: EngineReceipt; at: number }) {
  const cost =
    engine.costUsd === undefined
      ? engine.costBasis === "unpriced"
        ? "cost unpriced"
        : "cost not reported"
      : `$${engine.costUsd.toFixed(3)}${engine.costBasis === "estimated" ? " est." : ""}`;
  return (
    <p className="font-jetbrains text-label text-white/35">
      {engine.provider} · {engine.model} · {engine.rung} rung · {cost} ·{" "}
      {secs(engine.durationMs)}
      {at ? ` · ${new Date(at).toLocaleString()}` : ""}
    </p>
  );
}

/** Elapsed seconds, counted rather than animated.
 *
 *  MOTION IS ENTRANCE-ONLY (app/globals.css). A spinner would be inside exempt
 *  class B — its lifetime IS the work's lifetime — but that file names the seven
 *  files that carry one, and the same block says the elapsed-seconds count
 *  "carries the same information without moving". So it is counted: one
 *  interval, no loop, and correct under prefers-reduced-motion by construction. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{secs(Math.max(0, now - since))}</>;
}

export default function LiveResult({ state }: { state: LiveState }) {
  if (state.status === "idle") return null;

  if (state.status === "running")
    return (
      <div
        data-testid="live-run-running"
        role="status"
        className="rounded-2xl border border-violet-400/20 bg-violet-400/[0.03] p-5"
      >
        <p className="font-jetbrains text-label tracking-[0.16em] text-violet-200/80 uppercase">
          a real run · <Elapsed since={state.startedAt} />
        </p>
        <p className="font-hanken mt-2 text-content leading-relaxed text-slate-300">
          The engine is writing a notebook about “{state.topic}”. This is minutes, not seconds, and it
          is billing right now — leaving the step does not cancel it, and the bell reports the result.
        </p>
      </div>
    );

  if (state.status === "failed")
    return (
      <div data-testid="live-run-failed">
        <Notice severity="error" title="the real run did not produce a notebook">
          {/* The route's own sentence, whatever it was. At the bottom of the
              ladder that sentence names every engine that was tried and why each
              dropped out (lib/text/errors.ts::noEngine) — which is the remedy,
              and is why nothing here re-words it. */}
          <p data-testid="live-run-error">{state.detail}</p>
          {state.findings && state.findings.length > 0 && (
            // The schema report. Long on purpose: the fix for a `bad-response`
            // is a prompt change, and one finding at a time is a prompt edited
            // five times for one run's worth of information.
            <ul className="mt-2 list-disc space-y-1 pl-5 text-label opacity-80">
              {state.findings.slice(0, 12).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
              {state.findings.length > 12 && <li>…and {state.findings.length - 12} more.</li>}
            </ul>
          )}
        </Notice>
      </div>
    );

  const nb = state.notebook;
  const counts = {
    facts: nb.facts?.length ?? 0,
    mechanisms: nb.mechanisms?.length ?? 0,
    reversals: nb.reversals?.length ?? 0,
    gaps: nb.researchGaps?.length ?? 0,
  };

  return (
    <div
      data-testid="live-notebook"
      className="gt-rise overflow-hidden rounded-2xl border border-violet-400/25 bg-violet-400/[0.03]"
    >
      <div aria-hidden className="h-1.5 bg-gradient-to-r from-violet-400/50 via-cyan-400/20 to-transparent" />
      <div className="p-6">
        <p className="font-jetbrains text-label tracking-[0.16em] text-violet-200/80 uppercase">
          your own notebook
        </p>
        <h3 className="font-instrument mt-1.5 text-2xl leading-snug text-slate-100">{state.topic}</h3>
        <div className="mt-2">
          <ReasonedNote topic={state.topic} engine={state.engine} />
        </div>

        {/* THE ARGUMENT, not a preview of one. `question` and `verdict` are the
            two fields NOTEBOOK-SCHEMA says are written DURING research — the
            question the video answers and its one-sentence answer — so they are
            what a creator needs to see to know whether the run was any good. */}
        <p className="font-hanken mt-4 text-content leading-relaxed text-slate-300">{nb.question}</p>
        <p className="font-hanken mt-2 text-content leading-relaxed text-slate-100">{nb.verdict}</p>

        {/* The tension is the load-bearing field: a notebook without one is a
            failed notebook, and its strength is the honest self-assessment the
            prompt spends a whole phase on. */}
        {nb.tension && (
          <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <p className="font-jetbrains text-label tracking-[0.14em] text-white/45 uppercase">
              the tension · {nb.tension.strength}
            </p>
            <p className="font-hanken mt-1.5 text-content leading-relaxed text-slate-300">
              <span className="text-white/45">expected · </span>
              {nb.tension.expectation}
            </p>
            <p className="font-hanken mt-1 text-content leading-relaxed text-slate-300">
              <span className="text-white/45">actually · </span>
              {nb.tension.reality}
            </p>
          </div>
        )}

        <p className="font-jetbrains mt-4 text-label text-white/40">
          {counts.facts} facts · {counts.mechanisms} mechanisms · {counts.reversals} reversals ·{" "}
          {counts.gaps} declared gap{counts.gaps === 1 ? "" : "s"}
        </p>

        {/* THE GAPS ARE SHOWN, not filed. Phase 9 requires the run to say what
            it did not do, and the first line of it on this path is always "no
            search was run". A notebook whose gaps are only in the JSON is a
            notebook whose gaps nobody reads. */}
        {counts.gaps > 0 && (
          <ul className="font-hanken mt-2 list-disc space-y-1 pl-5 text-label leading-relaxed text-amber-200/70">
            {nb.researchGaps.slice(0, 4).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
            {counts.gaps > 4 && <li className="text-white/35">…and {counts.gaps - 4} more.</li>}
          </ul>
        )}

        <div className="mt-4 border-t border-white/8 pt-3">
          <Receipt engine={state.engine} at={state.at} />
          {/* WHERE THIS NOTEBOOK CAN AND CANNOT GO, said plainly. It is saved
              with the project (step record "research-notebook") and it carries
              its own receipt; the triage board and everything after it are still
              built from the shipped fixture, and pretending otherwise would be
              the substitution this step exists to refuse. */}
          <p className="font-jetbrains mt-1.5 text-label text-white/30">
            saved with this project · the triage board below still reads the saved 2026-08-11 run
          </p>
        </div>
      </div>
    </div>
  );
}
