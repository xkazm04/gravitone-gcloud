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
  const [chosen, setView] = useState<(typeof VIEWS)[number]["id"]>("assembly");

  // A PROMOTIONAL CUT HAS NO FRAME LEDGER, so it must not open on one. Its beats
  // decompose into SHOTS (./shots.ts) and `frames` is [] BY CONSTRUCTION --
  // `framesFor` returns nothing for any origin but the explainer fixture
  // (./frames.ts:398). Mounting the assembly ledger anyway drew a 0/0 grid under
  // live "direct the cut" and "render 0 missing plates" buttons: an empty table
  // that reads as "nothing done yet" when the truth is "this step does not work
  // that way here". That is the happy-path-only surface the absence law forbids.
  //
  // DERIVED, NOT LATCHED, and deliberately not an effect. `ctl.render` is not
  // resolved on the first render, so a lazy useState initialiser would latch
  // whatever the placeholder said; and correcting it in an effect would add a
  // `react-hooks/set-state-in-effect` warning to a rule this repo RATCHETS. So
  // the pick stays the operator's and the EFFECTIVE view is computed from it --
  // which also means a pick made on an explainer survives a look at a trailer.
  const promotionalCut = ctl.render.origin !== "explainer-fixture";
  const view = promotionalCut && chosen !== "shots" ? "shots" : chosen;

  if (!ctl.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );

  // A STEP THAT COULD NOT BE READ IS NOT AN EMPTY STEP, and the two render
  // identically if this branch is missing: an unreadable cut would come up as a
  // ledger of freshly seeded frames, which reads as "nothing has been done here"
  // about work that may be several dollars of plates deep. Nothing below this
  // point is drawn, and `useFrames` has disarmed its save, so the record on disk
  // is left exactly as it is until the trouble clears.
  if (ctl.loadTrouble)
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-4">
        <p className="text-content leading-snug text-rose-200">
          This project&rsquo;s frames could not be read from local storage
          {ctl.loadTrouble.kind === "quota"
            ? " — the browser is out of room."
            : ctl.loadTrouble.kind === "blocked"
              ? " — another tab is holding the database open."
              : ctl.loadTrouble.kind === "unavailable"
                ? " — this browser session has no storage at all."
                : "."}
        </p>
        <p className="mt-2 text-content leading-relaxed text-white/45">
          Nothing was derived and nothing was written. Whatever is on disk is still there — reload once the
          reason above is gone rather than composing over it.
        </p>
        <p className="font-jetbrains mt-2 text-content text-white/30">{ctl.loadTrouble.message}</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
            {VIEWS.map((v) => {
              // Disabled and SAID SO, rather than hidden: a control that
              // vanishes teaches nothing about why it is not there.
              const unavailable = promotionalCut && v.id !== "shots";
              return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                disabled={unavailable}
                title={
                  unavailable
                    ? `${v.name} is the explainer's frame ledger. This is a promotional cut: its beats decompose into shots, not frames, so this view has nothing to show.`
                    : v.sub
                }
                // Which view is current is drawn in cyan and nowhere else. A
                // switcher whose state lives only in a colour is a switcher an
                // assistive-tech user cannot read.
                aria-pressed={view === v.id}
                className={`font-jetbrains rounded-lg px-3 py-1 text-label tracking-[0.1em] uppercase transition ${
                  view === v.id
                    ? "bg-cyan-400/15 text-cyan-100"
                    : unavailable
                      ? "cursor-not-allowed text-white/15"
                      : "text-white/40 hover:text-white/70"
                }`}
              >
                {v.name}
              </button>
              );
            })}
          </div>
          <p className="font-jetbrains text-content text-white/35">
            {ctl.frames.length} frames derived from &ldquo;{ctl.render.title}&rdquo; ({ctl.render.engineLabel})
          </p>
        </div>

        {/* Which identity these plates are in. Stated rather than assumed: a
            fallback preset is not the project's style, and a surface that let
            you believe it was would be lying at the moment it matters most. */}
        <p className={`font-jetbrains text-content ${ctl.hasLockedStyle ? "text-white/40" : "text-amber-200/90"}`}>
          style · {ctl.styleName}
        </p>
      </div>

      {ctl.error && (
        <p className="rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-content leading-snug text-rose-200">
          {ctl.error}
        </p>
      )}

      {/* PARTIAL SUCCESS, which is neither an error nor silence. A direction
          pass is minutes of real money over the whole script; when most of it
          lands and a few beats do not, saying so in rose would read as "the run
          failed" and send the user to pay for it again. The per-beat reasons
          are on the rows — this is only the count. */}
      {ctl.notice && (
        <p className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-4 py-2.5 text-content leading-snug text-amber-100/90">
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
