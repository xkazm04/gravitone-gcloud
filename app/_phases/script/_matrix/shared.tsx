"use client";

// Leaves the matrix variants share, so a usage state means the same thing
// whichever way you are reading the grid — and so a before/after comparison is
// computed one way rather than three.

import { DIMENSIONS } from "../../_shared/notebook/dimensions";
import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import { stateOf, type Scope } from "../../research/scope";
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
    <span className={`font-jetbrains text-label ${d > 0 ? "text-emerald-300" : "text-rose-300"}`}>
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

/** "not taken" is a DEFAULT, "descoped" is a DECISION — the same two words the
 *  Research chips and ScopeBar use (scope.ts::OPT_IN_DEFAULT). Coverage used to
 *  fold both into "Out of scope" (uat 2026-09-05, HA-L1-5: "I keep those apart on
 *  purpose"). */
export function outWord(card: Card, scope: Scope): "in" | "not-taken" | "descoped" {
  const s = stateOf(scope, card.id);
  if (!s.descoped) return "in";
  return card.optIn ? "not-taken" : "descoped";
}

/** The scope control. Descoping here writes the record the triage board reads —
 *  this is not a Step 2 shadow copy. */
export function ScopePip({ card, api, size = "sm" }: { card: Card; api: ScopeApi; size?: "sm" | "md" }) {
  const out = outWord(card, api.scope);
  const locked = card.required;
  const dims = size === "md" ? "h-5 w-5 text-label" : "h-4 w-4 text-label";
  return (
    <button
      data-testid={`scope-${card.id}`}
      onClick={() => !locked && api.toggle(card.id, "descoped")}
      disabled={locked}
      title={
        locked
          ? card.requiredWhy
          : out === "descoped"
            ? "Descoped — you cut this. Click to bring it back."
            : out === "not-taken"
              ? "Not taken — a conclusion is out of scope by default. Click to take it."
              : "In scope. Click to descope — the triage board will agree."
      }
      className={`grid shrink-0 place-items-center rounded border transition ${dims} ${
        locked
          ? "cursor-not-allowed border-white/10 text-white/20"
          : out === "descoped"
            ? "border-amber-400/60 bg-amber-400/10 text-amber-300 hover:border-amber-400"
            : out === "not-taken"
              ? "border-white/15 text-white/35 hover:border-cyan-400/60"
              : "border-white/20 text-transparent hover:border-cyan-400/60 hover:text-cyan-400/40"
      }`}
      aria-label={
        out === "descoped"
          ? `${card.id} is descoped`
          : out === "not-taken"
            ? `${card.id} is not taken`
            : `${card.id} is in scope`
      }
    >
      {out === "descoped" ? "—" : out === "not-taken" ? "·" : "✓"}
    </button>
  );
}

/** THE CONFLICT — a card the creator took OUT that a render still SPEAKS. The
 *  scope is the creator's decision; the script is what a render said; here is
 *  the one place they meet, and until 2026-09-05 they disagreed silently
 *  (PR-L1-2: "the workflow I said I would refuse"). Returns the renders that
 *  still speak the card, with seconds, or an empty list. */
export function stillSpoken(version: Version, card: Card, scope: Scope): { renderId: string; label: string; seconds: number }[] {
  if (outWord(card, scope) === "in") return [];
  return RENDERS.flatMap((r) => {
    const u = usageIn(version, r.id, card.id);
    return u.kind === "spoken" ? [{ renderId: r.id, label: r.engineLabel, seconds: u.seconds }] : [];
  });
}

export function MatrixFootnotes({ cards, version, scope }: { cards: Card[]; version: Version; scope?: Scope }) {
  const ids = new Set(cards.map((c) => c.id));
  const orphans = orphanedCuts(ids);
  const conflicts = scope ? cards.filter((c) => stillSpoken(version, c, scope).length > 0) : [];
  const untouched = cards.filter((c) => RENDERS.every((r) => usageIn(version, r.id, c.id).kind === "unused"));
  const conclusions = untouched.filter((c) => c.kind === "conclusion").length;

  return (
    <div className="mt-4 space-y-1.5 border-t border-white/8 pt-3">
      <p className="font-jetbrains text-content leading-relaxed text-white/40">
        {untouched.length} of {cards.length} cards are in no render
        {conclusions > 0 && (
          <>
            {" "}— including all {conclusions} conclusions, which were reasoned{" "}
            <span className="text-white/60">after</span> these {RENDERS.length} scripts were written.
            That is a gap in the scripts, not in the research.
          </>
        )}
      </p>
      {conflicts.length > 0 && (
        <p data-testid="matrix-scope-conflicts" className="font-jetbrains text-content leading-relaxed text-rose-300/90">
          {conflicts.length} card{conflicts.length === 1 ? "" : "s"} out of scope {conflicts.length === 1 ? "is" : "are"}{" "}
          still spoken by a render ({conflicts.map((c) => c.id).join(", ")}) — the scope and these scripts
          disagree. These scripts were written against the full notebook; only a recalibration re-attributes
          them, and the gate does not check exclusions yet.
        </p>
      )}
      {orphans.length > 0 && (
        <p data-testid="matrix-orphan-cuts" className="font-jetbrains text-content leading-relaxed text-rose-300/90">
          {orphans.length} cut record{orphans.length === 1 ? "" : "s"} name{orphans.length === 1 ? "s" : ""} a fact the
          notebook no longer has ({[...new Set(orphans.map((o) => o.factId))].join(", ")}) — the
          decision was real, but it has no row to sit in.
        </p>
      )}
      <p className="font-jetbrains text-content leading-relaxed text-white/30">
        Seconds are computed from each render’s own beat marks, not estimated. A beat resting on
        several cards splits its seconds between them, so every column sums to the runtime it came
        from. Runtime not attributed to any card is hook, promise and close.
      </p>
    </div>
  );
}
