"use client";

// BASELINE — the pill row, lifted out of Deck.tsx unchanged.
//
// Four rounded outlines separated by arrows, each holding its number-or-✓, its
// label, and its answer appended after a middot. It is what shipped, and it is
// here so the two directions below are compared against the real thing rather
// than against a description of it.
//
// What it is bad at, and what the variants are answering: every stage is one
// object, so four answered stages read as four equal chips of the same weight —
// the row says "four things" before it says "where you are". And a summary is
// appended INSIDE the pill, so the pill widths track the length of the user's
// own answers and the row re-flows as the wizard is filled in.

import type { StageRailProps } from "./types";

export default function StageRailPills({ stages, active, onNavigate, reachable }: StageRailProps) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {stages.map((s, i) => {
        const activeStage = i === active;
        return (
          <li key={s.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className="font-jetbrains text-label text-white/20">
                →
              </span>
            )}
            <button
              type="button"
              disabled={!reachable(i)}
              aria-current={activeStage ? "step" : undefined}
              onClick={() => onNavigate(i)}
              className={`font-jetbrains rounded-full border px-2.5 py-1 text-label tracking-[0.12em] transition disabled:cursor-not-allowed ${
                activeStage
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : s.done
                    ? "border-white/12 text-white/60 hover:border-white/25 hover:text-white/85"
                    : reachable(i)
                      ? "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
                      : "border-white/[0.06] text-white/25"
              }`}
            >
              <span className={activeStage ? "" : s.done ? "text-emerald-200/80" : ""}>
                {s.done && !activeStage ? "✓" : i + 1}
              </span>{" "}
              {s.label}
              {s.done && s.summary && !activeStage && (
                <span className="ml-1 text-cyan-200/70 normal-case">· {s.summary}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
