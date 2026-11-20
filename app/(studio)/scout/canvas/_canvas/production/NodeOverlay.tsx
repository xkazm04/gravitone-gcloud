"use client";

// A PRODUCTION NODE IN THE OVERLAY (spark character-cores S1.5 WP7) - what a click on the timeline street opens, one
// shape for every node and the station's own parts in it:
//   a keyframe  the still large (fit to the viewport), the eye's three axes and its reason, "from" (the cast, the look,
//               the plate - each a step of the overlay to that node), the takes made from it, the prompt verbatim;
//   a take      the take played against the track from its `at` (ClipOverlay.tsx), its start keyframe first in
//               "from", and the verdict with the direction - the per-take review;
//   a plate     the plate large and the keyframes drawn on it;
//   the look    its prompt and its plates; the cut plays like a take, without a verdict.
// ← → walk the node's own run in the order it plays (model.ts runOf); a "from" or "used by" tile moves the overlay to
// that node, so a keyframe's plate and the plate's other keyframes are two clicks apart and the street never grows.

import { useId } from "react";

import { DRIFT_AXES, type Production, type ProductionNode } from "@gt/domain/productionGraph";

import type { CanvasStore } from "../store.ts";
import { Chip, cx } from "../ui/kit.tsx";
import { ClipPlayer, ClipVerdict } from "./ClipOverlay.tsx";
import { caption, clock, NODE_STATE, posterOf, STATION_NAME, stepRun, usedBy } from "./model.ts";
import { Overlay } from "./Overlay.tsx";
import { Tile } from "./Tile.tsx";
import o from "./overlay.module.css";

type Props = {
  readonly st: CanvasStore;
  readonly p: Production;
  readonly n: ProductionNode;
  readonly onGo: (id: string) => void;
  readonly onClose: () => void;
};

const span = (n: ProductionNode): string => (n.at === undefined ? "" : n.dur === undefined ? clock(n.at) : `${clock(n.at)}–${clock(n.at + n.dur)}`);

/** A row of nodes as small tiles, each a step of the overlay to it. */
function Nodes({ k, nodes, p, onGo }: { readonly k: string; readonly nodes: readonly ProductionNode[]; readonly p: Production; readonly onGo: (id: string) => void }) {
  if (nodes.length === 0) return null;
  return (
    <>
      <span className={o.k}>{k}</span>
      <div className={o.nodes} role="group" aria-label={`${k}, ${nodes.length}`} data-role={`overlay-${k.replace(/\s+/g, "-")}`}>
        {nodes.map((m) => (
          <Tile key={m.id} n={m} caption={m.media === undefined ? "" : m.station === "cast" ? p.cast.name : `${caption(m)}${m.at === undefined ? "" : ` ${clock(m.at)}`}`} poster={posterOf(p, m)} compact onPick={() => onGo(m.id)} />
        ))}
      </div>
    </>
  );
}

function Picture({ p, n }: { readonly p: Production; readonly n: ProductionNode }) {
  if (n.media?.kind === "video") return <ClipPlayer key={n.id} p={p} n={n} />;
  if (n.media?.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- the node's own bytes, by the production's file door
    return <img className={o.still} src={n.media.src} alt={`${n.label}${n.at === undefined ? "" : `, ${clock(n.at)}`}`} decoding="async" />;
  }
  return <span className={o.none}>{n.label}</span>;
}

export function NodeOverlay({ st, p, n, onGo, onClose }: Props) {
  const head = useId();
  const by = new Map(p.nodes.map((m) => [m.id, m]));
  const from = n.madeFrom.map((id) => by.get(id)).filter((m): m is ProductionNode => m !== undefined);
  const users = usedBy(p, n);
  const prev = stepRun(p, n, -1);
  const next = stepRun(p, n, 1);
  const stepping = prev.id !== n.id;
  const state = NODE_STATE[n.state];
  const at = span(n);
  return (
    <Overlay
      headId={head}
      title={
        <>
          <span className={o.station}>{STATION_NAME[n.station]}</span> {n.label}
        </>
      }
      facts={
        <span className={o.facts}>
          {at !== "" && <span>{at}</span>}
          <span>{n.id}</span>
          <Chip tone={state.tone}>{state.word}</Chip>
        </span>
      }
      {...(stepping ? { prevName: prev.label, nextName: next.label, onStep: (s: 1 | -1) => onGo((s === 1 ? next : prev).id) } : {})}
      onClose={onClose}
      role={n.station === "clip" || n.station === "cut" ? "clip-overlay" : n.station === "look" ? "plate-overlay" : "node-overlay"}
    >
      <div className={cx(o.body, n.media === undefined && o.wordsOnly)} data-node={n.id}>
        {n.media !== undefined && n.media.kind !== "audio" && (
          <div className={o.media}>
            <Picture p={p} n={n} />
          </div>
        )}
        <div className={o.aside}>
          {n.station === "clip" && <ClipVerdict st={st} p={p} n={n} />}
          <div className={o.facts2}>
            {n.drift !== undefined && (
              <>
                <span className={o.k}>{n.drift.by}</span>
                <span className={o.drift}>
                  <span className={o.axes}>
                    {DRIFT_AXES.map((a) => (
                      <Chip key={a} tone={n.drift?.[a] === "drifts" ? "violet" : "faint"}>
                        {a} {n.drift?.[a]}
                      </Chip>
                    ))}
                  </span>
                  <span className={o.reason}>{n.drift.reason}</span>
                </span>
              </>
            )}
            <Nodes k="from" nodes={from} p={p} onGo={onGo} />
            <Nodes k={n.id === "look" ? "plates" : "used by"} nodes={users} p={p} onGo={onGo} />
            {n.prompt !== undefined && (
              <>
                <span className={o.k}>prompt</span>
                <q className={o.prompt}>{n.prompt}</q>
              </>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  );
}
