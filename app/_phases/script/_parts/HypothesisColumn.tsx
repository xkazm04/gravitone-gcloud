"use client";

import { NOTEBOOK } from "../../_shared/notebook/notebook";
import ConstraintLedger from "./ConstraintLedger";
import GatePanel from "./GatePanel";
import { BandMeter, CheckList } from "./Meters";
import { RENDER_BY_ID, mmss } from "../renders";
import type { Beat, ScriptRender } from "../types";

/** One render, measured. The rows are identical across columns on purpose —
 *  the value of this surface is reading ACROSS, not down.
 *
 *  `beats` is the chain this column is actually showing. When a recalibration
 *  rewrote it, three of the things drawn here stop being about the same script
 *  and have to say so: the fixture's word count, the hand-written craft checks
 *  and the hand-authored constraint ledger were all typed against the ORIGINAL
 *  chain. The word count is cheap to recompute honestly, so it is. The other
 *  two are prose a person wrote, and no amount of UI can re-derive them — so
 *  they are labelled rather than silently reused. */
export default function HypothesisColumn({
  render: r,
  beats,
  chainLabel,
  adopted,
  onAdopt,
  expanded,
  onToggle,
}: {
  render: ScriptRender;
  beats?: Beat[];
  chainLabel?: string;
  adopted: boolean;
  onAdopt: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const fit = NOTEBOOK.engineFit.find((e) => e.renderId === r.id);
  const chain = beats ?? r.beats;
  const rewritten = chain !== r.beats;
  const words = rewritten
    ? chain.map((b) => b.text).join(" ").split(/\s+/).filter(Boolean).length
    : r.words;

  return (
    <article
      data-testid={`render-${r.id}`}
      className={`flex flex-col rounded-2xl border p-4 transition ${
        adopted ? "border-cyan-400/45 bg-cyan-400/[0.06]" : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <header>
        <p className="font-jetbrains flex items-baseline justify-between text-[11px]">
          <span className="tracking-[0.14em] text-white/45 uppercase">{r.engineLabel}</span>
          <span
            className={
              fit?.fit === "excellent" ? "text-emerald-300" : fit?.fit === "good" ? "text-cyan-300/80" : "text-white/35"
            }
          >
            fit: {fit?.fit ?? "—"}
          </span>
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
          pleasure: {r.pleasure}. Reads like {r.feelsLike}.
        </p>
        {r.derivedFromId && (
          <p className="font-jetbrains mt-1 text-[11px] text-violet-200/80">
            derived from the {RENDER_BY_ID[r.derivedFromId].engineLabel} — no additional research
          </p>
        )}
      </header>

      <div className="mt-3 space-y-2.5 border-t border-white/8 pt-3">
        <p className="font-jetbrains flex items-baseline justify-between text-[11px] tracking-[0.14em] uppercase">
          <span className="text-white/35">measured</span>
          {rewritten && (
            <span data-testid={`chain-${r.id}`} className="text-cyan-200/80">{chainLabel ?? "rewritten"}</span>
          )}
        </p>
        {r.turns !== null && r.turnBand ? (
          <BandMeter
            label="turns"
            value={r.turns}
            band={r.turnBand}
            belowNote="below the band reads as a lecture"
            aboveNote="above the band, no conclusion stands long enough to matter"
          />
        ) : (
          <p className="font-jetbrains text-[11px] text-white/35">
            turns — n/a for this engine ({r.engine === "adjudication" ? "candidates, not turns" : "one turn by construction"})
          </p>
        )}
        <BandMeter
          label="essay words"
          value={words}
          band={[Math.round(r.wordBudget * 0.9), r.wordBudget]}
          aboveNote="over the budget the duration bought"
        />
        <p className="font-jetbrains text-[11px] text-white/45">
          {mmss(r.durationS)} at {r.wpm} wpm · promise form: {r.promiseForm} · {r.questionsAloud}{" "}
          question{r.questionsAloud === 1 ? "" : "s"} aloud
        </p>
        {rewritten && (
          <p className="font-jetbrains text-[11px] leading-snug text-amber-200/70">
            words are counted from this version&rsquo;s own chain. Turns, questions aloud and the
            promise form are the original render&rsquo;s and were not re-measured.
          </p>
        )}
        <p className="font-jetbrains text-[11px] text-white/35">
          template {r.template}
          {r.template !== NOTEBOOK.templateIntent && " — outside the notebook's intent, by design"}
        </p>
        {r.causalDensityPct === null && (
          <p className="font-jetbrains text-[11px] text-white/35">
            causal-opener density — not measured on this render. Shown as unmeasured rather than as a
            pass.
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-white/8 pt-3">
        <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/35 uppercase">
          craft checks
        </p>
        <div className="mt-2">
          <CheckList rows={r.checks} />
        </div>
        {rewritten && (
          <p
            data-testid={`checks-original-${r.id}`}
            className="font-jetbrains mt-2 text-[11px] leading-snug text-amber-200/70"
          >
            typed by hand against the original chain and not re-run for this version. Of the three
            check blocks in this column, only the gate below reads the script on screen.
          </p>
        )}
      </div>

      <ConstraintLedger renderId={r.id} stale={rewritten} />
      {/* The computed gate sits BELOW the hand-authored ledger on purpose: where
          the two disagree, the one that read the render is the true one. And
          only one of the two can follow a rewrite, which is the sharpest
          argument this surface makes for computed checks over typed ones. */}
      <GatePanel renderId={r.id} beats={chain} chainLabel={chainLabel} />

      {(r.deviations.length > 0 || r.cutFacts.length > 0) && (
        <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
          {r.deviations.map((d) => (
            <p key={d} className="text-[12px] leading-snug text-amber-200/80">
              declared deviation — {d}
            </p>
          ))}
          {r.cutFacts.map((c) => (
            <p key={c.factId} className="text-[12px] leading-snug text-white/45">
              cut <span className="font-jetbrains text-white/60">{c.factId}</span> — {c.why}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-3">
        <button
          onClick={onToggle}
          className={`font-jetbrains rounded-full border px-3 py-1 text-[11px] transition ${
            expanded ? "border-cyan-400/40 text-cyan-200" : "border-white/12 text-white/50 hover:text-white/80"
          }`}
        >
          {expanded ? "hide the beats" : "read the beats"}
        </button>
        <button
          onClick={onAdopt}
          className="font-jetbrains rounded-full border border-white/12 px-3 py-1 text-[11px] text-white/50 transition hover:border-cyan-400/40 hover:text-cyan-200"
        >
          {adopted ? "adopted — undo" : "adopt this one"}
        </button>
      </div>
    </article>
  );
}
