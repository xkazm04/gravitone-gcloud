"use client";

// THE CUT, AS A SEQUENCER — the non-music-video branch of ./CutTimeline.
//
// One data model (./useCut), one clock (./clock), the takes slaved to it
// (./useTakeAudio), and three directional layouts over them behind `?v=`
// (components/ui/VariantSwitch — prototype-only, deleted at consolidation):
//
//   1 · Control room   inspector left, monitor centre, finish line right,
//                      lanes along the bottom — StatReel's ControlRoom grid.
//   2 · Timeline       tall lanes with plates and waveforms in them, the
//                      monitor floating small in a corner.
//   3 · Storyboard     the shots as a strip with the needle across it, a
//                      music/voice coverage lane, the finish line beside.
//
// `useVariant` reads search params, so this subtree sits under its own
// <Suspense> — the rule Next 16 enforces for `useSearchParams` in a client
// component. The studio's own `?step=` rides along untouched: VariantSwitch
// edits only `v`.

import { Suspense, useMemo, useState } from "react";

import { VariantSwitch, useVariant } from "@/components/ui/VariantSwitch";

import { useCutClock } from "./clock";
import { drawnStart } from "./offsets";
import { useTransportKeys } from "./parts/Transport";
import { CutContext, useCut, type CutCtx, type CutModel } from "./useCut";
import { useTakeAudio, type TakeSpan } from "./useTakeAudio";
import ControlRoom from "./variants/ControlRoom";
import Storyboard from "./variants/Storyboard";
import TimelineFirst from "./variants/TimelineFirst";

export default function CutWorkbench({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={null}>
      <Bench projectId={projectId} />
    </Suspense>
  );
}

function Bench({ projectId }: { projectId: string }) {
  const model = useCut(projectId);
  const [v] = useVariant();

  if (model.trouble)
    return (
      <div role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-400/5 px-5 py-4">
        <p className="font-jetbrains text-label tracking-[0.14em] text-rose-300 uppercase">{model.trouble.phase}</p>
        <p className="font-hanken mt-1 text-content text-rose-200">{model.trouble.message}</p>
      </div>
    );
  if (!model.loaded || !model.cut)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the cut…
      </p>
    );
  return <Loaded model={model} v={v} />;
}

function Loaded({ model, v }: { model: CutModel; v: 1 | 2 | 3 }) {
  const cut = model.cut!;
  const clock = useCutClock(cut.totalS);
  const [muted, setMuted] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  useTransportKeys(clock);

  const spans: TakeSpan[] = useMemo(
    () =>
      cut.clips
        .filter((c) => c.track === "music" && c.src)
        .map((c) => ({ id: c.id, src: c.src!, startS: drawnStart(model.offsets, c), durS: c.durS })),
    [cut, model.offsets],
  );
  useTakeAudio(clock, spans, muted, setRefused);

  const ctx: CutCtx = { ...model, cut, clock, muted, setMuted, refused, setRefused };

  return (
    <CutContext.Provider value={ctx}>
      {/* Bottom room so the last row scrolls clear of the variant chip. */}
      <div data-testid="cut-workbench" data-variant={v} data-origin={cut.origin} className="pb-16">
        {v === 1 ? <ControlRoom /> : v === 2 ? <TimelineFirst /> : <Storyboard />}
      </div>
      <VariantSwitch labels={["Control room", "Timeline", "Storyboard"]} />
    </CutContext.Provider>
  );
}
