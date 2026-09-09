"use client";

// VARIANT B — THE LEDGER LINE. Metaphor: the wizard is a record being written,
// and the rail is the line it is written on.
//
// The opposite direction to the filmstrip: no container, no ground, no boxes.
// One hairline runs the width of the deck; the four decisions are marks sitting
// ON it, their names set above in the mono voice and their answers written
// beneath in the reading face. What has been decided is inked — the rule is the
// accent up to the current mark and hairline after it — so progress is a
// property of the LINE rather than a count of filled-in chips.
//
// Why this is worth trying against the pills: the create wizard's header is now
// the first thing under the nav (the `create` eyebrow went on 2026-09-09), and
// a row of four outlined controls up there competes with the serif question
// directly below it. A rule with type on it is quieter than any pill can be,
// and it gives the answers a line of their own instead of appending them inside
// a control whose width then tracks the user's typing.
//
// The mark, not the colour, carries the state: filled + ringed = here, filled =
// answered, hollow = not yet. Colour agrees with the mark; it never decides it.

import type { StageRailProps } from "./types";

export default function StageRailLedger({ stages, active, onNavigate, reachable }: StageRailProps) {
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

              {/* what was written here, or the blank waiting for it */}
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
