"use client";

// CUT / TIMELINE — the winner. The editor's grammar: three stacked tracks
// against one ruler, every clip a block to scale, drift and gaps drawn where
// they are. Polish round: a legend names the three block states, the
// playhead says what it marks, and the sync bench can snap back to zero.
//
// HONESTY ROUND (2026-08-14). Three things on this surface were typed rather
// than derived, and one of them was a claim about product behaviour:
//
//  · "Preview plays what exists and holds black over the gaps" sat in body copy
//    a user reads. There is no <video> here, no play control, and no preview
//    surface in anything this file imports. It is gone rather than built —
//    building playback is not a copy fix — and what replaced it is what the cut
//    actually is today.
//  · The 13s "the turn" marker was the literal `13`, which merely COINCIDED
//    with where the reversal scene starts. It is derived now, from the scenes.
//  · The gap sentence was hand-typed to match the four missing rows. It is read
//    off TIMELINE now, so a fixture edit cannot leave it lying.
//
// And the sync bench, which was the same defect in interactive form: it moved a
// counter and rewrote a sentence while `TimelineClip.offsetMs` — a real field,
// with a real value in the fixture — was never read by anything. It reads and
// writes it now, and the block moves on the ruler above.

import { useEffect, useState } from "react";

import { TIMELINE, TRACKS } from "../../_studio/score";
import { PROJECT, SCENES } from "../../_studio/scenes";
import type { TimelineClip } from "../../_studio/projectTypes";
import { loadStep, saveStep, type CutStepData } from "../_shared/stepStore";
import { TimeRuler, spanStyle } from "../../_studio/projectParts";

/** Where the act-two turn lands, and it is a real boundary rather than a number
 *  somebody remembered: the reversal is the scene whose mood names it (see
 *  app/_studio/scenes.ts — sc-3, "vertigo / turn"), and where it starts is the
 *  sum of the scenes before it. Lengthen scene 1 and the mark moves with it.
 *  A fixture with no turn in it draws no mark, which is absence, not zero. */
const TURN = (() => {
  let atS = 0;
  for (const sc of SCENES) {
    if (/turn/i.test(sc.mood)) return { atS, slug: sc.slug };
    atS += sc.targetS;
  }
  return null;
})();

const trackLabel = (id: TimelineClip["track"]) => TRACKS.find((t) => t.id === id)?.label ?? id;

/** Offsets a clip carries: the dialled-in drift if there is one, else whatever
 *  the cut itself records. Exported so the arithmetic below can be driven
 *  directly - it is the kind that looks right and batches wrong. */
export type Offsets = Record<string, number>;

export function offsetFrom(o: Offsets, c: TimelineClip): number {
  return o[c.id] ?? c.offsetMs ?? 0;
}

/**
 * Apply one nudge, as a pure step over the PREVIOUS offsets.
 *
 * Written as a function taking `o` so it cannot accidentally close over a
 * render-time value, which is exactly how the bug it replaces worked: the
 * updater read the component's `offsets` binding instead of its own argument, so
 * a batch of clicks all started from the same base and only the last survived.
 * Composing it with itself must move the clip twice — that is the whole contract.
 */
export function nudgeOffsets(o: Offsets, c: TimelineClip, ms: number): Offsets {
  return { ...o, [c.id]: offsetFrom(o, c) + ms };
}

/** This step's own key in the step store. Its own record rather than a field
 *  on another phase's: the Cut is written by a different surface on a different
 *  cadence, and sharing a record would have each save erase the other's field —
 *  the reason `research-scope` and `research-beats` are separate keys too. */
const PHASE = "cut";

