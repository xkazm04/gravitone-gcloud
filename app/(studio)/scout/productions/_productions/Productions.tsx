"use client";

// /scout/productions (spark concept-casting-stages S0): three layouts of the same scripted story behind one switch,
// so the operator can pick or fuse. Nothing here reads a store or calls a vendor; the fixture control reaches the
// loading, empty, failed and refused states.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { GRAPH_STAGES, type GraphEdge, type GraphNode } from "@gt/domain/scoutGraph";
import { refusalOfMove } from "@gt/domain/production.machine";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Select } from "@gt/ui/components/field/Field.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { StageGraph } from "@gt/ui/components/graph/StageGraph.tsx";
import { nodeBox } from "@gt/ui/components/graph/stageGraph.ts";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ProductionEntry, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";
import { STAGE_ORDER, initialScript, isKept, scriptReducer, stageOf, type Dispatch, type ScriptState } from "./script.ts";
import { Journey, SourceChip, STAGE_PILL } from "./Sections.tsx";

type Layout = "board" | "page" | "graph";
type FixtureState = "story" | "loading" | "empty" | "failed" | "refused";

const LAYOUTS: readonly { readonly value: Layout; readonly label: string }[] = [
  { value: "board", label: "Stage board" },
  { value: "page", label: "Concept page" },
  { value: "graph", label: "Graph first" },
];
const FIXTURE_STATES: readonly { readonly value: FixtureState; readonly label: string }[] = [
  { value: "story", label: "scripted story" },
  { value: "loading", label: "loading" },
  { value: "empty", label: "empty" },
  { value: "failed", label: "failed" },
  { value: "refused", label: "refused" },
];

const conceptWord = (n: number): string => (n === 1 ? "concept" : "concepts");

type LayoutProps = { readonly view: ProductionsView; readonly script: ScriptState; readonly dispatch: Dispatch; readonly selected: ProductionEntry | undefined; readonly onSelect: (id: string) => void };

function ConceptCard({ entry, script, selected, onSelect }: { readonly entry: ProductionEntry; readonly script: ScriptState; readonly selected: boolean; readonly onSelect: (id: string) => void }) {
  const stage = stageOf(entry, script);
  return (
    <button type="button" className={s.card} aria-pressed={selected} onClick={() => onSelect(entry.production.id)} data-concept={entry.production.id}>
      {entry.poster !== undefined ? <Plate src={entry.poster} alt="" className={s.cardArt} lazy /> : <span className={s.noPicture}>no picture yet</span>}
      <strong className={s.name}>{entry.production.title}</strong>
      <span className={s.row}>
        {isKept(entry, script) ? <Chip label="kept" tone="amber" casing="lower" /> : <EntryPill entry={STAGE_PILL[stage]} />}
      </span>
      <SourceChip entry={entry} compact />
    </button>
  );
}

function StageBoard({ view, script, dispatch, selected, onSelect }: LayoutProps) {
  const kept = view.entries.filter((e) => isKept(e, script));
  const started = view.entries.filter((e) => !isKept(e, script));
  const columns = [...STAGE_ORDER, "dropped" as const];
  return (
    <div className={s.boardLayout}>
      <div className={s.columns}>
        <section className={s.column} aria-label="kept, not started">
          <CapsHeading text="kept" tally={{ value: kept.length, label: conceptWord(kept.length) }} />
          {kept.map((e) => (
            <ConceptCard key={e.production.id} entry={e} script={script} selected={selected?.production.id === e.production.id} onSelect={onSelect} />
          ))}
        </section>
        {columns.map((stage) => {
          const here = started.filter((e) => stageOf(e, script) === stage);
          return (
            <section key={stage} className={s.column} aria-label={STAGE_PILL[stage].label}>
              <CapsHeading text={STAGE_PILL[stage].label} tally={{ value: here.length, label: conceptWord(here.length) }} />
              {here.map((e) => (
                <ConceptCard key={e.production.id} entry={e} script={script} selected={selected?.production.id === e.production.id} onSelect={onSelect} />
              ))}
            </section>
          );
        })}
      </div>
      <div className={s.drawer}>
        {selected !== undefined ? <Detail entry={selected} view={view} script={script} dispatch={dispatch} scope="current" /> : <Empty label="pick a concept to work on it" />}
      </div>
    </div>
  );
}

function ConceptPage({ view, script, dispatch, selected, onSelect }: LayoutProps) {
  return (
    <div className={s.pageLayout}>
      <nav className={s.list} aria-label="concepts">
        {view.entries.map((e) => (
          <ConceptCard key={e.production.id} entry={e} script={script} selected={selected?.production.id === e.production.id} onSelect={onSelect} />
        ))}
      </nav>
      <div className={s.scroll}>{selected !== undefined ? <Detail entry={selected} view={view} script={script} dispatch={dispatch} scope="whole" /> : <Empty label="pick a concept to work on it" />}</div>
    </div>
  );
}

