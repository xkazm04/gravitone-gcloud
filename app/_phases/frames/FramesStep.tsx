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

import { TabRail } from "@/components/ui/signal";

import Notice from "../_shared/ui/Notice";

import AlternativesView from "./alternatives/AlternativesView";
import FramesAssembly from "./FramesAssembly";
import ShotSheet from "./ShotSheet";
import { useFrames } from "./useFrames";

// THE THREE VIEWS, AND NOTHING ABOUT THEM. Each id used to carry a `sub` — "the
// cut as a production ledger", "keep, compare and choose plates per scene", "one
// beat, one to many shots — derived, read-only" — hung on the tab as a tooltip.
// <TabRail> has no slot for a blurb and that absence is the component: what the
// blurbs reached for rides on the tab itself, as a count or, for a locked tab, a
// reason. The shots view is still read-only (it edits nothing and generates
// nothing — see the header of ./ShotSheet); it is read-only in the code, which
// is where that fact does work.
const VIEWS = ["assembly", "alternatives", "shots"] as const;
type ViewId = (typeof VIEWS)[number];

export default function FramesStep({ projectId }: { projectId: string }) {
  const ctl = useFrames(projectId);
  const [chosen, setView] = useState<ViewId>("assembly");

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
  const view: ViewId = promotionalCut && chosen !== "shots" ? "shots" : chosen;

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
  // The one clause that is not the store's own words: the kind, in the reader's
  // language. The paragraph that used to follow it ("Nothing was derived and
  // nothing was written. Whatever is on disk is still there — reload once the
  // reason above is gone…") described this component's own restraint, which is
  // enforced in `useFrames` (its save is disarmed) rather than promised here.
  if (ctl.loadTrouble)
    return (
      <Notice
        title={
          ctl.loadTrouble.kind === "quota"
            ? "out of room"
            : ctl.loadTrouble.kind === "blocked"
              ? "another tab holds the database open"
              : ctl.loadTrouble.kind === "unavailable"
                ? "no storage in this browser session"
                : ctl.loadTrouble.kind
        }
      >
        <p className="font-jetbrains text-content text-white/45">{ctl.loadTrouble.message}</p>
        {/* The only remedy this app has for a read that would not land. There is
            no retry seam in `useFrames` — the read is issued once, on the
            project — so the button says what it does. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="font-jetbrains mt-2 rounded-lg border border-white/15 px-3 py-1.5 text-label text-white/70 transition hover:bg-white/5"
        >
          reload
        </button>
      </Notice>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Locked and SAID SO, rather than hidden: a control that vanishes
              teaches nothing about why it is not there. <TabRail> keeps a locked
              tab in the tab order, marks it `aria-disabled`, and hangs the one
              short clause behind its own disclosure — where the tooltip used to
              spend three sentences re-teaching what a promotional cut is. */}
          <TabRail
            label="frames views"
            active={view}
            onSelect={setView}
            tabs={VIEWS.map((id) => ({
              id,
              label: id,
              disabled: promotionalCut && id !== "shots",
              disabledReason: "not for promotional cuts",
            }))}
          />
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
        <ShotSheet
          projectId={projectId}
          render={ctl.render}
          block={ctl.block}
          hasLockedStyle={ctl.hasLockedStyle}
          donePhases={ctl.donePhases}
        />
      )}
    </div>
  );
}
