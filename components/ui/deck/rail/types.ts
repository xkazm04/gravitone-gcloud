// What a stage rail needs to know, and nothing else.
//
// Deliberately NOT `DeckStageDef` — a rail draws four words and four states; it
// has no business holding a stage's `content`, its `blockedHint` or its
// `advance` mode, and importing the deck's own interface would also put a cycle
// between Deck.tsx and the rail it renders.

export interface RailStage {
  id: string;
  /** Short mono name — "discipline", "template". */
  label: string;
  /** Whether this stage's requirement is met. */
  done: boolean;
  /** What was decided, once it is. */
  summary?: string;
}

export interface StageRailProps {
  stages: RailStage[];
  active: number;
  onNavigate: (index: number) => void;
  /** Backward is always free; forward only over ground already covered. The
   *  deck owns that rule — a rail only asks. */
  reachable: (index: number) => boolean;
}