function graphOf(entries: readonly ProductionEntry[], script: ScriptState): { readonly nodes: GraphNode[]; readonly edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const e of entries) {
    const id = e.production.id;
    const packet = `pkt:scout:${id}`;
    const conceptId = `${id}#concept`;
    const kept = isKept(e, script);
    nodes.push({ id: conceptId, stage: "idea", kind: "idea", label: e.production.title, state: kept ? "open" : "kept", at: e.production.startedAt.slice(0, 10), packet });
    const boardId = `${id}#board`;
    nodes.push({ id: boardId, stage: "board", kind: "storyboard", label: `board: ${e.logline}`, state: "kept", at: e.production.startedAt.slice(0, 10), packet });
    edges.push({ from: conceptId, to: boardId });
    if (kept) continue;
    for (const t of e.production.takes) {
      const takeId = `${id}#${t.id}`;
      const proven = t.provenAt !== undefined || script.proven[id] === t.id;
      nodes.push({ id: takeId, stage: "run", kind: "reel", label: `${t.kind}: ${t.beats.join(", ")}`, state: t.state === "failed" ? "failed" : t.state === "rendering" ? "pending" : proven ? "kept" : "open", at: t.at.slice(0, 10), packet });
      edges.push({ from: boardId, to: takeId });
    }
    const stage = stageOf(e, script);
    if (e.production.cut !== undefined && stage !== "dropped") {
      const cutId = `${id}#cut`;
      nodes.push({ id: cutId, stage: "output", kind: "piece", label: `final cut: ${e.production.title}`, state: e.production.cut.state === "approved" ? "kept" : "open", at: e.production.cut.at.slice(0, 10), packet });
      const last = e.production.takes.at(-1);
      edges.push({ from: last === undefined ? boardId : `${id}#${last.id}`, to: cutId });
    }
  }
  return { nodes, edges };
}

function GraphFirst({ view, script, dispatch, selected, onSelect }: LayoutProps) {
  const { nodes, edges } = useMemo(() => graphOf(view.entries, script), [view.entries, script]);
  const selectedNode = selected === undefined ? null : `${selected.production.id}#concept`;
  const pane = useRef<HTMLDivElement>(null);
  // Concepts start at the idea column: the two columns before it are empty on this screen.
  useEffect(() => {
    const graph = pane.current?.querySelector("[data-component=StageGraph]");
    if (graph !== null && graph !== undefined) graph.scrollLeft = nodeBox(GRAPH_STAGES.indexOf("idea"), 0).x;
  }, []);
  return (
    <div className={s.graphLayout}>
      <div className={s.scroll} ref={pane}>
        <StageGraph name="concepts" nodes={nodes} edges={edges} view="all" selected={selectedNode} onSelect={(id) => onSelect(id.split("#")[0] ?? id)} />
      </div>
      <div className={s.inspector}>{selected !== undefined ? <Detail entry={selected} view={view} script={script} dispatch={dispatch} scope="current" /> : <Empty label="pick a node to work on it" />}</div>
    </div>
  );
}

function Detail({ entry, view, script, dispatch, scope }: { readonly entry: ProductionEntry; readonly view: ProductionsView; readonly script: ScriptState; readonly dispatch: Dispatch; readonly scope: "current" | "whole" }) {
  const stage = stageOf(entry, script);
  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <h2 className={s.title}>{entry.production.title}</h2>
        {isKept(entry, script) ? <Chip label="kept, not started" tone="amber" casing="lower" /> : <EntryPill entry={STAGE_PILL[stage]} />}
        <SourceChip entry={entry} />
      </div>
      <Journey key={entry.production.id} entry={entry} view={view} script={script} dispatch={dispatch} scope={scope} />
    </div>
  );
}

const LOADING_ROWS = 4;

function Loading({ layout }: { readonly layout: Layout }) {
  return <div className={s.state} data-state="loading"><Ghost count={layout === "board" ? LOADING_ROWS * 2 : LOADING_ROWS} label="loading productions" /></div>;
}

const REFUSED_SENTENCES = [refusalOfMove("hero", "casting", "operator"), refusalOfMove("rough", "proven", "agent")].filter((x): x is string => x !== undefined);

function Body({ layout, view, script, dispatch, selected, onSelect }: LayoutProps & { readonly layout: Layout }) {
  if (layout === "board") return <StageBoard view={view} script={script} dispatch={dispatch} selected={selected} onSelect={onSelect} />;
  if (layout === "page") return <ConceptPage view={view} script={script} dispatch={dispatch} selected={selected} onSelect={onSelect} />;
  return <GraphFirst view={view} script={script} dispatch={dispatch} selected={selected} onSelect={onSelect} />;
}

export function Productions({ view }: { readonly view: ProductionsView }) {
  const [layout, setLayout] = useState<Layout>("board");
  const [fixture, setFixture] = useState<FixtureState>("story");
  const [script, dispatch] = useReducer(scriptReducer, initialScript);
  const [selectedId, setSelectedId] = useState<string | undefined>(view.entries.find((e) => e.production.stage === "casting")?.production.id ?? view.entries[0]?.production.id);
  const selected = view.entries.find((e) => e.production.id === selectedId);

  const shown: ProductionsView = fixture === "empty" ? { entries: [], ventures: view.ventures } : view;
  return (
    <div className={s.page}>
      <div className={s.top}>
        <Seg label="layout" options={LAYOUTS} value={layout} onChange={setLayout} />
        <div className={s.row}>
          <span className={s.note}>scripted, no backend</span>
          <Select label="fixture state" options={FIXTURE_STATES} value={fixture} onChange={setFixture} />
        </div>
      </div>
      {script.refusal !== undefined && <div className={s.state}><ErrorLine message={script.refusal} live /></div>}
      {fixture === "refused" && (
        <div className={s.state} data-state="refused">
          {REFUSED_SENTENCES.map((m) => (
            <ErrorLine key={m} message={m} />
          ))}
        </div>
      )}
      {fixture === "loading" && <Loading layout={layout} />}
      {fixture === "failed" && <div className={s.state} data-state="failed"><ErrorLine message="productions: the store could not be read (scripted failure)" live /></div>}
      {fixture === "empty" && <div className={s.state} data-state="empty"><Empty label="no kept concept to start" /></div>}
      {(fixture === "story" || fixture === "refused") && <Body layout={layout} view={shown} script={script} dispatch={dispatch} selected={selected} onSelect={setSelectedId} />}
    </div>
  );
}
