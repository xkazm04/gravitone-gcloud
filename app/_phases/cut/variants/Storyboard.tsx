"use client";

// V3 · STORYBOARD — the shots are the hero. Every shot is a card as wide as
// it holds, laid on the same linear clock as the lanes (so the needle crossing
// the strip is the playhead, not an approximation of it); under it one
// coverage lane says which seconds have music and which have a voice; the
// finish line sits beside, in full.

import { useRef } from "react";

import { useClockSelector, useClockWriter } from "../clock";
import { sceneIndexAt, type CutClip } from "../deriveTimeline";
import { coveredS } from "../finishLine";
import { drawnStart } from "../offsets";
import { FinishLine, NextAction } from "../parts/FinishLine";
import { Inspector } from "../parts/Inspector";
import { BLOCK, scrubFrom, useRenderCount } from "../parts/Lanes";
import { Monitor } from "../parts/Monitor";
import { SyncBench } from "../parts/SyncBench";
import { OriginChip, Transport } from "../parts/Transport";
import { useCutCtx } from "../useCut";

import { CHIP_CLASS, Ghost, TALLY_TONE } from "@/components/ui/signal";

/** The narrowest a card may be drawn. The strip widens (and scrolls) until
 *  the shortest shot gets this much, rather than squeezing a 1s beat to a
 *  sliver nobody can click. */
const MIN_CARD_PX = 112;
/** And never wider than this, however short the shortest shot. */
const MAX_STRIP_PX = 9000;

function Needle({ totalS }: { totalS: number }) {
  const { clock } = useCutCtx();
  const ref = useRef<HTMLDivElement>(null);
  useClockWriter(
    clock,
    (s) => {
      if (ref.current) ref.current.style.left = `${(Math.min(s.t, totalS) / totalS) * 100}%`;
    },
    totalS,
  );
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute -top-1 -bottom-1 z-20 w-0.5 -translate-x-1/2 bg-cyan-200 shadow-[0_0_10px_var(--gt-glow-cyan)]"
      style={{ left: 0 }}
    />
  );
}

/** The ring on the card under the playhead — one render per cut. */
function CurrentCard() {
  const { cut, clock } = useCutCtx();
  const i = useClockSelector(clock, (s) => sceneIndexAt(cut.scenes, s.t));
  if (i < 0) return null;
  const sc = cut.scenes[i];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 z-10 rounded-lg ring-2 ring-cyan-200/70"
      style={{ left: `${(sc.startS / cut.totalS) * 100}%`, width: `${(sc.durS / cut.totalS) * 100}%` }}
    />
  );
}

function Strip() {
  const { cut, clock, select, openStep, selected } = useCutCtx();
  const root = useRef<HTMLDivElement>(null);
  useRenderCount(root);
  const shortest = Math.min(...cut.scenes.map((s) => s.durS));
  const widthPx = Math.min(MAX_STRIP_PX, (MIN_CARD_PX / Math.max(0.5, shortest)) * cut.totalS);

  return (
    <div ref={root} className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.02] p-3">
      <div
        className="relative h-52 touch-none"
        style={{ minWidth: `${widthPx}px` }}
        onPointerDown={(e) => scrubFrom(e, clock, cut.totalS)}
      >
        {cut.scenes.map((sc) => {
          const pic = cut.clips.find((c) => c.track === "video" && c.ref === sc.id);
          const frame = cut.frames[sc.id];
          const missing = pic?.status === "missing";
          const isSel = Boolean(pic) && selected?.id === pic?.id;
          return (
            <button
              key={sc.id}
              type="button"
              data-scene={sc.id}
              onClick={() => pic && select(pic.id)}
              onDoubleClick={() => openStep("frames")}
              aria-label={`${sc.index} · ${sc.label} · ${sc.durS.toFixed(1)}s${pic?.why ? ` · ${pic.why}` : ""}`}
              aria-pressed={isSel}
              className="absolute inset-y-0 px-0.5 text-left"
              style={{ left: `${(sc.startS / cut.totalS) * 100}%`, width: `${(sc.durS / cut.totalS) * 100}%` }}
            >
              <span
                className={`relative flex h-full flex-col overflow-hidden rounded-lg border ${
                  missing ? "border-dashed border-rose-400/40" : "border-white/12"
                } ${isSel ? "outline-2 outline-offset-1 outline-cyan-300/70" : ""}`}
              >
                <span className="relative block flex-1 overflow-hidden bg-slate-950">
                  {pic?.src ? (
                    // A data: URL or a public path; next/image optimises files, not blobs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pic.src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                  ) : sc.tone ? (
                    <span aria-hidden className={`absolute inset-0 bg-gradient-to-br ${sc.tone}`} />
                  ) : (
                    <span aria-hidden className="absolute inset-0 bg-[linear-gradient(135deg,var(--gt-wash),transparent)]" />
                  )}
                  {!pic?.src && frame?.texts.find((t) => !t.hidden) && (
                    <span className="font-hanken absolute inset-x-2 bottom-2 line-clamp-2 text-label text-white/70">
                      {frame.texts.find((t) => !t.hidden)?.value}
                    </span>
                  )}
                </span>
                <span className="flex items-baseline gap-1.5 bg-black/40 px-2 py-1">
                  <span className="font-jetbrains text-label text-white/40 tabular-nums">{sc.index}</span>
                  <span className="font-hanken min-w-0 flex-1 truncate text-label text-white/85">{sc.label}</span>
                  <span className="font-jetbrains text-label text-white/40 tabular-nums">{Math.round(sc.durS * 10) / 10}s</span>
                </span>
              </span>
            </button>
          );
        })}
        <CurrentCard />
        <Needle totalS={cut.totalS} />
      </div>
    </div>
  );
}

