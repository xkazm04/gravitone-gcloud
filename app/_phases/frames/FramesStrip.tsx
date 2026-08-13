"use client";

// STRIP — the cut as a running band.
//
// Metaphor: an edit bench. The frames are laid end to end in the order they
// will be seen and sized by how long they HOLD, so the thing you are always
// looking at is the sequence. A gap in the band is a gap in the video, which is
// the fact this step most needs to make unavoidable.
//
// It answers "together" first and "standalone" second: click a card in the band
// and it opens beneath, but the band never leaves the screen. The bet is that
// on a sixteen-frame cut, rhythm and coverage matter more than any one picture.

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { durationOf, type Frame } from "./frames";
import { FrameCanvas, KindChip, LayerBreakdown } from "./parts";
import type { useFrames } from "./useFrames";

export default function FramesStrip({ ctl }: { ctl: ReturnType<typeof useFrames> }) {
  const { frames, render, busy, generatePlate, setSubject } = ctl;
  const [openId, setOpenId] = useState<string>(frames[0]?.id ?? "");
  const open = frames.find((f) => f.id === openId) ?? frames[0];

  return (
    <div className="space-y-5">
      {/* the band */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-1.5">
          {frames.map((f, i) => {
            const dur = durationOf(frames, i, render.durationS);
            return (
              <button
                key={f.id}
                onClick={() => setOpenId(f.id)}
                title={`${f.at} · ${f.title}`}
                style={{ width: Math.max(64, dur * 5) }}
                className={`group shrink-0 rounded-lg border p-1 text-left transition ${
                  f.id === open?.id
                    ? "border-cyan-400/50 bg-cyan-400/5"
                    : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="relative block aspect-video overflow-hidden rounded bg-slate-950">
                  {f.plate.src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URL
                    <img src={f.plate.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span
                      className={`block h-full w-full ${
                        f.plate.state === "generating" ? "animate-pulse bg-white/10" : "bg-white/[0.04]"
                      }`}
                    />
                  )}
                  {f.plate.state === "empty" && (
                    <span className="absolute inset-0 grid place-items-center text-[9px] text-white/30">no plate</span>
                  )}
                </span>
                <span className="font-jetbrains mt-1 block truncate text-[9px] text-white/40">{f.at}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="font-jetbrains text-[11px] text-white/35">
        widths are hold times · {render.durationS}s across {frames.length} frames
      </p>

      {/* the opened frame */}
      {open && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <FrameCanvas frame={open} />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <KindChip kind={open.kind} />
              <span className="font-jetbrains text-[11px] text-white/40">{open.at}</span>
            </div>
            <h3 className="font-instrument text-2xl leading-tight text-white">{open.title}</h3>
            <p className="font-hanken text-[13px] leading-snug text-slate-400">&ldquo;{open.line}&rdquo;</p>

            <LayerBreakdown frame={open} />

            <div>
              <p className="font-jetbrains mb-1 text-[10px] tracking-[0.14em] text-white/40 uppercase">plate subject</p>
              <textarea
                value={open.plate.subject ?? ""}
                onChange={(e) => setSubject(open.id, e.target.value)}
                rows={3}
                placeholder="derived from the beat's role — edit to steer"
                className="font-hanken w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12px] leading-snug text-slate-200 focus:border-cyan-400/40 focus:outline-none"
              />
            </div>

            <button
              onClick={() => void generatePlate(open.id)}
              disabled={busy.has(open.id)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300/90 py-2.5 text-[13px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
            >
              {busy.has(open.id) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              )}
              {open.plate.state === "ready" ? "render again" : "render the plate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
