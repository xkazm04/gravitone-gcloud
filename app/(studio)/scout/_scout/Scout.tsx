"use client";

// THE /scout ISLAND - the decision graph as the server built it (../_port), and what the operator does between
// renders: the live | all view, which bands are open, the selected node, and the steer's writes (pause, resume, the
// split), each answered with the view rebuilt, which replaces the one held here. ONE graph (spark scout-vision S3): the
// muse archive's nodes sit in it beside the scout nights', marked on the node panel. Once a venture exists (spark
// scout-vision S2), a venture filter narrows the bands to the nodes that produce for it; the split editor and the node
// panel still read the whole graph.

import { useCallback, useMemo, useRef, useState } from "react";

import { BEFORE_SEEDS } from "@gt/domain/scoutGraph";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { isDeadNode, type GraphView } from "@gt/ui/components/graph/stageGraph.ts";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";

import { boardFor } from "../../_shell/links.ts";
import type { ScoutPort, ScoutView, SplitInput } from "../_port/contract.ts";
import { ALL_VENTURES, bandsOf, byVenture, nodeOf, openAtFirst } from "./bands.ts";
import { BandView } from "./Band.tsx";
import { NodePanel } from "./NodePanel.tsx";
import { SplitEditor } from "./SplitEditor.tsx";
import s from "./scout.module.css";

export type ScoutProps = { readonly initial: ScoutView; readonly port: ScoutPort };

/** A packet's door in the header: its id and what is undecided in it; none open is a zero, not a link. */
function PacketDoor({ word, open }: { readonly word: string; readonly open: { readonly packet: string; readonly undecided: number } | undefined }) {
  return open === undefined ? <Button label={word} size="sm" tally={{ value: 0, label: "undecided" }} disabled /> : <Button label={open.packet} size="sm" tally={{ value: open.undecided, label: "undecided" }} href={boardFor(open.packet)} glyphAfter="chevR" />;
}

export function Scout({ initial, port }: ScoutProps) {
  const [view, setView] = useState<ScoutView>(initial);
  const [mode, setMode] = useState<GraphView>("live");
  const [selected, setSelected] = useState<string | null>(null);
  const [venture, setVenture] = useState<string>(ALL_VENTURES);
  const g = view.graph;
  // The venture filter is drawn only once a venture exists.
  const ventures = view.ventures ?? [];
  const shown = ventures.some((v) => v.id === venture) ? venture : ALL_VENTURES;
  const bands = useMemo(() => bandsOf(byVenture(g, shown)), [g, shown]);
  const [open, setOpen] = useState<Record<string, boolean>>(() => openAtFirst(bands));
  const panel = useRef<HTMLDivElement | null>(null);

  const node = selected === null ? undefined : nodeOf(g, selected);
  const dead = g.nodes.filter(isDeadNode).length;
  // No audience yet (an empty store, or nothing but work from before seeds): no split to set, no side column.
  const splittable = g.groups.some((x) => x.key !== BEFORE_SEEDS);
  const side = node !== undefined || splittable;
  // Stable, so a band's memoised graph is not re-rendered by a press elsewhere.
  const select = useCallback((id: string): void => {
    setSelected(id);
    // On a narrow screen the panel sits above the bands: bring it into view.
    window.requestAnimationFrame(() => panel.current?.scrollIntoView({ block: "nearest" }));
  }, []);
  const toggle = useCallback((key: string, next: boolean): void => setOpen((o) => ({ ...o, [key]: next })), []);
  const pickVenture = (next: string): void => {
    setVenture(next);
    setOpen(openAtFirst(bandsOf(byVenture(g, next))));
  };

  return (
    <div className={s.scout} data-component="Scout">
      <header className={s.top}>
        <PacketDoor word="seeds" open={g.open.seeds} />
        <PacketDoor word="night" open={g.open.night} />
        <span className={s.grow} />
        {ventures.length > 0 && (
          <Seg
            label="venture"
            value={shown}
            onChange={pickVenture}
            options={[{ value: ALL_VENTURES, label: "all", count: g.nodes.length }, ...ventures.map((v) => ({ value: v.id, label: v.name, count: g.nodes.filter((n) => n.venture === v.id).length }))]}
          />
        )}
        <Seg
          label="nodes"
          value={mode}
          onChange={setMode}
          options={[
            { value: "live", label: "live", count: g.nodes.length - dead },
            { value: "all", label: "all", count: g.nodes.length },
          ]}
        />
      </header>
      <div className={s.body} data-side={side ? undefined : "none"}>
        <div className={s.bands}>
          {bands.map((b) => (
            <BandView key={b.group.key} band={b} view={mode} open={open} onToggle={toggle} selected={selected} onSelect={select} />
          ))}
        </div>
        {side && (
          <aside className={s.side} ref={panel}>
            {node !== undefined && <NodePanel graph={g} node={node} port={port} onView={setView} onClose={() => setSelected(null)} />}
            {splittable && <SplitEditor groups={g.groups} split={view.split} save={(split: SplitInput) => port.split(split)} onView={setView} />}
          </aside>
        )}
      </div>
    </div>
  );
}
