"use client";

// STEP 3 (Frames) — script beats in, composed pictures out.
//
// Prototype round 1 ran three variants: Strip (the cut as a running band),
// Compositor (one frame, layers opened up) and this, Assembly. Assembly won and
// the other two are gone — on a sixteen-frame cut the question you ask a
// hundred times a day is "what is not done", and only a ledger answers it
// without scrolling. Its text editing came across from Compositor, because
// binding a figure to a fact needs somewhere to type.
//
// The old Lightbox is gone too. It picked between candidate STILLS against a
// veo-3 clip — the image-to-video architecture this project measured its way
// out of.

import FramesAssembly from "./FramesAssembly";
import { useFrames } from "./useFrames";

export default function FramesStep({ projectId }: { projectId: string }) {
  const ctl = useFrames(projectId);

  if (!ctl.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-jetbrains text-[11px] text-white/35">
          {ctl.frames.length} frames derived from &ldquo;{ctl.render.title}&rdquo; ({ctl.render.engineLabel})
        </p>

        {/* Which identity these plates are in. Stated rather than assumed: a
            fallback preset is not the project's style, and a surface that let
            you believe it was would be lying at the moment it matters most. */}
        <p className={`font-jetbrains text-[11px] ${ctl.hasLockedStyle ? "text-white/40" : "text-amber-200/90"}`}>
          style · {ctl.styleName}
        </p>
      </div>

      {ctl.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-[13px] leading-snug text-rose-200">
          {ctl.error}
        </p>
      )}

      <FramesAssembly ctl={ctl} />
    </div>
  );
}
