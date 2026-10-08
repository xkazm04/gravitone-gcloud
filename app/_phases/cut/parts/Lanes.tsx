"use client";

// THE LANES — picture, voice, music against one ruler, with a needle that
// moves without React.
//
// Lifted from the timeline this replaces (the three-state blocks, the ghost
// outline at a drifted clip's own mark, the act-two turn, the legend's one
// tally) and from StatReel's Tracks.tsx (press anywhere on a lane to seek, drag
// to scrub; the needle is written into the DOM from the clock's subscription).
//
// The proof the brief asks for lives on the root: `data-renders` counts this
// component's commits in a dev build (`useRenderCount`). Play for five seconds
// and it does not move — the needle and the readouts change, the lanes do not
// re-render. Only the per-lane `ActiveRing` re-renders, and only when the
// playhead crosses a block boundary.

import { Fragment, useEffect, useRef } from "react";

import { Ghost, Tally } from "@/components/ui/signal";

import { LANE_GUTTER, TimeRuler, spanStyle } from "../../../_studio/projectParts";
import { timecode, useClockSelector, useClockWriter, type CutClock } from "../clock";
import { LANES, turnOf, type CutClip } from "../deriveTimeline";
import { snapTo } from "../edits";
import { drawnStart, offsetFrom, shownStatus } from "../offsets";
import { useCutCtx } from "../useCut";

/** Dev-only commit counter, written to `data-renders` on `ref`. */
export function useRenderCount(ref: React.RefObject<HTMLElement | null>): void {
  const n = useRef(0);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    n.current += 1;
    if (ref.current) ref.current.dataset.renders = String(n.current);
  });
}

/** How close, in screen pixels, a Shift-scrub must come to an edit to land on
 *  it. Pixels rather than seconds: on a 286s cut a second is three pixels wide,
 *  and the snap is a question about where the pointer is on screen. */
const SNAP_PX = 8;

/** Press anywhere on a strip to seek; hold and drag to scrub. The geometry is
 *  read per move — a lane that scrolls or resizes mid-drag stays honest. With
 *  Shift held (read per move, so it can be pressed mid-drag) the playhead
 *  snaps to the nearest edit in `snap`, the NLE convention. */
