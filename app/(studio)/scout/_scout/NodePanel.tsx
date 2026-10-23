"use client";

// The selected node: its words, what it is and where it is decided, what it spent, what it grew from, and the
// steer's two acts on its branch - Pause, or Resume the paused seed that holds it. An act's refusal is the
// steer's sentence, verbatim.

import { useState } from "react";

import type { GraphNode, ScoutGraph } from "@gt/domain/scoutGraph";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts, type Fact } from "@gt/ui/components/facts/Facts.tsx";
import { GRAPH_LOOK } from "@gt/ui/components/graph/stageGraph.ts";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { boardFor } from "../../_shell/links.ts";
import type { ScoutPort, ScoutView } from "../_port/contract.ts";
import { nodeOf, steerRefOf } from "./bands.ts";
import s from "./scout.module.css";

export type NodePanelProps = {
  readonly graph: ScoutGraph;
  readonly node: GraphNode;
  readonly port: ScoutPort;
  readonly onView: (v: ScoutView) => void;
  readonly onClose: () => void;
};

const money = (x: number): string => `$${x.toFixed(x > 0 && x < 0.01 ? 4 : 2)}`;

function factsOf(n: GraphNode): Fact[] {
  const facets = [n.audience, n.genre, n.subgenre].filter((x): x is string => x !== undefined);
  return [
    { term: "stage", value: n.stage },
    { term: n.packet.startsWith("pkt:seeds:") ? "batch" : "night", value: n.at },
    { term: "packet", value: n.packet },
    ...(n.cell === undefined ? [] : [{ term: "cell", value: n.cell }]),
    ...(facets.length === 0 ? [] : [{ term: "branch", value: facets.join(" · ") }]),
    ...(n.seed === undefined ? [] : [{ term: "seed", value: n.seed }]),
    ...(n.effort === undefined
      ? []
      : [
          { term: "runs", value: n.effort.runs },
          { term: "gpu min", value: Math.round(n.effort.gpuMin * 10) / 10 },
          { term: "gemini", value: money(n.effort.geminiUsd) },
          { term: "uncapped", value: money(n.effort.uncappedUsd) },
        ]),
  ];
}

export function NodePanel({ graph, node, port, onView, onClose }: NodePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const steer = steerRefOf(graph, node);
  const from = graph.edges.filter((e) => e.to === node.id).map((e) => nodeOf(graph, e.from)).filter((x): x is GraphNode => x !== undefined);

  const act = async (run: () => Promise<ActionResult<ScoutView>>): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await run();
    setBusy(false);
    if (r.ok) onView(r.value);
    else setError(r.error.error);
  };

  return (
    <Panel title={node.kind} toolbar={<Button label="close" size="sm" onPress={onClose} />}>
      <div className={s.panelBody}>
        <p className={s.words}>{node.label}</p>
        <div className={s.row}>
          <EntryPill entry={GRAPH_LOOK[node.state]} />
          {node.paused === true && <EntryPill entry={{ look: "paused", label: "paused" }} />}
          {node.effort?.shared === true && <Chip label="shared" casing="lower" ghost />}
          {node.wing === "muse" && <Chip label="muse" casing="lower" />}
        </div>
        <Facts facts={factsOf(node)} />
        {from.length > 0 && (
          <ul className={s.from}>
            {from.map((f) => (
              <li key={f.id}>
                <span className={s.fromKind}>{f.kind}</span> {f.label}
              </li>
            ))}
          </ul>
        )}
        <div className={s.row}>
          <Button label="open on Board" size="sm" href={boardFor(node.packet)} glyphAfter="chevR" />
          {steer !== undefined &&
            (steer.paused ? (
              <Button label={`Resume ${steer.ref}`} size="sm" tone="emerald" disabled={busy} onPress={() => void act(() => port.resume({ ref: steer.ref }))} />
            ) : (
              <Button label={`Pause ${steer.ref}`} size="sm" tone="amber" disabled={busy} onPress={() => void act(() => port.pause({ ref: steer.ref }))} />
            ))}
        </div>
        {error !== null && <ErrorLine message={error} live />}
      </div>
    </Panel>
  );
}
