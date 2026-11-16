"use client";

// /scout/productions (spark concept-casting-stages S1): the operator's pick, graph-first. The graph on the left reads
// the production record through the port (idea, board, take, stage); the wide inspector on the right is where a concept
// is started, its hero frames are chosen, a take is launched and watched, takes are compared, one is marked proven, a
// concept is dropped. Every stage is real.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GRAPH_STAGES, type GraphEdge, type GraphNode } from "@gt/domain/scoutGraph";
import type { ProductionStage } from "@gt/domain/production.machine";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { StageGraph } from "@gt/ui/components/graph/StageGraph.tsx";
import { nodeBox } from "@gt/ui/components/graph/stageGraph.ts";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";

import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { KeptConcept, ProductionEntry, ProductionsPort, ProductionsView } from "../_port/contract.ts";
import s from "./productions.module.css";
import { STAGE_PILL } from "./Sections.tsx";
import { ConceptInspector, ProductionInspector } from "./Takes.tsx";

const conceptId = (e: ProductionEntry): string => e.production.id;
const keptId = (c: KeptConcept): string => `kept:${c.source.kind}:${c.source.ref}`;

const STAGE_STATE: Readonly<Record<ProductionStage, GraphNode["state"]>> = {
  accepted: "open",
  hero: "pending",
  rough: "pending",
  proven: "kept",
  casting: "pending",
  audio: "pending",
  cutting: "pending",
  done: "kept",
  dropped: "rejected",
};

function graphOf(view: ProductionsView): { readonly nodes: GraphNode[]; readonly edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const c of view.kept) {
    const id = keptId(c);
    const packet = `pkt:scout:${id}`;
    nodes.push({ id: `${id}#concept`, stage: "idea", kind: "idea", label: c.title, state: "open", at: "kept", packet });
    nodes.push({ id: `${id}#board`, stage: "board", kind: "storyboard", label: "board: kept, not started", state: "kept", at: "kept", packet });
    edges.push({ from: `${id}#concept`, to: `${id}#board` });
  }
  for (const e of view.entries) {
    const id = e.production.id;
    const packet = `pkt:scout:${id}`;
    const at = e.production.startedAt.slice(0, 10);
    nodes.push({ id: `${id}#concept`, stage: "idea", kind: "idea", label: e.production.title, state: "kept", at, packet });
    nodes.push({ id: `${id}#board`, stage: "board", kind: "storyboard", label: `board: ${e.logline}`, state: "kept", at, packet });
    edges.push({ from: `${id}#concept`, to: `${id}#board` });
    let prior = `${id}#board`;
    for (const t of e.production.takes) {
      const takeId = `${id}#${t.id}`;
      nodes.push({ id: takeId, stage: "run", kind: "reel", label: `${t.id}: ${t.kind === "hero" ? "hero" : "rough cut"} (${t.beats.join(", ")})`, state: t.state === "failed" ? "failed" : t.state === "rendering" ? "pending" : t.provenAt !== undefined ? "kept" : "open", at: t.at.slice(0, 10), packet });
      edges.push({ from: `${id}#board`, to: takeId });
      prior = takeId;
    }
    nodes.push({ id: `${id}#stage`, stage: "output", kind: "piece", label: `stage: ${STAGE_PILL[e.production.stage].label}`, state: STAGE_STATE[e.production.stage], at, packet });
    edges.push({ from: prior, to: `${id}#stage` });
  }
  return { nodes, edges };
}

/** `from`: a ref the Scout graph's Start link carries (a candidate, an episode, a board, an outline). */
function initialSelection(view: ProductionsView, from: string | undefined): string | undefined {
  if (from !== undefined) {
    const entry = view.entries.find((e) => e.production.source.ref === from || e.production.id === from);
    if (entry !== undefined) return conceptId(entry);
    const kept = view.kept.find((c) => c.matches.includes(from));
    if (kept !== undefined) return keptId(kept);
  }
  const first = view.entries[0];
  if (first !== undefined) return conceptId(first);
  const kept = view.kept[0];
  return kept === undefined ? undefined : keptId(kept);
}

