"use client";

// THE CUT, AS A SEQUENCER — the non-music-video branch of ./CutTimeline.
//
// One data model (./useCut), one clock (./clock), the takes slaved to it
// (./useTakeAudio), laid out as the Control room (./ControlRoom): inspector
// left, monitor centre, finish line right, lanes along the bottom —
// StatReel's ControlRoom grid. It won a three-way prototype round on
// 2026-10-05 against a timeline-first layout (tall lanes, floating monitor)
// and a storyboard (shot strip with the needle across it); both are deleted.

import { useMemo, useState } from "react";

import { useCutClock } from "./clock";
import { drawnStart } from "./offsets";
import { useTransportKeys } from "./parts/Transport";
import { CutContext, useCut, type CutCtx, type CutModel } from "./useCut";
import { useTakeAudio, type TakeSpan } from "./useTakeAudio";
import ControlRoom from "./ControlRoom";

export default function CutWorkbench({ projectId }: { projectId: string }) {
  const model = useCut(projectId);

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
  return <Loaded model={model} />;
}

function Loaded({ model }: { model: CutModel }) {
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
      <div data-testid="cut-workbench" data-origin={cut.origin}>
        <ControlRoom />
      </div>
    </CutContext.Provider>
  );
}
