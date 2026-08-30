"use client";

// One stage's cards, dealt onto the table.
//
// Layout: a grid, 2–4 across at desktop width, sized to the hand — three
// disciplines get three columns, seven styles get four. The deal-in entrance
// staggers each card's spring by its distance from the stage centre, which is
// the landing page's radial bloom (GateContactSheet, dist * 90ms) rebuilt as
// springs: the deck assembles outward from the middle, not top-left to
// bottom-right like a spreadsheet.
//
// Picking: `onPick(id | null)` — clicking the picked card again unpicks it
// (SlotColumn precedent: a decision you can walk back is a decision you can
// make faster).

import DeckCard, { type DeckCardSpec } from "./DeckCard";
import { useDeckReducedMotion } from "./motionGuard";

/** Class names spelled out per count so the Tailwind JIT sees them. */
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

export default function DeckStage({
  cards,
  pickedId,
  onPick,
  renderCard,
}: {
  cards: DeckCardSpec[];
  pickedId: string | null;
  onPick: (id: string | null) => void;
  /** Replaces the whole tile for a card — WP3's duel view slots in here. The
   *  override owns its own target and entrance; `dealDelay` is the stagger it
   *  should honour to stay in the deal. */
  renderCard?: (args: { spec: DeckCardSpec; picked: boolean; dealDelay: number }) => React.ReactNode;
}) {
  const reduced = useDeckReducedMotion();
  const cols = Math.min(Math.max(cards.length, 2), 4);

  // Bloom stagger: delay grows with distance from the grid centre, computed on
  // the desktop column count — the one place the whole hand is visible at once.
  const delayFor = (i: number): number => {
    if (reduced) return 0;
    const rows = Math.ceil(cards.length / cols);
    const r = Math.floor(i / cols);
    const c = i % cols;
    return Math.hypot(r - (rows - 1) / 2, c - (cols - 1) / 2) * 0.09;
  };

  return (
    <ul className={`grid gap-4 sm:grid-cols-2 ${LG_COLS[cols]}`}>
      {cards.map((spec, i) => {
        const picked = spec.id === pickedId;
        const dealDelay = delayFor(i);
        return (
          <li key={spec.id} className="h-full">
            {renderCard ? (
              renderCard({ spec, picked, dealDelay })
            ) : (
              <DeckCard spec={spec} picked={picked} onPick={onPick} dealDelay={dealDelay} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
