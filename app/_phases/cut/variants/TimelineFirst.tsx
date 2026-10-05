"use client";

// V2 · TIMELINE FIRST — the lanes are the room. Tall lanes carry the plates
// and the takes' waveforms inside their own blocks, so the picture is read off
// the timeline; the monitor floats small in a corner and folds away.

import { useState } from "react";

import { Maximize2, Minimize2 } from "lucide-react";

import { FinishLine, NextAction } from "../parts/FinishLine";
import { Inspector } from "../parts/Inspector";
import { Lanes } from "../parts/Lanes";
import { Monitor } from "../parts/Monitor";
import { SyncBench } from "../parts/SyncBench";
import { OriginChip, Transport } from "../parts/Transport";

function FloatingMonitor() {
  const [open, setOpen] = useState(true);
  return (
    <div
      className={`fixed right-6 bottom-6 z-40 rounded-2xl border border-white/12 bg-slate-950/90 p-3 shadow-[var(--gt-shadow-float)] backdrop-blur ${
        open ? "w-[min(26rem,calc(100vw-3rem))]" : ""
      }`}
    >
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Fold the monitor" : "Open the monitor"}
          aria-expanded={open}
          className="text-white/50 transition hover:text-white"
        >
          {open ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {open && <Monitor compact className="mt-1" />}
    </div>
  );
}

export default function TimelineFirst() {
  return (
    <div className="space-y-4 pb-24">
      <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 backdrop-blur">
        <OriginChip />
        <Transport />
        <NextAction className="ml-auto max-w-full" />
      </div>
      <Lanes tall thumbs waves />
      {/* The right gutter keeps these clear of the floating monitor. */}
      <div className="grid gap-4 lg:grid-cols-3 xl:pr-[27rem]">
        <Inspector />
        <div className="space-y-4">
          <SyncBench />
        </div>
        <FinishLine dense className="self-start" />
      </div>
      <FloatingMonitor />
    </div>
  );
}
