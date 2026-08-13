"use client";

// STEP 3 (Frames) — script beats in, composed pictures out.
//
// PROTOTYPE SWITCHER (throwaway — consolidation deletes it). Three directional
// variants over one shared state, so they differ in layout only:
//
//   Strip      the cut as a running band     — sequence first
//   Compositor one frame, layers opened up   — standalone first
//   Assembly   the cut as a production ledger — coverage first
//
// The old Lightbox is gone. It picked between three candidate STILLS per scene
// against a `veo-3` clip, which is the image-to-video architecture this project
// measured its way out of; nothing in it survives the move to plate + vector.

import { useState } from "react";

import FramesAssembly from "./FramesAssembly";
import FramesCompositor from "./FramesCompositor";
import FramesStrip from "./FramesStrip";
import { useFrames } from "./useFrames";

const VARIANTS = [
  { id: "strip", label: "Strip", line: "the cut as a running band — widths are hold times" },
  { id: "compositor", label: "Compositor", line: "one frame, layers toggleable" },
  { id: "assembly", label: "Assembly", line: "a ledger — read down a column for what is missing" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

export default function FramesStep({ projectId }: { projectId: string }) {
  const [variant, setVariant] = useState<VariantId>("strip");
  const ctl = useFrames();
  void projectId; // frames are derived from the script render, not yet persisted

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-jetbrains flex gap-2 text-[12px]">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(v.id)}
              title={v.line}
              className={`rounded-full border px-3 py-1.5 transition ${
                v.id === variant
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-white/10 text-white/50 hover:text-white/80"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Which identity these plates are in. Stated rather than assumed: a
            fallback preset is not the project's style, and a surface that let
            you believe it was would be lying at the exact moment it matters. */}
        <p
          className={`font-jetbrains text-[11px] ${ctl.hasLockedStyle ? "text-white/40" : "text-amber-200/90"}`}
        >
          style · {ctl.styleName}
        </p>
      </div>

      <p className="font-jetbrains text-[11px] text-white/35">
        {ctl.frames.length} frames derived from &ldquo;{ctl.render.title}&rdquo; ({ctl.render.engineLabel})
      </p>

      {ctl.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-[13px] text-rose-200">
          {ctl.error}
        </p>
      )}

      {variant === "strip" && <FramesStrip ctl={ctl} />}
      {variant === "compositor" && <FramesCompositor ctl={ctl} />}
      {variant === "assembly" && <FramesAssembly ctl={ctl} />}
    </div>
  );
}
