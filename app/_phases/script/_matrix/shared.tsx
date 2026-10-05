"use client";

// Leaves the matrix variants share, so a usage state means the same thing
// whichever way you are reading the grid — and so a before/after comparison is
// computed one way rather than three.

import { Hint } from "@/components/ui/signal";

import { DIMENSIONS } from "../../_shared/notebook/dimensions";
import type { Card } from "../../_shared/notebook/cards";
import type { ScopeApi } from "../../research/useScope";
import type { Scope } from "../../research/scope";
import { orphanedCuts, type Usage } from "../impact";
import { RENDERS } from "../renders";
import { usageIn, type Version } from "../versions";
import { useNotes } from "../_notes/NotesContext";
import {
  conflictsIn,
  outWord,
  resolutionPlan,
  stillSpoken,
} from "../scopeConflicts";

export { DIMENSIONS, RENDERS, outWord, stillSpoken };

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



export function MatrixFootnotes({ cards, version, scope }: { cards: Card[]; version: Version; scope?: Scope }) {
  const ids = new Set(cards.map((c) => c.id));
  const orphans = orphanedCuts(ids);
  const conflictIds = scope ? conflictsIn(version, cards, scope) : [];
  const untouched = cards.filter((c) => RENDERS.every((r) => usageIn(version, r.id, c.id).kind === "unused"));
  const conclusions = untouched.filter((c) => c.kind === "conclusion").length;

  const notesCtx = useNotes();
  const existingNotes = notesCtx?.api.notes ?? [];
  const plan = scope
    ? resolutionPlan(version, cards, scope, existingNotes)
    : { stage: [], skipped: [], contested: [] };

  const handleResolveConflicts = () => {
    if (!notesCtx || notesCtx.api.running) return;
    for (const item of plan.stage) {
      notesCtx.api.addNote(item.cardId, item.kind);
    }
  };

  return (
    <div className="mt-4 space-y-1.5 border-t border-white/8 pt-3">
      {/* The count is the finding. "That is a gap in the scripts, not in the
          research" was the app arguing its own case beside it, and went; the one
          fact inside that sentence — WHEN the conclusions were reasoned — is a
          date, so it stays, behind the disclosure. */}
      <p className="font-jetbrains flex flex-wrap items-baseline gap-x-1.5 text-content leading-relaxed text-white/40">
        <span>
          {untouched.length} of {cards.length} cards are in no render
          {conclusions > 0 ? ` — including all ${conclusions} conclusions` : ""}
        </span>
        {conclusions > 0 && <Hint>reasoned after these {RENDERS.length} scripts were written</Hint>}
      </p>
      {conflictIds.length > 0 && (
        <div className="space-y-2">
          <p data-testid="matrix-scope-conflicts" className="font-jetbrains text-content leading-relaxed text-rose-300/90">
            {conflictIds.length} card{conflictIds.length === 1 ? "" : "s"} out of scope {conflictIds.length === 1 ? "is" : "are"}{" "}
            still spoken by a render ({conflictIds.join(", ")}) — the scope and these scripts
            disagree. These scripts were written against the full notebook; only a recalibration re-attributes
            them, and the gate does not check exclusions yet.
          </p>
          <div>
            <button
              type="button"
              data-testid="resolve-scope-conflicts"
              onClick={handleResolveConflicts}
              disabled={!notesCtx || notesCtx.api.running || plan.stage.length === 0}
              className="font-jetbrains rounded border border-rose-400/40 bg-rose-400/10 px-2.5 py-1 text-label text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {plan.stage.length > 0
                ? `Stage ${plan.stage.length} descope note${plan.stage.length === 1 ? "" : "s"}`
                : "Scope conflicts staged"}
            </button>
          </div>
        </div>
      )}
      {orphans.length > 0 && (
        <p data-testid="matrix-orphan-cuts" className="font-jetbrains text-content leading-relaxed text-rose-300/90">
          {orphans.length} cut record{orphans.length === 1 ? "" : "s"} name{orphans.length === 1 ? "s" : ""} a fact the
          notebook no longer has ({[...new Set(orphans.map((o) => o.factId))].join(", ")}) — the
          decision was real, but it has no row to sit in.
        </p>
      )}
    </div>
  );
}

/** How a second in this grid was arrived at — a definition of the unit, not an
 *  explanation of the tab. It used to be a three-sentence footnote printed under
 *  all three weight tabs; it is now one glyph, placed where the totals are
 *  named. The full statement, for the record and for whoever asks next:
 *  seconds are computed from each render's own beat marks, never estimated; a
 *  beat resting on several cards splits its seconds between them, so every
 *  column sums to the runtime it came from; runtime attributed to no card is
 *  hook, promise and close. */
export function SecondsHint() {
  return (
    <Hint label="how seconds are counted">
      from each render’s own beat marks · a shared beat splits its seconds · unattributed is hook,
      promise and close
    </Hint>
  );
}
