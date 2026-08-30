"use client";

// The wizard's PASSES over the notebook — which cards each stage deals, and how
// a triage card is spoken in the deck's card language.
//
// Selection only, never state: the cards come from the SAME `buildCards()` the
// board flattens (through useScope), and every keep/cut the wizard offers writes
// through the same `toggle` the board's CardTile uses. This file decides what is
// ON the table per stage; it holds no opinion about what is in scope.

import type { DeckCardSpec } from "@/components/ui/deck/DeckCard";

import type { Leap } from "../../_shared/notebook/conclusions";
import type { Card, CardState } from "../scope";

/** Stage 2's hand: the take(s) flagged hottest. Conclusions, so opt-in — the
 *  default reading is "not taken", and picking one takes it. */
export function hotTakes(cards: Card[]): Card[] {
  return cards.filter((c) => c.hottest);
}

/** Stage 2's fixed card. `required: true` in the card contract — the library
 *  forbids removing it, so the wizard deals it with NO pick target at all. */
export function steelManOf(cards: Card[]): Card | undefined {
  return cards.find((c) => c.kind === "steel-man");
}

/** Stage 3's hand: every opt-in conclusion NOT already decided in stage 2. The
 *  hottest take is a conclusion too, but a decision offered twice is a wizard
 *  second-guessing itself. */
export function conclusionChoices(cards: Card[]): Card[] {
  return cards.filter((c) => c.optIn && !c.hottest);
}

/* ── the card language ────────────────────────────────────────────────────── */

// Tailwind gradient classes as DATA (DeckArt's gradient contract): listed
// literally here so the JIT emits them — the same rule stages.tsx states for
// the create wizard's tones.
const HOT_TONE = "from-rose-400/30 via-violet-400/10 to-transparent";
const STEEL_TONE = "from-amber-400/25 via-orange-300/10 to-transparent";
const CONCLUSION_TONE = "from-violet-400/25 via-fuchsia-400/10 to-transparent";

/** The leap tiers in the deck's chip tones — CardTile's LEAP_TONE vocabulary
 *  (near quiet · moderate amber · far violet · unhinged rose) mapped onto the
 *  four tones DeckCard chips actually have. The deck has no rose chip, so
 *  `unhinged` rides amber here and the card's rose-hot art + risk line carry
 *  the heat instead — the tier NAME is always printed, so nothing is hidden. */
const LEAP_CHIP: Record<Leap, NonNullable<NonNullable<DeckCardSpec["chips"]>[number]["tone"]>> = {
  near: "neutral",
  moderate: "amber",
  far: "violet",
  unhinged: "amber",
};

/** One triage card, spoken as a deck card. `s` is the card's CURRENT scope
 *  state — the chip row says taken/not-taken with the exact words the board's
 *  ScopeChip uses, so the two faces cannot disagree about what a state is
 *  called. Rebuilt per render on purpose: chips must move when the scope does,
 *  and a stable `id` keeps the deal-in from re-firing. */
export function specOf(card: Card, s: CardState): DeckCardSpec {
  const kept = !s.descoped;
  const chips: NonNullable<DeckCardSpec["chips"]> = [];

  if (card.required) {
    chips.push({ label: "locked in scope", tone: "amber" });
  } else {
    // ScopeChip's wording, verbatim: opt-in cards are taken/not taken (the
    // default state, not a decision), everything else in scope/descoped.
    chips.push(
      card.optIn
        ? { label: kept ? "taken" : "not taken", tone: kept ? "cyan" : "neutral" }
        : { label: kept ? "in scope" : "descoped", tone: kept ? "cyan" : "amber" },
    );
  }
  if (card.leap) chips.push({ label: `${card.leap} leap`, tone: LEAP_CHIP[card.leap] });
  if (card.useFor) chips.push({ label: `would be the ${card.useFor}`, tone: "neutral" });

  return {
    id: card.id,
    eyebrow: card.hottest ? "😈 hottest take" : card.kind,
    title: card.title,
    body: card.detail,
    chips,
    // The honest-downside line, in the words the board uses for the same card.
    risk: card.hottest
      ? "speculation about motive — not reporting. Held to a higher bar, not a lower one."
      : undefined,
    footnote: card.precedent ? `pattern · ${card.precedent.domain}` : undefined,
    art: {
      kind: "gradient",
      tone: card.kind === "steel-man" ? STEEL_TONE : card.hottest ? HOT_TONE : CONCLUSION_TONE,
    },
  };
}
