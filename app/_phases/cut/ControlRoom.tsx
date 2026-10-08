"use client";

// THE CONTROL ROOM — StatReel's room grid (ControlRoom.tsx): what you are
// working on at the left, the picture in the middle, what stands between it
// and a render at the right, the tracks along the bottom; a stage bar across
// the top with the one next action.

import { FinishLine, FinishPips, NextAction } from "./parts/FinishLine";
import { Inspector } from "./parts/Inspector";
import { Lanes } from "./parts/Lanes";
import { Monitor } from "./parts/Monitor";
import { SyncBench } from "./parts/SyncBench";
import { OriginChip, Transport } from "./parts/Transport";

export default function ControlRoom() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <OriginChip />
        <FinishPips />
        <NextAction className="max-w-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(0,1fr)_21rem]">
        <div className="order-2 space-y-4 xl:order-1">
          <Inspector />
          <SyncBench />
        </div>
        <div className="order-1 min-w-0 xl:order-2">
          <Monitor />
          <Transport className="mt-3" />
        </div>
        <FinishLine className="order-3 self-start" />
      </div>
      <Lanes />
    </div>
  );
}
