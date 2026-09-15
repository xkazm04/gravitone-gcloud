"use client";

// THE STAGE RAIL — where you are in a deck, what you have already decided, and
// the way back to any of it.
//
// ── THE LEDGER LINE (operator ruling, 2026-09-09) ───────────────────────────
//
// The wizard is a record being written, and the rail is the line it is written
// on. No container, no ground, no boxes: a hairline runs the width of the deck,
// the decisions are marks sitting ON it, their names set above in the mono voice
// and their answers written beneath in the reading face. What has been decided
// is inked — the rule is the accent up to the current mark and hairline after it
// — so progress is a property of the LINE rather than a count of filled-in
// chips.
//
// It won a three-way bake-off (the /prototype skill, 2026-09-09) against the
// pill row that had shipped since the deck was built, and against a filmstrip —
// one strip of film with a frame cut for each stage, exposed / developed /
// unexposed. All three were photographed on the real screen at 1920 before the
// ruling; the two losers are deleted, and no switcher survives the session (this
// repo removed the deck's ART switcher by ruling on 2026-09-08 after it lingered
// for weeks, and the same rule applies to its own successor).
//
// WHAT THE PILLS GOT WRONG, and what this fixes, since a rail is easy to
// re-break in the same two ways:
//
//  1. THE ROW RE-FLOWED AS IT WAS ANSWERED. Each pill held its own summary
//     inside itself, so the control widths tracked the length of the user's
//     answers — picking "Movie · game trailer" moved every stage after it. The
//     divisions here are equal by construction (a 4-column grid), so the
//     header's geometry is fixed before the first question is answered.
//
//  2. THE ANSWER LIVED INSIDE THE CONTROL THAT SELECTS IT. A pill reading
//     "✓ discipline · Educational video" is one object doing two jobs, and it
//     grew from the shortest to the longest thing in the header. The answer gets
//     its own line here, in the reading face, under the mono name.
//
// And the reason the shape had to change at all: the create wizard's header is
// the first thing under the nav since the `create` eyebrow went (2026-09-09),
// and a row of four outlined controls up there competes with the serif question
// directly below it. A rule with type on it is quieter than any pill can be.
//
// THE MARK, NOT THE COLOUR, CARRIES THE STATE — filled and ringed = here,
// filled = answered, hollow = not yet. Colour agrees with the mark; it never
// decides alone (the repo's law: a state is never one signal in one channel).

/** What a rail needs to know about a stage, and nothing else.
 *
 *  Deliberately NOT `DeckStageDef` — a rail draws a name, a mark and an answer;
 *  it has no business holding a stage's `content`, its `blockedHint` or its
 *  `advance` mode, and importing the deck's own interface would also put a cycle
 *  between Deck.tsx and the rail it renders. */
export interface RailStage {
  id: string;
  /** Short mono name — "discipline", "template". */
  label: string;
  /** Whether this stage's requirement is met. */
  done: boolean;
  /** What was decided, once it is. */
  summary?: string;
}

export default function StageRail({
  stages,
  active,
  onNavigate,
  reachable,
}: {
  stages: RailStage[];
  active: number;
  onNavigate: (index: number) => void;
  /** Backward is always free; forward only over ground already covered. The
   *  deck owns that rule — a rail only asks. */
  reachable: (index: number) => boolean;
}) {
  return (
    <ol className="grid w-full grid-cols-2 gap-y-5 sm:grid-cols-4">
      {stages.map((s, i) => {
        const activeStage = i === active;
        const open = reachable(i);
        const inked = i <= active;
        return (
          <li key={s.id} className="min-w-0">
            <button
              type="button"
              disabled={!open}
              aria-current={activeStage ? "step" : undefined}
              onClick={() => onNavigate(i)}
              className={`group flex w-full flex-col items-start gap-2 pr-4 text-left transition disabled:cursor-not-allowed ${
                open ? "" : "opacity-60"
              }`}
            >
              <span
                className={`font-jetbrains truncate text-label tracking-[0.16em] uppercase transition-colors ${
                  activeStage
                    ? "text-cyan-200"
                    : s.done
                      ? "text-white/65 group-hover:text-white/90"
                      : "text-white/40 group-hover:text-white/70"
                }`}
              >
                {i + 1} {s.label}
              </span>

              {/* the rule, and this stage's mark on it */}
              <span aria-hidden className="relative flex w-full items-center">
                <span className={`h-px w-full ${inked ? "bg-cyan-400/45" : "bg-white/10"}`} />
                <span
                  className={`absolute left-0 rounded-full ${
                    activeStage
                      ? "h-2.5 w-2.5 bg-cyan-300 ring-4 ring-cyan-400/15"
                      : s.done
                        ? "h-2 w-2 bg-cyan-300/70"
                        : "h-2 w-2 border border-white/25"
                  }`}
                />
              </span>

              {/* What was written here, or the blank waiting for it. The blank
                  does not collapse: the rail's rows must not move as the deck
                  is filled in, which is fault 1 above in its other form. */}
              <span
                className={`font-hanken w-full truncate text-label ${
                  s.summary ? "text-slate-300" : "text-white/20"
                }`}
              >
                {s.summary ?? "—"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
