"use client";

import { stateOf, type Card } from "../scope";
import type { ScopeApi } from "../useScope";

/** like · deepen.
 *
 *  Scoping moved to the card itself — it is the one thing done to every card, so
 *  it gets the whole target. What remains here are the two OCCASIONAL signals,
 *  and they stay as explicit buttons for exactly that reason: they must not be
 *  triggerable while sweeping a column.
 *
 *  They still do different things and still look different. `like` changes
 *  nothing in this script (it trains the tone profile); `deepen` routes backward
 *  to the next research run. A surface that rendered them identically would
 *  teach the creator they are interchangeable, and they are not. */
export default function CardActions({ card, api, compact }: { card: Card; api: ScopeApi; compact?: boolean }) {
  const s = stateOf(api.scope, card.id);
  const pad = compact ? "px-2 py-0.5" : "px-2.5 py-1";
  return (
    <div className="font-jetbrains flex flex-wrap items-center gap-1.5 text-label">
      <button
        data-testid={`like-${card.id}`}
        onClick={() => api.toggle(card.id, "liked")}
        title="A preference signal. Changes nothing in this script — it is training data for your tone profile."
        className={`rounded-full border tracking-[0.1em] transition ${pad} ${
          s.liked
            ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-200"
            : "border-white/12 text-white/40 hover:border-emerald-400/30 hover:text-emerald-200/80"
        }`}
      >
        {s.liked ? "liked" : "like"}
      </button>

      <button
        data-testid={`deepen-${card.id}`}
        onClick={() => api.toggle(card.id, "deepen")}
        title="Ask the next research run to go further here. Routes backward, not into this script."
        className={`rounded-full border tracking-[0.1em] transition ${pad} ${
          s.deepen
            ? "border-cyan-400/45 bg-cyan-400/10 text-cyan-200"
            : "border-white/12 text-white/40 hover:border-cyan-400/30 hover:text-cyan-200/80"
        }`}
      >
        {s.deepen ? "deepen queued" : "deepen"}
      </button>
    </div>
  );
}
