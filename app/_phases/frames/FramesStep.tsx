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

import { useState } from "react";

import AlternativesView from "./alternatives/AlternativesView";
import FramesAssembly from "./FramesAssembly";
import ShotSheet from "./ShotSheet";
import { useFrames } from "./useFrames";

const VIEWS = [
  { id: "assembly", name: "assembly", sub: "the cut as a production ledger" },
  { id: "alternatives", name: "alternatives", sub: "keep, compare and choose plates per scene" },
  // READ-ONLY. A promotional cut's beat is one to many shots; this shows the
  // decomposition and its review. It edits nothing and generates nothing — see
  // the header of ./ShotSheet.
  { id: "shots", name: "shots", sub: "one beat, one to many shots — derived, read-only" },
] as const;

export default function FramesStep({ projectId }: { projectId: string }) {
  const ctl = useFrames(projectId);
  const [view, setView] = useState<(typeof VIEWS)[number]["id"]>("assembly");

  if (!ctl.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-[12px] tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                title={v.sub}
                className={`font-jetbrains rounded-lg px-3 py-1 text-[11px] tracking-[0.1em] uppercase transition ${
                  view === v.id ? "bg-cyan-400/15 text-cyan-100" : "text-white/40 hover:text-white/70"
                }`}
              >
                {v.name}
              </button>
            ))}
          </div>
          <p className="font-jetbrains text-[11px] text-white/35">
            {ctl.frames.length} frames derived from &ldquo;{ctl.render.title}&rdquo; ({ctl.render.engineLabel})
          </p>
        </div>

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

      {/* PARTIAL SUCCESS, which is neither an error nor silence. A direction
          pass is minutes of real money over the whole script; when most of it
          lands and a few beats do not, saying so in rose would read as "the run
          failed" and send the user to pay for it again. The per-beat reasons
          are on the rows — this is only the count. */}
      {ctl.notice && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-2.5 text-[13px] leading-snug text-amber-100/90">
          {ctl.notice}
        </p>
      )}

      {view === "assembly" && <FramesAssembly ctl={ctl} />}
      {view === "alternatives" && <AlternativesView ctl={ctl} projectId={projectId} />}
      {/* The render satisfies `ShotSourceRender` structurally — the shot layer
          never imports the script step's beat enum. See ./shots. */}
      {view === "shots" && (
        <ShotSheet render={ctl.render} block={ctl.block} hasLockedStyle={ctl.hasLockedStyle} />
      )}
    </div>
  );
}