export default function CutTimeline({ projectId }: { projectId: string }) {
  /** The drift the user has dialled in, per clip, over what the fixture holds.
   *  Seeded from `offsetMs` on read rather than copied on mount — a clip nobody
   *  has touched reports exactly what the cut says about it.
   *
   *  PERSISTED, and it used to vanish on navigation. This step and Score were the
   *  two of five phases that stored nothing, so a sync pass — the one interactive
   *  decision this surface offers — survived exactly as long as the step stayed
   *  mounted. The step now takes the project it belongs to, like the three above
   *  it in `studio/[projectId]/phases.tsx`, because a step with no project is a
   *  step with nowhere to save.
   *
   *  Hydration is keyed to the project rather than gated on a boolean reset in
   *  the effect, for the reason `research/useScope.ts` wrote down when it chose
   *  the same shape: a flag stays true for one commit after the id changes, and
   *  that commit is the window the save effect runs in — it would write project
   *  A's offsets onto project B. `hydratedFor === projectId` cannot do that. */
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const hydrated = hydratedFor === projectId;

  useEffect(() => {
    let alive = true;
    void loadStep<CutStepData>(projectId, PHASE).then((saved) => {
      if (!alive) return;
      setOffsets(saved?.offsets ?? {});
      setHydratedFor(projectId);
    });
    return () => {
      alive = false;
    };
  }, [projectId]);

  useEffect(() => {
    // Never before hydration: the empty initial state is not an empty cut, and
    // saving it would erase the creator's sync pass with a blank one.
    if (!hydrated) return;
    void saveStep<CutStepData>(projectId, PHASE, { offsets });
  }, [projectId, offsets, hydrated]);

  const offsetOf = (c: TimelineClip) => offsetFrom(offsets, c);
  // Reads the offset out of `o` — the updater's own current value — and never
  // out of `offsets`, which is the value captured when this render ran.
  // `offsetOf(c) + ms` inside the updater looked identical and was not: React
  // batches the events a nudge control invites, so two quick clicks both
  // computed from the same stale base and the second OVERWROTE the first.
  // Pressing +50ms twice moved the clip 50ms. See nudgeOffsets.
  const nudge = (c: TimelineClip, ms: number) => setOffsets((o) => nudgeOffsets(o, c, ms));

  /** Where a block is actually drawn — its mark plus whatever drift it carries.
   *  This is the whole point of wiring the bench: the number in it and the
   *  picture above it are now the same fact. */
  const drawnStart = (c: TimelineClip) => c.startS + offsetOf(c) / 1000;
  /** A clip that drifted and has been brought back to its mark is no longer
   *  drifting, and the colour says so. */
  const shownStatus = (c: TimelineClip) =>
    c.status === "drift" && offsetOf(c) === 0 ? "ok" : c.status;

  const missing = TIMELINE.filter((c) => c.status === "missing");
  /** The one clip the bench can work on. No drift in the cut means no bench —
   *  a sync control over nothing would be the defect this round removed. */
  const drifting = TIMELINE.find((c) => c.status === "drift");
  const drift = drifting ? offsetOf(drifting) : 0;

  return (
    <div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
        <div className="flex gap-3">
          <span className="w-14 shrink-0" />
          <div className="flex-1">
            <TimeRuler />
          </div>
        </div>

        <div className="flex gap-3">
          <span className="w-14 shrink-0" />
          <div className="relative flex-1">
            {/* static reference line at the act-two turn — a mark, not motion */}
            {TURN && (
              <>
                <span
                  className="absolute inset-y-0 z-10 w-px bg-cyan-300/60"
                  style={{ left: `${(TURN.atS / PROJECT.totalS) * 100}%` }}
                  aria-hidden
                />
                <span
                  className="font-jetbrains absolute -top-0 z-10 -translate-x-1/2 rounded bg-cyan-400/10 px-1.5 text-[9px] text-cyan-300/80"
                  style={{ left: `${(TURN.atS / PROJECT.totalS) * 100}%` }}
                  title={`the reversal — ${TURN.slug}`}
                >
                  {TURN.atS}s · the turn
                </span>
              </>
            )}
          </div>
        </div>

        {TRACKS.map((t) => (
          <div key={t.id} className="mt-2 flex items-center gap-3">
            <span className="font-jetbrains w-14 shrink-0 text-right text-[10px] tracking-[0.12em] text-white/40 uppercase">
              {t.label}
            </span>
            <div className="relative h-10 flex-1">
              {TIMELINE.filter((c) => c.track === t.id).map((c) => {
                const state = shownStatus(c);
                const from = drawnStart(c);
                return (
                  <div
                    key={c.id}
                    style={spanStyle(from, c.durS)}
                    title={`${c.label} · ${from.toFixed(1)}s → ${(from + c.durS).toFixed(1)}s`}
                    className={`absolute inset-y-0 overflow-hidden rounded-md border px-2 transition-[left] ${
                      state === "ok"
                        ? "border-cyan-400/25 bg-cyan-400/[0.07]"
                        : state === "drift"
                          ? "border-amber-400/40 bg-amber-400/[0.06]"
                          : "border-dashed border-rose-400/35 bg-transparent"
                    }`}
                  >
                    <span
                      className={`font-jetbrains block truncate text-[10px] leading-[2.4] ${
                        state === "ok"
                          ? "text-white/60"
                          : state === "drift"
                            ? "text-amber-200/90"
                            : "text-rose-300/80"
                      }`}
                    >
                      {state === "missing" ? `${c.label} — missing` : c.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <p className="font-jetbrains mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/35">
          <span><span className="text-cyan-300/70">▬</span> placed</span>
          <span><span className="text-amber-300/80">▬</span> drift</span>
          <span><span className="text-rose-300/70">▭</span> missing — drawn, not hidden</span>
        </p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* the sync bench — now pointed at the field it always described */}
        {drifting && (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.03] p-4">
            <p className="font-jetbrains text-[11px] tracking-[0.14em] text-amber-300/90 uppercase">
              sync · {drifting.label}
            </p>
            <p className="mt-1.5 text-sm leading-snug text-slate-300">
              {drift === 0 ? (
                <>
                  On its mark at <span className="text-cyan-300">{drifting.startS}s</span>.
                </>
              ) : (
                <>
                  Sits{" "}
                  <span className="text-amber-200">
                    {Math.abs(drift)}ms {drift > 0 ? "late" : "early"}
                  </span>{" "}
                  of its {drifting.startS}s mark — drawn at {drawnStart(drifting).toFixed(2)}s
                  above.
                </>
              )}
            </p>
            <div className="font-jetbrains mt-3 flex items-center gap-3 text-[12px]">
              <button
                onClick={() => nudge(drifting, -50)}
                className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-white/70 transition hover:bg-white/5"
              >
                −50ms
              </button>
              <span className="min-w-16 text-center text-white">
                {drift >= 0 ? `+${drift}` : drift}ms
              </span>
              <button
                onClick={() => nudge(drifting, 50)}
                className="cursor-pointer rounded-lg border border-white/15 px-3 py-1.5 text-white/70 transition hover:bg-white/5"
              >
                +50ms
              </button>
              {drift !== 0 && (
                <button
                  onClick={() => setOffsets((o) => ({ ...o, [drifting.id]: 0 }))}
                  className="ml-auto cursor-pointer text-white/45 transition hover:text-white"
                >
                  snap to mark
                </button>
              )}
            </div>
            {/* What the nudge does and does not do. It moves the block above,
                which is the whole cut this app has; there is no audio to shift
                and nowhere to save a cut to yet, so the adjustment lives as long
                as the session does. */}
            <p className="font-jetbrains mt-2 text-[10px] leading-snug text-white/30">
              Moves the block on the ruler above and nothing else — no audio is
              shifted, and this cut has nowhere to save to yet.
            </p>
          </div>
        )}

        {/* the honest wrap state */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/40 uppercase">this cut</p>
          <p className="mt-1.5 text-sm leading-snug text-slate-400">
            {PROJECT.totalS}s planned across {TRACKS.length} tracks.{" "}
            {missing.length === 0 ? (
              <span className="text-cyan-300">Every block has something behind it.</span>
            ) : (
              <>
                <span className="text-rose-300">{missing.length} have nothing behind them</span> —{" "}
                {TRACKS.map((t) => missing.filter((c) => c.track === t.id))
                  .filter((cs) => cs.length > 0)
                  .map((cs) => `${trackLabel(cs[0].track)}: ${cs.map((c) => c.label).join(", ")}`)
                  .join(" · ")}
                .
              </>
            )}
          </p>
          <p className="mt-2 text-sm leading-snug text-slate-400">
            There is no playback here. This app has no player, and nothing it could feed one —
            what is drawn is the plan for the cut: where each block sits, and where nothing does.
          </p>
        </div>
      </div>
    </div>
  );
}
