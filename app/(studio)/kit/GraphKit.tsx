"use client";

// THE SCOUT'S DECISION GRAPH PARTS (spark scout-decision-graph WP-S2): one band of the stage graph with every
// verdict - kept, rejected, open, pending, failed - a paused branch, an output, and both views (all, and live with
// its `+N` dead per column); the share meter under, at and over its target, and with no split set. The data is
// literal, so the specimen draws the same every time it is opened; selecting a node lights its links.

import { useState } from "react";

import type { GraphEdge, GraphNode } from "@gt/domain/scoutGraph";
import { ShareMeter } from "@gt/ui/components/graph/ShareMeter.tsx";
import { StageGraph } from "@gt/ui/components/graph/StageGraph.tsx";
import type { GraphView } from "@gt/ui/components/graph/stageGraph.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { Row, Section, Spec } from "./Spec.tsx";

const at = "2026-10-21";
const n = (id: string, stage: GraphNode["stage"], kind: GraphNode["kind"], label: string, state: GraphNode["state"], more: Partial<GraphNode> = {}): GraphNode => ({
  id,
  stage,
  kind,
  label,
  state,
  at,
  packet: stage === "seed" || stage === "derived" ? `pkt:seeds:${at}` : `pkt:scout:${at}`,
  audience: "kids",
  genre: "comedy",
  ...more,
});

const NODES: readonly GraphNode[] = [
  n("seed:a", "seed", "seed", "A comedy sketch for kids: a robot learning to whistle", "kept"),
  n("seed:b", "seed", "seed", "A comedy lyric video for kids: two rival snow ploughs", "rejected"),
  n("seed:c", "seed", "seed", "A comedy short for kids: a submarine bakery", "kept", { paused: true }),
  n("seed:d", "seed", "seed", "A comedy explainer for kids: the quietest football match", "open"),
  n("seed:a1", "derived", "seed", "The robot whistles one note, and the harbour answers", "kept"),
  n("idea:1", "idea", "idea", "Whistle Bot, as a sketch", "kept", { effort: { runs: 1, gpuMin: 0, geminiUsd: 0.02, uncappedUsd: 0.12, shared: true } }),
  n("idea:2", "idea", "reel", "How loud is a harbour?", "rejected"),
  n("idea:3", "idea", "idea", "Submarine bakery, the morning shift", "kept", { paused: true }),
  n("run:1", "run", "scene", "the cold open of the pilot", "kept", { effort: { runs: 1, gpuMin: 14, geminiUsd: 0.012, uncappedUsd: 0.06 } }),
  n("run:2", "run", "style", "the series' baseline look", "pending"),
  n("run:3", "run", "asset3d", "a prop for the lighthouse game", "failed"),
  n("run:4", "run", "track", "A bouncy song about a robot learning to whistle", "open"),
  n("out:1", "output", "clip", "the cold open of the pilot", "kept"),
];
const EDGES: readonly GraphEdge[] = [
  { from: "seed:a", to: "seed:a1" },
  { from: "seed:a", to: "idea:1" },
  { from: "seed:a1", to: "idea:2" },
  { from: "seed:c", to: "idea:3" },
  { from: "idea:1", to: "run:1" },
  { from: "idea:1", to: "run:2" },
  { from: "idea:2", to: "run:3" },
  { from: "seed:a", to: "run:4" },
  { from: "run:1", to: "out:1" },
];

export function GraphSection() {
  const [view, setView] = useState<GraphView>("all");
  const [selected, setSelected] = useState<string | null>("idea:1");
  return (
    <Section id="graph">
      <Spec names={["StageGraph", "StageHead", "GraphNodeButton"]} source="spark scout-decision-graph · /scout band" wide>
        <Row label="view">
          <Seg label="nodes" value={view} onChange={setView} options={[{ value: "live", label: "live" }, { value: "all", label: "all" }]} />
        </Row>
        <StageGraph name="kids/comedy" nodes={NODES} edges={EDGES} view={view} selected={selected} onSelect={setSelected} />
      </Spec>
      <Spec names={["ShareMeter"]} source="a group's share vs the split">
        <Row label="under">
          <ShareMeter label="kids" actual={29} target={50} />
        </Row>
        <Row label="at">
          <ShareMeter label="family" actual={30} target={30} />
        </Row>
        <Row label="over">
          <ShareMeter label="adult" actual={41} target={20} />
        </Row>
        <Row label="no split">
          <ShareMeter label="before seeds" actual={71} />
        </Row>
      </Spec>
    </Section>
  );
}
