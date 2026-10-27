// THE STAGE GRAPH (spark scout-decision-graph WP-S2; no prototype source): one band of the scout's decision graph
// as five columns - seed, derived, idea, run, output - with a node per decision and a link per "grew from".
// How far right a branch's live nodes reach is how far its decisions developed.
//
// What is the caller's and what is this component's: the caller says WHAT exists (the nodes and edges of one
// band, @gt/domain/scoutGraph's own types), the view and the selection, and owns what a press does; this draws
// it. Positions come from ./stageGraph.ts and nowhere else, links included (shared anchor geometry).
//
// THE LOOK. A node's mark is its verdict's Look (../status/status.ts via GRAPH_LOOK): kept emerald, open amber,
// pending cyan, rejected and failed rose. A DEAD node (rejected, failed) is drawn in the faint role - its words
// faint, its edge dashed - never by opacity, so it still reads at 3:1 (a mark) and 4.5:1 (its words) on the
// ground. A paused node carries the paused bars, and its links are dotted: held, not live.
//
// ACCESSIBILITY (canvas-graph: canvas-accessibility). The band is a named group whose name counts every node,
// drawn or not. Each node is a native button: a press or Enter selects it, its name says its words, kind,
// stage, verdict and pause - colour is never the only channel. The links are decoration (aria-hidden): what a
// node grew from is the caller's panel to say.

import type { GraphEdge, GraphNode, GraphStage } from "@gt/domain/scoutGraph";

import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import { vars } from "../vars.ts";
import { GRAPH_LOOK, isDeadNode, layout, nodeBox, spokenGraph, spokenNode, type GraphView } from "./stageGraph.ts";
import s from "./StageGraph.module.css";

export type StageGraphProps = {
  /** The band's name (`kids/comedy`): the group's accessible name, before its counts. */
  readonly name: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly view: GraphView;
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
};

export function StageGraph({ name, nodes, edges, view, selected, onSelect }: StageGraphProps) {
  const laid = layout(nodes, edges, view);
  return (
    <div className={s.scroll} role="group" aria-label={spokenGraph(name, nodes, view)} data-component="StageGraph">
      <div className={s.canvas} style={vars({ "--w": `${laid.width}px`, "--h": `${laid.height}px` })}>
        {laid.columns.map((c, i) => (
          <StageHead key={c.stage} stage={c.stage} x={nodeBox(i, 0).x} hidden={c.hidden} />
        ))}
        <svg className={s.links} width={laid.width} height={laid.height} aria-hidden="true">
          {laid.links.map((l) => (
            <path key={l.key} d={l.d} className={cx(s.link, l.dead && s.dead, l.held && s.held, selected !== null && (l.from === selected || l.to === selected) && s.lit)} />
          ))}
        </svg>
        {laid.columns.flatMap((c) =>
          c.placed.map((q) => {
            const b = nodeBox(q.col, q.row);
            return <GraphNodeButton key={q.node.id} node={q.node} x={b.x} y={b.y} selected={selected === q.node.id} onSelect={onSelect} />;
          }),
        )}
      </div>
    </div>
  );
}

/** A column's head: its stage, and under `live` how many dead nodes it hides. */
export function StageHead({ stage, x, hidden }: { readonly stage: GraphStage; readonly x: number; readonly hidden: number }) {
  return (
    <div className={s.head} style={vars({ "--x": `${x}px` })}>
      {stage}
      {hidden > 0 && (
        <>
          <b className={s.more} aria-hidden="true">
            +{hidden}
          </b>
          <SrOnly text={`, ${hidden} dead hidden`} />
        </>
      )}
    </div>
  );
}

export type GraphNodeButtonProps = {
  readonly node: GraphNode;
  readonly x: number;
  readonly y: number;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
};

/** One decision: its verdict's mark, its words, its kind, the paused bars when its branch is held. */
export function GraphNodeButton({ node, x, y, selected, onSelect }: GraphNodeButtonProps) {
  const look = GRAPH_LOOK[node.state].look;
  return (
    <button
      type="button"
      className={cx(s.node, s[`s-${look}`], isDeadNode(node) && s.gone, node.paused === true && s.paused)}
      style={vars({ "--x": `${x}px`, "--y": `${y}px` })}
      data-node={node.id}
      aria-pressed={selected}
      aria-label={spokenNode(node)}
      onClick={() => onSelect(node.id)}
    >
      <i className={cx(s.mark, s[`m-${look}`])} aria-hidden="true" />
      <span className={s.label} aria-hidden="true">
        {node.label}
      </span>
      {node.paused === true && <i className={s.bars} aria-hidden="true" />}
      <span className={s.kind} aria-hidden="true">
        {node.kind}
      </span>
    </button>
  );
}