export function scrubFrom(
  e: React.PointerEvent<HTMLElement>,
  clock: CutClock,
  totalS: number,
  snap: readonly number[] = [],
): void {
  if (e.button !== 0 || totalS <= 0) return;
  // A drag across the lanes otherwise SELECTS every label it crosses — the
  // first captures of this surface came back washed in selection blue. Both
  // halves: preventDefault stops the selection the press would start, and the
  // body's user-select covers the window-level move the drag continues on.
  e.preventDefault();
  const body = document.body;
  const prevSelect = body.style.userSelect;
  body.style.userSelect = "none";
  const el = e.currentTarget;
  const at = (x: number, shift: boolean) => {
    const r = el.getBoundingClientRect();
    const t = ((x - r.left) / r.width) * totalS;
    clock.seek(shift && snap.length && r.width > 0 ? snapTo(snap, t, (SNAP_PX / r.width) * totalS) : t);
  };
  at(e.clientX, e.shiftKey);
  const move = (ev: PointerEvent) => at(ev.clientX, ev.shiftKey);
  const up = () => {
    body.style.userSelect = prevSelect;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

export const BLOCK: Record<CutClip["status"], { box: string; ink: string }> = {
  ok: { box: "border-cyan-400/25 bg-cyan-400/[0.07]", ink: "text-white/70" },
  drift: { box: "border-amber-400/40 bg-amber-400/[0.06]", ink: "text-amber-200/90" },
  missing: { box: "border-dashed border-rose-400/35 bg-transparent", ink: "text-rose-300/80" },
};

/** The block under the playhead on one lane — the only part of the lanes that
 *  follows the clock through React, and it re-renders per boundary crossed. */
function ActiveRing({ clips, total }: { clips: CutClip[]; total: number }) {
  const { clock, offsets } = useCutCtx();
  const i = useClockSelector(clock, (s) =>
    clips.findIndex((c) => {
      const from = drawnStart(offsets, c);
      return s.t >= from && s.t < from + c.durS;
    }),
  );
  if (i < 0) return null;
  const c = clips[i];
  return (
    <div
      aria-hidden
      style={spanStyle(drawnStart(offsets, c), c.durS, total)}
      className="pointer-events-none absolute inset-y-0 rounded-md ring-1 ring-cyan-200/60"
    />
  );
}

function Wave({ peaks, fill }: { peaks: number[]; fill: number }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${peaks.length} 100`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-y-1 left-0 h-[calc(100%-0.5rem)]"
      style={{ width: `${Math.min(1, fill) * 100}%` }}
    >
      {peaks.map((p, i) => (
        <rect key={i} x={i + 0.15} width={0.7} y={50 - p * 48} height={Math.max(1, p * 96)} className="fill-cyan-300/45" />
      ))}
    </svg>
  );
}

export function Lanes({
  tall = false,
  thumbs = false,
  waves = false,
  className = "",
}: {
  tall?: boolean;
  thumbs?: boolean;
  waves?: boolean;
  className?: string;
}) {
  const { cut, clock, edits, offsets, selected, select, takes, openStep } = useCutCtx();
  const total = cut.totalS > 0 ? cut.totalS : 1;
  const root = useRef<HTMLDivElement>(null);
  const col = useRef<HTMLDivElement>(null);
  const needle = useRef<HTMLDivElement>(null);
  useRenderCount(root);

  useClockWriter(
    clock,
    (s) => {
      const pct = `${(Math.min(s.t, total) / total) * 100}%`;
      if (needle.current) needle.current.style.left = pct;
      col.current?.setAttribute("aria-valuenow", s.t.toFixed(2));
      col.current?.setAttribute("aria-valuetext", timecode(s.t));
    },
    total,
  );

  const scrub = (e: React.PointerEvent<HTMLElement>) => scrubFrom(e, clock, cut.totalS, edits);

  const turn = turnOf(cut.scenes);
  const missing = cut.clips.filter((c) => c.status === "missing").length;
  const laneH = tall ? "h-24" : "h-10";

  if (cut.origin === "empty")
    return (
      <div className={className}>
        <Ghost shape="row" count={3} label="no frames, no spots — nothing to lay on the ruler" />
      </div>
    );

  return (
    <div ref={root} className={`rounded-2xl border border-white/8 bg-white/[0.02] p-4 ${className}`}>
      <div className="flex gap-3">
        <div className={`${LANE_GUTTER} flex flex-col`} aria-hidden>
          <span className="h-5" />
          {turn && <span className="h-5" />}
          {LANES.map((l) => (
            <span
              key={l.id}
              className={`font-jetbrains mt-2 flex ${laneH} items-center justify-end text-label tracking-[0.12em] text-white/40 uppercase`}
            >
              {l.label}
            </span>
          ))}
        </div>

        <div
          ref={col}
          role="slider"
          tabIndex={0}
          aria-label="Playhead"
          aria-valuemin={0}
          // The initial value only: the clock writes the live one into the DOM,
          // and React never touches a prop whose value it has not changed.
          aria-valuenow={0}
          aria-valuemax={Number(cut.totalS.toFixed(2))}
          onPointerDown={scrub}
          className="relative flex-1 cursor-col-resize touch-none outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/50"
        >
          <TimeRuler totalS={total} />

          {/* A static mark at the act-two turn, on its own row so it never
              sits on a block's label. */}
          {turn && (
            <div className="relative h-5">
              <span
                className="font-jetbrains absolute top-0.5 z-10 -translate-x-1/2 rounded bg-cyan-400/10 px-1.5 text-label leading-tight whitespace-nowrap text-cyan-300/80"
                style={{ left: `${(turn.atS / total) * 100}%` }}
              >
                {Math.round(turn.atS * 10) / 10}s · the turn
              </span>
            </div>
          )}
          {turn && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-10 bottom-0 z-10 w-px bg-cyan-300/40"
              style={{ left: `${(turn.atS / total) * 100}%` }}
            />
          )}

          {LANES.map((l) => {
            const clips = cut.clips.filter((c) => c.track === l.id);
            return (
              <div key={l.id} className={`relative mt-2 ${laneH}`} data-lane={l.id}>
                {clips.length === 0 && (
                  <span aria-hidden className="absolute inset-0 rounded-md border border-dashed border-white/8" />
                )}
                {clips.map((c) => {
                  const state = shownStatus(offsets, c);
                  const from = drawnStart(offsets, c);
                  const take = c.track === "music" ? takes[c.ref] : undefined;
                  const isSel = selected?.id === c.id;
                  return (
                    <Fragment key={c.id}>
                      {offsetFrom(offsets, c) !== 0 && (
                        <div
                          aria-hidden
                          style={spanStyle(c.startS, c.durS, total)}
                          className="absolute inset-y-0 rounded-md border border-dashed border-white/15"
                        />
                      )}
                      <button
                        type="button"
                        data-clip={c.id}
                        data-status={state}
                        onClick={() => select(c.id)}
                        onDoubleClick={() => openStep(c.owner)}
                        aria-label={`${l.label} · ${c.label} · ${from.toFixed(1)}s to ${(from + c.durS).toFixed(1)}s · ${c.why ?? state}`}
                        aria-pressed={isSel}
                        style={spanStyle(from, c.durS, total)}
                        className={`absolute inset-y-0 overflow-hidden rounded-md border px-2 text-left transition-[left] ${BLOCK[state].box} ${
                          isSel ? "outline-2 outline-offset-1 outline-cyan-300/70" : ""
                        }`}
                      >
                        {thumbs && c.src && c.track === "video" && (
                          // A data: URL or a public path; next/image optimises files, not blobs.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.src} alt="" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover opacity-70" />
                        )}
                        {thumbs && c.track === "video" && !c.src && cut.scenes.find((s) => s.id === c.ref)?.tone && (
                          <span
                            aria-hidden
                            className={`absolute inset-0 bg-gradient-to-br opacity-80 ${cut.scenes.find((s) => s.id === c.ref)?.tone}`}
                          />
                        )}
                        {waves && take?.peaks && (
                          <Wave peaks={take.peaks} fill={take.durationS ? take.durationS / c.durS : 1} />
                        )}
                        <span
                          className={`font-jetbrains relative block truncate text-label ${
                            tall ? "-mx-2 mt-0 bg-black/45 px-2 py-0.5" : "leading-[2.4]"
                          } ${BLOCK[state].ink}`}
                        >
                          {c.label}
                        </span>
                      </button>
                    </Fragment>
                  );
                })}
                <ActiveRing clips={clips} total={total} />
              </div>
            );
          })}

          <div
            ref={needle}
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 -translate-x-1/2 bg-cyan-200 shadow-[0_0_10px_var(--gt-glow-cyan)]"
            style={{ left: 0 }}
          />
        </div>
      </div>

      <p className="font-jetbrains mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-white/40">
        <span>
          <span className="text-cyan-300/70">▬</span> placed
        </span>
        <span>
          <span className="text-amber-300/80">▬</span> drift
        </span>
        <span className="inline-flex items-center gap-2">
          <span>
            <span className="text-rose-300/70">▭</span> missing
          </span>
          <Tally value={missing} of={cut.clips.length} tone={missing === 0 ? "emerald" : "rose"} />
        </span>
      </p>
    </div>
  );
}
