"use client";

// THE RUBRIC — scored and at rest. Dimensions come from lib/sound/types.ts#RUBRIC
// per kind (music: melody · instrument choice · instrument quality; sfx: event
// match · sound quality · loop seam), filtered by ./format.ts#dimsFor so a
// one-shot effect is never scored on a seam it does not have. Carried over from
// the round-3 lab's Rubric/Scores (its parts.tsx, retired in round 4), re-keyed from the
// Library's Take onto the SoundTake's `ratings` record.

import type { SoundTake } from "@/lib/sound/types";

import { dimLabel, dimsFor, meanScore } from "./format";

/**
 * One row of ten cells per dimension. The dimension under the keyboard is
 * ringed (`active`); pressing a cell scores it.
 */
export function RubricControl({
  take,
  active,
  onActive,
  onRate,
  size = "md",
}: {
  take: Pick<SoundTake, "kind" | "loop" | "ratings" | "title">;
  active: string | null;
  onActive?: (dim: string) => void;
  onRate: (dim: string, v: number) => void;
  size?: "md" | "lg";
}) {
  const dims = dimsFor(take);
  const cell = size === "lg" ? "h-7" : "h-5";
  return (
    <div className="grid gap-1.5" role="group" aria-label={`Score ${take.title}`}>
      {dims.map((d) => {
        const v = take.ratings?.[d] ?? null;
        const on = d === active;
        const L = dimLabel(d);
        return (
          <div
            key={d}
            className={`grid grid-cols-[3.75rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-lg px-1 py-0.5 transition ${
              on ? "bg-cyan-400/[0.06] ring-1 ring-cyan-400/30" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => onActive?.(d)}
              aria-pressed={on}
              aria-label={`Score ${L.label} with the number keys`}
              className={`cursor-pointer rounded-md px-1 text-left font-jetbrains text-label tracking-[0.12em] transition ${
                on ? "text-cyan-200" : "text-white/40 hover:text-white/70"
              }`}
            >
              {L.short}
            </button>
            <span className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, k) => {
                const n = k + 1;
                const filled = v != null && n <= v;
                return (
                  <button
                    key={n}
                    type="button"
                    tabIndex={-1}
                    onClick={() => onRate(d, n)}
                    aria-label={`${L.label} ${n}`}
                    aria-pressed={v === n}
                    className={`${cell} min-w-0 flex-1 cursor-pointer rounded-[3px] transition ${
                      filled
                        ? v! >= 7
                          ? "bg-emerald-300/80"
                          : v! >= 4
                            ? "bg-cyan-300/60"
                            : "bg-rose-300/60"
                        : on
                          ? "bg-white/[0.1] hover:bg-white/20"
                          : "bg-white/[0.05] hover:bg-white/15"
                    }`}
                  />
                );
              })}
            </span>
            <span className={`text-right font-jetbrains text-label tabular-nums ${v == null ? "text-white/25" : "text-white/85"}`}>
              {v ?? "–"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The scores as a meter of bars with the mean beside it — what a row says at
 *  rest. An unscored dimension is a hollow stub, never a 0. */
export function ScoreMeter({ take }: { take: Pick<SoundTake, "kind" | "loop" | "ratings"> }) {
  const dims = dimsFor(take);
  const s = meanScore(take);
  const any = dims.some((d) => take.ratings?.[d] != null);
  return (
    <span
      role="img"
      className="inline-flex items-center gap-2"
      aria-label={any ? dims.map((d) => `${dimLabel(d).label} ${take.ratings?.[d] ?? "unscored"}`).join(", ") : "not scored"}
    >
      <span aria-hidden className="flex h-5 items-end gap-[3px]">
        {dims.map((d) => {
          const v = take.ratings?.[d] ?? null;
          return v == null ? (
            <span key={d} className="h-1.5 w-1.5 rounded-[2px] border border-white/20" />
          ) : (
            <span
              key={d}
              style={{ height: `${Math.max(15, v * 10)}%` }}
              className={`w-1.5 rounded-[2px] ${v >= 7 ? "bg-emerald-300/85" : v >= 4 ? "bg-white/55" : "bg-rose-300/70"}`}
            />
          );
        })}
      </span>
      <span
        aria-hidden
        className={`w-7 font-jetbrains text-label tabular-nums ${s == null ? "text-white/20" : s >= 7 ? "text-emerald-200" : "text-white/65"}`}
      >
        {s == null ? "–" : s.toFixed(1)}
      </span>
    </span>
  );
}
