"use client";

// VARIANT A — THE FILMSTRIP. Metaphor: the wizard is a strip of film, and each
// decision is a frame on it.
//
// The mental model this replaces is "four buttons in a row". A strip is ONE
// object with divisions in it, so the eye reads the whole run first and the
// position second — which is the question a stepper is actually asked. It also
// gives the three states a physical reading the pills had to spell out: the
// active frame is EXPOSED (lit ground, a bright edge on top), a done frame is
// developed (its answer printed in it), and a frame you have not reached yet is
// unexposed — dim, and holding a blank where the answer will go.
//
// The frames are equal-width by construction, so the row's geometry is fixed
// before the user answers anything. The pill row's widths tracked the length of
// the answers and re-flowed as the wizard filled in.
//
// Identity: this is the same film vocabulary the deck already draws — the
// perforation runs here are the ones on the `discipline-trailer` scene
// (scenes.tsx), at rail scale.

import type { StageRailProps } from "./types";

/** The perforation run along one edge. Count is fixed rather than derived from
 *  the stage count on purpose: sprockets are a property of the FILM, not of
 *  what was shot on it. */
function Perforations() {
  return (
    <span aria-hidden className="flex items-center justify-between px-1.5 py-1">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-[2px] bg-white/10" />
      ))}
    </span>
  );
}

export default function StageRailFilmstrip({
  stages,
  active,
  onNavigate,
  reachable,
}: StageRailProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <Perforations />
      <ol className="grid grid-cols-2 border-y border-white/8 sm:grid-cols-4">
        {stages.map((s, i) => {
          const activeStage = i === active;
          const open = reachable(i);
          return (
            <li
              key={s.id}
              className="relative border-r border-b border-white/8 last:border-r-0 sm:border-b-0"
            >
              <button
                type="button"
                disabled={!open}
                aria-current={activeStage ? "step" : undefined}
                onClick={() => onNavigate(i)}
                className={`flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                  activeStage
                    ? "bg-cyan-400/10"
                    : open
                      ? "hover:bg-white/[0.04]"
                      : "opacity-60"
                }`}
              >
                {/* the exposed frame's lit edge — the one signal that is not
                    colour, so the current frame survives a greyscale screenshot */}
                <span
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-0.5 ${activeStage ? "bg-cyan-300/70" : "bg-transparent"}`}
                />
                <span
                  className={`font-jetbrains flex items-baseline gap-1.5 text-label tracking-[0.14em] uppercase ${
                    activeStage ? "text-cyan-200" : s.done ? "text-white/70" : "text-white/40"
                  }`}
                >
                  <span className={s.done && !activeStage ? "text-emerald-200/80" : ""}>
                    {s.done && !activeStage ? "✓" : i + 1}
                  </span>
                  {s.label}
                </span>
                {/* The answer, printed in the frame. An unanswered frame keeps
                    the line as a blank rather than collapsing — the strip's
                    rows must not move as the wizard is filled in. */}
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
      <Perforations />
    </div>
  );
}