const POLL_MS = 4000;

export function Productions({ view: initial, port, from }: { readonly view: ProductionsView; readonly port: ProductionsPort; readonly from?: string }) {
  const [view, setView] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => initialSelection(initial, from));
  const [notice, setNotice] = useState<string | undefined>(from !== undefined && initialSelection(initial, from) === undefined ? `nothing kept to start for ${from}` : undefined);
  const pane = useRef<HTMLDivElement>(null);
  const missed = from !== undefined && notice !== undefined;

  // The first column worth reading is the idea: seed and derived are empty on this screen.
  useEffect(() => {
    const graph = pane.current?.querySelector("[data-component=StageGraph]");
    if (graph !== null && graph !== undefined) graph.scrollLeft = nodeBox(GRAPH_STAGES.indexOf("idea"), 0).x;
  }, []);

  // Watching a take: while any is rendering, re-read the view until it lands.
  const active = (j?: { readonly state: string }): boolean => j?.state === "queued" || j?.state === "running";
  const casting = view.entries.some((e) => Object.values(e.castJobs).some(active) || e.rounds.some((r) => active(r.drawJob) || active(r.voiceJob) || active(r.createJob)));
  const cutting = view.entries.some((e) => e.production.cut?.state === "assembling");
  const rendering = view.entries.some((e) => e.production.takes.some((t) => t.state === "rendering")) || casting || cutting;
  useEffect(() => {
    if (!rendering) return;
    const t = window.setInterval(() => {
      void port.refresh().then((r) => {
        if (r.ok) setView(r.value);
      });
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [rendering, port]);

  const { nodes, edges } = useMemo(() => graphOf(view), [view]);
  const selected = view.entries.find((e) => conceptId(e) === selectedId);
  const keptConcept = view.kept.find((c) => keptId(c) === selectedId);
  const selectedNode = selectedId === undefined ? null : `${selectedId}#concept`;

  const act = useCallback(async (run: () => Promise<ActionResult<ProductionsView>>): Promise<string | undefined> => {
    const r = await run();
    if (!r.ok) return r.error.error;
    setView(r.value);
    return undefined;
  }, []);
  const onLaunchedView = useCallback((v: ProductionsView) => setView(v), []);
  const onStarted = useCallback((id: string) => setSelectedId(id), []);

  if (view.entries.length === 0 && view.kept.length === 0) {
    return (
      <div className={s.state} data-state="empty">
        {notice !== undefined && <ErrorLine message={notice} />}
        <Empty label="no kept concept to start" />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.top}>
        <div className={s.row}>
          <Chip label="kept" value={view.kept.length} casing="lower" name={`${view.kept.length} kept concepts not started`} />
          <Chip label="started" value={view.entries.length} casing="lower" name={`${view.entries.length} productions`} />
          {rendering && <EntryPill entry={{ look: "running", label: "rendering" }} />}
        </div>
        <span className={s.note}>a stage reads the production record; nothing starts itself</span>
      </div>
      {missed && (
        <div className={s.state} data-state="refused">
          <ErrorLine message={notice ?? ""} />
        </div>
      )}
      <div className={s.graphLayout}>
        <div className={s.scroll} ref={pane}>
          <StageGraph name="concepts" nodes={nodes} edges={edges} view="all" selected={selectedNode} onSelect={(id) => setSelectedId(id.split("#")[0] ?? id)} />
        </div>
        <div className={s.inspector}>
          {selected !== undefined ? (
            <ProductionInspector key={selected.production.id} entry={selected} view={view} port={port} act={act} onView={onLaunchedView} />
          ) : keptConcept !== undefined ? (
            <ConceptInspector key={keptId(keptConcept)} concept={keptConcept} port={port} act={act} onStarted={(id) => { onStarted(id); setNotice(undefined); }} />
          ) : (
            <Empty label="pick a concept to work on it" />
          )}
        </div>
      </div>
    </div>
  );
}
