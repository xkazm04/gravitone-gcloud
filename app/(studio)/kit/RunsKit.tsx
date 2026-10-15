"use client";

// THE RUNS PARTS (prototype projects.js day-line and inspector; Phase 2 lot 18): the day-line
// with every bar look, a +N overflow, a Weir pile, a Calendar pin and a selected job lighting
// its chains; the lane chip in each kind; the resource summary. The data is literal and the
// clock is fixed, so the specimen draws the same every time it is opened. Selecting a bar
// here lights its chains as Runs does; the selection is the specimen's only state.

import { useState } from "react";

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
