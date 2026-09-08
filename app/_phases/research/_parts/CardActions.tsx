"use client";

import { Heart, ListChecks, ListPlus, type LucideIcon } from "lucide-react";

import { stateOf, type Card } from "../scope";
import type { ScopeApi } from "../useScope";

/** like · deepen, AS MARKS (2026-09-08).
 *
 *  Scoping moved to the card itself — it is the one thing done to every card, so
 *  it gets the whole target. What remains here are the two OCCASIONAL signals,
 *  and they stay as real <button>s for exactly that reason: they must not be
 *  triggerable while sweeping a column, and CardTile's header explains at length
 *  why they must not be swallowed by the card's overlay target either.
 *
 *  WHY ICONS. Thirty-six cards each carried the words "like" and "deepen", so a
 *  column read as the same two labels seventy-two times and the CLAIMS — the
 *  thing being triaged — had to compete with them. A mark repeated is a texture;
 *  a word repeated is noise.
 *
 *  WHAT THE ICON CHANGE MUST NOT COST, and does not:
 *   · Each is still a real, keyboard-reachable <button> with a visible
 *     focus-visible ring. An icon inside a role=button subtree is presentational
 *     (ARIA), so the name comes from `aria-label` on the button itself and is
 *     the one the pressed state changes.
 *   · `aria-pressed` carries the state for anything that reads the page.
 *   · THE PRESSED STATE IS NOT A COLOUR CHANGE. `like` fills its heart; `deepen`
 *     swaps a plus for a tick. The glyph differs in shape before it differs in
 *     hue, which is the repo's rule that colour is never the only signal, and it
 *     is also why the deepen pair is a LIST icon: what "deepen" does is put the
 *     card on the follow-up queue, so + / ✓ on a list is the literal act.
 *   · They still look different from each other. `like` changes nothing in this
 *     script (it trains the tone profile); `deepen` routes backward into the
 *     next research run. Rendering them identically would teach the creator they
 *     are interchangeable, and they are not — so the tones stay apart and the
 *     `title` keeps the half a reader cannot guess. */
function ActionMark({
  testId,
  on,
  onToggle,
  Icon,
  name,
  title,
  filled,
  tone,
  pad,
}: {
  testId: string;
  on: boolean;
  onToggle: () => void;
  Icon: LucideIcon;
  /** The accessible name — the whole of it, because the glyph contributes none. */
  name: string;
  title: string;
  /** Fill the glyph when pressed. Only meaningful for a closed shape. */
  filled?: boolean;
  tone: { on: string; off: string };
  pad: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onToggle}
      aria-pressed={on}
      aria-label={name}
      title={title}
      className={`rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 ${pad} ${
        on ? tone.on : tone.off
      }`}
    >
      <Icon className={`h-4 w-4 ${filled && on ? "fill-current" : ""}`} aria-hidden />
    </button>
  );
}

export default function CardActions({ card, api, compact }: { card: Card; api: ScopeApi; compact?: boolean }) {
  const s = stateOf(api.scope, card.id);
  // Square-ish now that the content is a 16px glyph rather than a word.
  const pad = compact ? "p-1.5" : "p-2";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionMark
        testId={`like-${card.id}`}
        on={s.liked}
        onToggle={() => api.toggle(card.id, "liked")}
        Icon={Heart}
        filled
        name={s.liked ? `Liked: ${card.title}` : `Like: ${card.title}`}
        // The half a reader cannot guess from a heart.
        title="changes nothing in this script — it trains your tone profile"
        tone={{
          on: "border-emerald-400/45 bg-emerald-400/10 text-emerald-200",
          off: "border-white/12 text-white/40 hover:border-emerald-400/30 hover:text-emerald-200/80",
        }}
        pad={pad}
      />

      <ActionMark
        testId={`deepen-${card.id}`}
        on={s.deepen}
        onToggle={() => api.toggle(card.id, "deepen")}
        Icon={s.deepen ? ListChecks : ListPlus}
        name={s.deepen ? `Queued for deeper research: ${card.title}` : `Deepen: ${card.title}`}
        title="routes to the next research run, not into this script"
        tone={{
          on: "border-cyan-400/45 bg-cyan-400/10 text-cyan-200",
          off: "border-white/12 text-white/40 hover:border-cyan-400/30 hover:text-cyan-200/80",
        }}
        pad={pad}
      />
    </div>
  );
}
