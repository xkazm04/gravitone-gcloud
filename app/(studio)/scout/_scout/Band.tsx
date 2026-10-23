"use client";

// One band of the graph: the group's key (a Fold), its share against the split, what it spent, how far its live
// nodes reached - and, open, its StageGraph (a genre, BEFORE_SEEDS) or its genres' bands (an audience). Only an
// open band draws its graph: a folded one costs its head.

import { memo } from "react";

import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Fold } from "@gt/ui/components/fold/Fold.tsx";
import { ShareMeter } from "@gt/ui/components/graph/ShareMeter.tsx";
import { StageGraph } from "@gt/ui/components/graph/StageGraph.tsx";
import type { GraphView } from "@gt/ui/components/graph/stageGraph.ts";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { Band } from "./bands.ts";
import s from "./scout.module.css";

export type BandViewProps = {
  readonly band: Band;
  readonly view: GraphView;
  readonly open: Readonly<Record<string, boolean>>;
  readonly onToggle: (key: string, next: boolean) => void;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
  readonly nested?: boolean;
};

const min1 = (x: number): string => String(Math.round(x * 10) / 10);

// A band's graph re-renders only when its own nodes, its view or its own selection change: selecting a node in
// one band leaves the other bands' thousands of nodes alone (measured at 3,000 nodes: see the WP-S2 report).
const Graph = memo(StageGraph);

export function BandView({ band, view, open, onToggle, selected, onSelect, nested = false }: BandViewProps) {
  const g = band.group;
  const isOpen = open[g.key] ?? g.live > 0;
  return (
    // The Fold's head and body are laid out as this grid's cells (scout.module.css .band): the band's figures sit
    // on the head's row whether the band is open or folded.
    <section className={nested ? s.genre : s.band} aria-label={g.key}>
      <div className={s.meta}>
        {g.paused === true && <EntryPill entry={{ look: "paused", label: "paused" }} />}
        {g.depth !== undefined && <span className={s.depth}>{g.depth}</span>}
        {g.share !== undefined && <ShareMeter label={g.key} actual={g.share.actual} {...(g.share.target === undefined ? {} : { target: g.share.target })} />}
        <Tally value={g.effort.runs} label="runs" />
        <Tally value={min1(g.effort.gpuMin)} label="gpu min" />
        <Tally value={`$${g.effort.geminiUsd.toFixed(2)}`} label="gemini" />
      </div>
      <Fold title={g.key} open={isOpen} onToggle={(next) => onToggle(g.key, next)} total={g.nodes} level={nested ? 4 : 3}>
        {/* A folded band unmounts its graph (Fold keeps a seen body mounted, hidden): only open bands cost DOM. */}
        {!isOpen ? null : band.genres.length > 0 ? (
          band.genres.map((x) => <BandView key={x.group.key} band={x} view={view} open={open} onToggle={onToggle} selected={selected} onSelect={onSelect} nested />)
        ) : (
          <Graph name={g.key} nodes={band.nodes} edges={band.edges} view={view} selected={selected !== null && band.nodes.some((n) => n.id === selected) ? selected : null} onSelect={onSelect} />
        )}
      </Fold>
    </section>
  );
}
