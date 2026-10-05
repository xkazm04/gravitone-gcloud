"use client";

// THE MONITOR — the shot under the playhead, composited as Frames composites
// it, in either delivery shape.
//
// From StatReel's Monitor.tsx: the 9:16 / 16:9 toggle and the safe-zone
// overlay. What it shows is decided by ONE selector — the index of the scene
// under the playhead — so the compositor below renders once per cut, never
// per frame. A frame with no plate is still a frame: `FrameCanvas` draws its
// vector marks and its words over the wash, which is what the picture IS until
// a plate lands. A fixture scene has no frame at all, only the candidate's
// gradient the fixture authored, and its slugline.
//
// 9:16 is a CENTRE CROP of the 16:9 composite, not a re-layout: frames are
// authored at 16:9 (FrameCanvas's viewBox is 100×56), and showing what a
// vertical delivery would cut away is the question the toggle answers.

import { useState } from "react";

import { Ghost } from "@/components/ui/signal";

import { FrameCanvas } from "../../frames/parts";
import { useClockSelector } from "../clock";
import { sceneIndexAt } from "../deriveTimeline";
import { useCutCtx } from "../useCut";

type Aspect = "16:9" | "9:16";

/**
 * SAFE ZONES, drawn rather than described.
 *
 *  16:9  action-safe 93% and title-safe 90% of the frame — the SMPTE ST 2046-1
 *        figures broadcast still grades against.
 *  9:16  the bands the vertical platforms lay their own chrome over: a top
 *        strip, a bottom block (caption + handle), a right rail (buttons).
 *        Approximations, stated as such — no platform publishes one number,
 *        and these sit at the conservative end of what they draw.
 */
function SafeZones({ aspect }: { aspect: Aspect }) {
  if (aspect === "16:9")
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-[3.5%] rounded-sm border border-dashed border-amber-300/50" />
        <div className="absolute inset-[5%] rounded-sm border border-dashed border-cyan-200/50" />
      </div>
    );
  const band = "absolute bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_6px,transparent_6px_12px)] border-amber-300/40";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`${band} inset-x-0 top-0 h-[10%] border-b border-dashed`} />
      <div className={`${band} inset-x-0 bottom-0 h-[22%] border-t border-dashed`} />
      <div className={`${band} top-[10%] right-0 bottom-[22%] w-[14%] border-l border-dashed`} />
    </div>
  );
}

export function Monitor({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { cut, clock } = useCutCtx();
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [safe, setSafe] = useState(false);
  const at = useClockSelector(clock, (s) => sceneIndexAt(cut.scenes, s.t));
  const scene = at >= 0 ? cut.scenes[at] : null;
  const frame = scene ? cut.frames[scene.id] : undefined;
  const plate = scene ? cut.clips.find((c) => c.track === "video" && c.ref === scene.id) : undefined;

  const seg = (on: boolean) =>
    `rounded-md px-2 py-0.5 transition ${on ? "bg-white/10 text-white" : "text-white/45 hover:text-white"}`;

  return (
    <figure className={`min-w-0 ${className}`} aria-label="Monitor">
      <div
        data-testid="cut-monitor"
        data-scene={scene?.id ?? ""}
        className={`relative mx-auto overflow-hidden rounded-xl border border-white/10 bg-slate-950 ${
          aspect === "16:9" ? "aspect-video w-full" : `aspect-[9/16] ${compact ? "h-56" : "h-[min(60vh,34rem)]"}`
        }`}
      >
        {frame ? (
          <div
            className={
              aspect === "16:9" ? "absolute inset-0" : "absolute inset-y-0 left-1/2 aspect-video h-full -translate-x-1/2"
            }
          >
            <FrameCanvas frame={frame} className="h-full w-full rounded-none! border-0!" />
          </div>
        ) : scene ? (
          <div className={`absolute inset-0 bg-gradient-to-br ${scene.tone ?? ""}`}>
            <p className="font-instrument absolute inset-x-0 bottom-[12%] px-6 text-center text-2xl text-white/85">
              {scene.label}
            </p>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6">
            <Ghost shape="slot" label="no shot under the playhead" />
          </div>
        )}

        {safe && <SafeZones aspect={aspect} />}

        <span className="font-jetbrains absolute top-2 left-2 rounded bg-black/55 px-1.5 text-label text-white/70">
          {aspect}
          {scene ? ` · ${scene.index}/${cut.scenes.length}` : ""}
        </span>
        {plate?.status === "missing" && frame && (
          <span className="font-jetbrains absolute top-2 right-2 rounded border border-dashed border-rose-400/50 bg-black/55 px-1.5 text-label text-rose-200/90">
            {plate.why}
          </span>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Aspect" className="font-jetbrains flex rounded-lg border border-white/10 p-0.5 text-label">
          {(["16:9", "9:16"] as const).map((a) => (
            <button key={a} type="button" aria-pressed={aspect === a} onClick={() => setAspect(a)} className={seg(aspect === a)}>
              {a}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={safe}
          onClick={() => setSafe((s) => !s)}
          className={`font-jetbrains rounded-lg border border-white/10 px-2 py-0.5 text-label ${seg(safe)}`}
        >
          safe zone
        </button>
        {scene && !compact && (
          <span className="font-hanken min-w-0 flex-1 truncate text-right text-content text-white/70">{scene.label}</span>
        )}
      </figcaption>
    </figure>
  );
}