function CoverageRow({ label, clips, total }: { label: string; clips: CutClip[]; total: number }) {
  const { offsets, takes, select, clock } = useCutCtx();
  // The SPAN covered — the finish line's coverage figure, one fact in two
  // places — toned by whether what covers it is in hand.
  const spanned = coveredS(clips, total);
  const inHand = coveredS(clips.filter((c) => c.status !== "missing"), total);
  const tone = spanned < total - 0.05 ? "rose" : inHand < spanned - 0.05 ? "amber" : "emerald";
  return (
    <div className="flex items-center gap-3">
      <span className="font-jetbrains w-16 shrink-0 text-right text-label tracking-[0.12em] text-white/40 uppercase">
        {label}
      </span>
      <div
        className="relative h-12 flex-1 touch-none rounded-md bg-white/[0.02]"
        onPointerDown={(e) => scrubFrom(e, clock, total)}
      >
        {clips.map((c) => {
          const from = drawnStart(offsets, c);
          const take = c.track === "music" ? takes[c.ref] : undefined;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c.id)}
              aria-label={`${label} · ${c.label} · ${c.why ?? "in hand"}`}
              className={`absolute inset-y-0 overflow-hidden rounded-md border ${BLOCK[c.status].box} ${
                c.status === "missing" ? "bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_5px,transparent_5px_10px)]" : ""
              }`}
              style={{ left: `${(from / total) * 100}%`, width: `${(c.durS / total) * 100}%` }}
            >
              {take?.peaks && (
                <svg
                  aria-hidden
                  viewBox={`0 0 ${take.peaks.length} 100`}
                  preserveAspectRatio="none"
                  className="absolute inset-0 h-full"
                  style={{ width: `${Math.min(1, (take.durationS ?? c.durS) / c.durS) * 100}%` }}
                >
                  {take.peaks.map((p, i) => (
                    <rect key={i} x={i + 0.15} width={0.7} y={50 - p * 46} height={Math.max(1, p * 92)} className="fill-cyan-300/55" />
                  ))}
                </svg>
              )}
              <span className="font-jetbrains relative block truncate px-1.5 text-label text-white/60">{c.label}</span>
            </button>
          );
        })}
        <Needle totalS={total} />
      </div>
      <span className={`${CHIP_CLASS} ${TALLY_TONE[tone]} w-28 justify-center tabular-nums`}>
        {Math.round(spanned)}s / {Math.round(total)}s
      </span>
    </div>
  );
}

function Coverage() {
  const { cut } = useCutCtx();
  return (
    <div className="space-y-2 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <CoverageRow label="music" clips={cut.clips.filter((c) => c.track === "music")} total={cut.totalS} />
      <CoverageRow label="voice" clips={cut.clips.filter((c) => c.track === "vo")} total={cut.totalS} />
    </div>
  );
}

export default function Storyboard() {
  const { cut } = useCutCtx();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <OriginChip />
        <Transport />
        <NextAction className="ml-auto max-w-full" />
      </div>
      {cut.origin === "empty" ? (
        <Ghost shape="tile" count={5} label="no frames yet — no shots to lay out" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <Strip />
            <Coverage />
            <div className="grid gap-4 lg:grid-cols-2">
              <Inspector />
              <SyncBench />
            </div>
          </div>
          <div className="space-y-4">
            <Monitor compact />
            <FinishLine />
          </div>
        </div>
      )}
    </div>
  );
}
