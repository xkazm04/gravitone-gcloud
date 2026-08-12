"use client";

// Leaves the matrix variants share, so a usage state means the same thing
// whichever way you are reading the grid — and so a before/after comparison is
// computed one way rather than three.

import { DIMENSIONS } from "../../_shared/notebook/dimensions";
import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import { stateOf } from "../../research/scope";
import { orphanedCuts, type Usage } from "../impact";
import { RENDERS } from "../renders";
import { usageIn, type Version } from "../versions";

export { DIMENSIONS, RENDERS };

export const secs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}` : `${s}s`);

/** Signed delta, for before/after. `null` when there is nothing to compare. */
export function deltaOf(base: Version, cand: Version | null, renderId: string, cardId: string) {
  if (!cand) return null;
  const a = usageIn(base, renderId, cardId);
  const b = usageIn(cand, renderId, cardId);
  if (a.kind === b.kind && a.seconds === b.seconds) return null;
  return { from: a, to: b, d: b.seconds - a.seconds };
}

export function DeltaTag({ d }: { d: number }) {
  if (!d) return null;
  return (
    <span className={`font-jetbrains text-[10px] ${d > 0 ? "text-emerald-300" : "text-rose-300"}`}>
      {d > 0 ? "+" : ""}
      {d}s
    </span>
  );
}

export const TONE: Record<Usage["kind"], { cell: string; text: string; mark: string }> = {
  spoken: { cell: "bg-cyan-400/[0.10] border-cyan-400/25", text: "text-cyan-100", mark: "" },
  cut: { cell: "bg-rose-400/[0.07] border-rose-400/25", text: "text-rose-200", mark: "✕" },
  unused: { cell: "border-white/6", text: "text-white/25", mark: "0s" },
};

/** The scope control. Descoping here writes the record the triage board reads —
 *  this is not a Step 2 shadow copy. */
export function ScopePip({ card, api, size = "sm" }: { card: Card; api: ScopeApi; size?: "sm" | "md" }) {
  const s = stateOf(api.scope, card.id);
  const locked = card.required;
  const dims = size === "md" ? "h-5 w-5 text-[11px]" : "h-4 w-4 text-[10px]";
  return (
    <button
      data-testid={`scope-${card.id}`}
      onClick={() => !locked && api.toggle(card.id, "descoped")}
      disabled={locked}
      title={
        locked
          ? card.requiredWhy
          : s.descoped
            ? "Out of scope. Click to bring it back."
            : "In scope. Click to descope — the triage board will agree."
      }
      className={`grid shrink-0 place-items-center rounded border transition ${dims} ${
        locked
          ? "cursor-not-allowed border-white/10 text-white/20"
          : s.descoped
            ? "border-amber-400/60 bg-amber-400/10 text-amber-300 hover:border-amber-400"
            : "border-white/20 text-transparent hover:border-cyan-400/60 hover:text-cyan-400/40"
      }`}
      aria-label={s.descoped ? `${card.id} is out of scope` : `${card.id} is in scope`}
    >
      {s.descoped ? "—" : "✓"}
    </button>
  );
}

export function MatrixFootnotes({ cards, version }: { cards: Card[]; version: Version }) {
  const ids = new Set(cards.map((c) => c.id));
  const orphans = orphanedCuts(ids);
  const untouched = cards.filter((c) => RENDERS.every((r) => usageIn(version, r.id, c.id).kind === "unused"));
  const conclusions = untouched.filter((c) => c.kind === "conclusion").length;

  return (
    <div className="mt-4 space-y-1.5 border-t border-white/8 pt-3">
      <p className="font-jetbrains text-[11px] leading-relaxed text-white/40">
        {untouched.length} of {cards.length} cards are in no render
        {conclusions > 0 && (
          <>
            {" "}— including all {conclusions} conclusions, which were reasoned{" "}
            <span className="text-white/60">after</span> these three scripts were written. That is a
            gap in the scripts, not in the research.
          </>
        )}
      </p>
      {orphans.length > 0 && (
        <p data-testid="matrix-orphan-cuts" className="font-jetbrains text-[11px] leading-relaxed text-rose-300/90">
          {orphans.length} cut record{orphans.length === 1 ? "" : "s"} name{orphans.length === 1 ? "s" : ""} a fact the
          notebook no longer has ({[...new Set(orphans.map((o) => o.factId))].join(", ")}) — the
          decision was real, but it has no row to sit in.
        </p>
      )}
      <p className="font-jetbrains text-[11px] leading-relaxed text-white/30">
        Seconds are computed from each render’s own beat marks, not estimated. Runtime not
        attributed to any card is hook, promise and close.
      </p>
    </div>
  );
}
