"use client";

// THE RUNS PARTS (prototype projects.js day-line and inspector; Phase 2 lot 18): the day-line
// with every bar look, a +N overflow, a Weir pile, a Calendar pin and a selected job lighting
// its chains; the lane chip in each kind; the resource summary. The data is literal and the
// clock is fixed, so the specimen draws the same every time it is opened. Selecting a bar
// here lights its chains as Runs does; the selection is the specimen's only state. Beside them the
// LoadBand over two literal nights (spark night-load-band): a balanced one, and one whose CPU queued
// itself while the GPU idled, with a gap where the worker restarted and a RAM the probe never read.

import { useState } from "react";

import { LOAD_BAND, LOAD_STRIP_MS, type LoadResource, type LoadSummary } from "@gt/domain/load";
import { LoadBand } from "@gt/ui/components/load/LoadBand.tsx";
import { LaneChip } from "@gt/ui/components/runs/LaneChip.tsx";
import { ResourceSummary } from "@gt/ui/components/runs/ResourceSummary.tsx";
import { RunsDayline, type DaylineBar, type DaylineRow } from "@gt/ui/components/runs/RunsDayline.tsx";
import { HOUR_MS } from "@gt/ui/components/runs/dayline.ts";
import { light, type Dep } from "@gt/ui/components/runs/thread.ts";

import { Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const NOW = Date.UTC(2026, 9, 15, 9, 12);
const at = (h: number): number => NOW + h * HOUR_MS;

const ROWS: readonly DaylineRow[] = [
  { id: "gpu.local", label: "GPU box", engines: "Flux 2 dev fp8 · Wan 2.2", cap: 1, kind: "local", held: { share: 1, name: "GPU box: 1 of 1 running" } },
  { id: "seat.text", label: "Text seat", engines: "article turns · scripts", cap: 4, kind: "seat", held: { share: 0.25, name: "Text seat: 1 of 4 running" } },
  { id: "cloud.google", label: "Google", engines: "Nano Banana · Gemini", cap: 3, kind: "cloud", held: { share: 0, name: "Google: 0 of 3 running" } },
  { id: "weir", label: "Weir · operator", engines: "verdicts", cap: 1, kind: "weir" },
  { id: "calendar", label: "Calendar", engines: "slots · publish", cap: 1, kind: "calendar" },
];

const bar = (id: string, row: string, s: number, e: number, look: DaylineBar["look"], label: string, more: Partial<DaylineBar> = {}): DaylineBar => ({
  id,
  row,
  s: at(s),
  e: at(e),
  look,
  label,
  floor: false,
  name: `${row}, ${label}, ${look}`,
  ...more,
});

const BARS: readonly DaylineBar[] = [
  bar("research", "seat.text", -5, -4.6, "done", "research"),
  bar("script", "seat.text", -4.5, -3.8, "done", "script"),
  bar("frames", "gpu.local", -3.6, 0, "running", "frames ×24", { progress: 0.6, sub: "generating" }),
  bar("old", "gpu.local", -3.5, -3.2, "failed", "frames ×18", { blocked: false }),
  bar("third", "gpu.local", -3.4, -3.1, "paused", "still ×2"),
  bar("motion", "gpu.local", 0.2, 1.2, "idle", "motion ×8", { blocked: true }),
  bar("score", "cloud.google", -2, -1.2, "awaiting", "score · interrupted"),
  bar("gate", "weir", -0.5, -0.5, "awaiting", "◆ frames", { mark: "gate" }),
];

const DEPS: readonly Dep[] = [
  { from: "research", to: "script" },
  { from: "script", to: "frames" },
  { from: "frames", to: "gate" },
  { from: "gate", to: "motion" },
];

/** A resource from its strip (a mean per five minutes, -1 unread), its figures agreeing with its bars. */
function resource(strip: readonly number[]): LoadResource {
  const read = strip.filter((v) => v >= 0);
  const sorted = [...read].sort((a, b) => a - b);
  const n = read.length;
  if (n === 0) return { avg: 0, p95: 0, inBand: 0, read: 0, strip: [] };
  return {
    avg: read.reduce((a, v) => a + v, 0) / n,
    p95: sorted[Math.min(n - 1, Math.ceil(n * 0.95) - 1)] ?? 0,
    inBand: read.filter((v) => v >= LOAD_BAND.low && v <= LOAD_BAND.high).length / n,
    read: n * 5,
    strip,
  };
}
const SLOTS = 72;
const curve = (f: (i: number) => number, gap?: readonly [number, number]): number[] =>
  Array.from({ length: SLOTS }, (_, i) => (gap !== undefined && i >= gap[0] && i < gap[1] ? -1 : Math.round(Math.max(0, Math.min(0.99, f(i))) * 100) / 100));
const night = (cpu: number[], ram: number[], gpu: number[], rest: Pick<LoadSummary, "commit" | "waited">): LoadSummary => ({
  fromMs: NOW - SLOTS * LOAD_STRIP_MS,
  toMs: NOW,
  samples: SLOTS * 5,
  band: LOAD_BAND,
  cpu: resource(cpu),
  ram: resource(ram),
  gpu: resource(gpu),
  ...rest,
});
const RESTART: readonly [number, number] = [40, 46];
const BALANCED = night(
  curve((i) => 0.68 + 0.1 * Math.sin(i * 0.35)),
  curve((i) => 0.72 + 0.05 * Math.sin(i * 0.12)),
  curve((i) => 0.55 + 0.3 * Math.sin(i * 0.27)),
  { commit: { peakGb: 88.4, limitGb: 102 }, waited: { memory: 41, "comfy-queue": 12 } },
);
const IDLE_GPU = night(
  curve((i) => 0.86 + 0.08 * Math.sin(i * 0.5), RESTART),
  Array.from({ length: SLOTS }, () => -1),
  curve((i) => (i % 18 === 0 ? 0.4 : 0.03), RESTART),
  { commit: { peakGb: 97 }, waited: { cpu: 22, alone: 6, vram: 3 } },
);

export function RunsSection() {
  const [job, setJob] = useState<string | null>("frames");
  const lit = light({ job }, DEPS, new Set(["motion"]));
  return (
    <Section id="runs">
      <Spec names={["RunsDayline"]} source="runs/RunsDayline.tsx · dayline.ts · thread.ts" wide>
        <RunsDayline
          name="Runs specimen: 5 rows, 8 bars, 1 slot"
          rows={ROWS}
          bars={BARS}
          pins={[{ id: "slot", at: at(3), state: "scheduled", name: "youtube trailer, scheduled", href: "#runs" }]}
          span={{ from: at(-6), to: at(6) }}
          zoom="24h"
          now={NOW}
          selected={job}
          lit={lit}
          open={new Set<string>()}
          onSelect={setJob}
          onToggleRow={() => {}}
          centre={{ key: "kit", at: "now" }}
        />
      </Spec>
      <Spec names={["LaneChip"]} source="runs/LaneChip.tsx">
        <div className={k.col}>
          <LaneChip lane="gpu.local" />
          <LaneChip lane="seat.text" />
          <LaneChip lane="cloud.qwen" />
          <LaneChip lane="weir" />
          <LaneChip lane="calendar" />
        </div>
      </Spec>
      <Spec names={["LoadBand"]} source="load/LoadBand.tsx · band.ts · spark night-load-band" wide>
        <div className={k.col}>
          <span className={k.lab}>balanced</span>
          <LoadBand load={BALANCED} />
          <span className={k.lab}>cpu over · gpu idle · restart gap · ram unread</span>
          <LoadBand load={IDLE_GPU} />
        </div>
      </Spec>
      <Spec names={["ResourceSummary"]} source="runs/ResourceSummary.tsx">
        <ResourceSummary
          label="resources"
          lines={[
            { lane: "gpu.local", cap: 1, running: 1, waiting: 1 },
            { lane: "seat.text", cap: 4, running: 2, waiting: 0 },
            { lane: "cloud.google", cap: 3, running: 0, waiting: 2 },
          ]}
        />
      </Spec>
    </Section>
  );
}
