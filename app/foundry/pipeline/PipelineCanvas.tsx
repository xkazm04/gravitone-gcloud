"use client";

// THE PIPELINE CANVAS — a board that survives hundreds of cards and treats a
// drop as a request.
//
// THIS FILE IS THE SURFACE. It mounts the viewport, the one element that carries
// the camera, the cards, the two axes and the overlays — and nothing else. The
// wiring is ./useBoardEngine.ts, and every piece argues for itself in its own
// file, which is where the four rungs the engine was built on now live:
//
//   1. THE CONTAINER OWNS THE CAMERA ....... ./useViewport.ts
//   2. CULL BY ARITHMETIC .................. ./useBoardCull.ts, ./cells.ts
//   3. WAVES ............................... ./useViewport.ts
//   4. A DROP IS A REQUEST ................. ./useBoardMoves.ts
//
//   the drag ............ ./useCardDrag.ts        the verbs ..... ./useBoardVerbs.ts
//   the delegated clicks  ./usePointerVerbs.ts    the keys ...... ./useBoardKeys.ts
//   what is chosen ...... ./useSelection.ts       the cards ..... ./useCards.tsx
//   the floating things   ./BoardOverlays.tsx     the outside ... ./useCanvasHandle.ts
//
// (Rung 0 was MEASURE. `skin.face` is called exactly once per render of one card,
// so counting its calls is counting card renders. The fixture harness that took
// rung 0's numbers is not shipped — a page.tsx under app/ is a live route and
// this repo has no routable dev surface — so it lives beside the exercise note.
// Whoever re-measures brings their own counter.)
//
// WHAT THE SHELL MOUNTS: `<PipelineCanvas source={...} />` and, optionally, a
// `skin`, `axisId`, `onOpen`, `onStatus`, `onWave`, `apiRef`. The canvas never
// fetches; `source.loadPipeline()` and `source.move()` are its only doors. See
// ./index.ts for the full surface and ./canvasTypes.ts for the prop types.

import { memo, useId, useMemo, useRef } from "react";

import { BoardOverlays } from "./BoardOverlays";
import type { PipelineCanvasProps } from "./canvasTypes";
import { CellLayer, LaneHeads, StageHeads, createHeadRegistry, type DragPreview } from "./Frame";
import { Callout, Ghost, type GhostKind, type GhostPhase } from "./Ghost";
import { FRAME } from "./geometry";
import type { PipelineSkin } from "./types";
import { useBoardEngine } from "./useBoardEngine";
import { HOME } from "./useViewport";
import { domIdOf, useCards } from "./useCards";

export type { PipelineCanvasProps };

const DEFAULT_SKIN: PipelineSkin = {};

/** The canvas re-renders when its DATA props change, not when its parent hands
 *  it a fresh callback. A shell that keeps `onStatus`'s answer in state re-renders
 *  on every status change, and without this each of those re-rendered the canvas
 *  a second time (measured: two commits per cull step instead of one). The
 *  callbacks are read through refs and effect events, so a stale closure is not a
 *  risk. */
export const PipelineCanvas = memo(PipelineCanvasImpl, (a, b) =>
  a.source === b.source && a.axisId === b.axisId && a.skin === b.skin && a.pollMs === b.pollMs && a.choreoCap === b.choreoCap && a.className === b.className && !!a.onOpen === !!b.onOpen,
);

function PipelineCanvasImpl(props: PipelineCanvasProps) {
  const { source, skin = DEFAULT_SKIN, className = "" } = props;
  const uid = useId().replace(/[^A-Za-z0-9]/g, "");
  // THE SURFACE'S OWN: the two elements it renders and the registry that moves
  // the heads with the camera. They are lent to the engine rather than owned by
  // it, because a ref belongs to whoever puts it on a tag.
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const heads = useMemo(() => createHeadRegistry(HOME), []);
  const engine = useBoardEngine({ ...props, skin, uid, viewportRef, worldRef, heads });
  const { layout, names, calm, cull, sel, moves, drag, verbs, pointer, keys } = engine;

  // The skin's world layer: behind the cards, inside the world transform, and
  // rebuilt ONLY when the layout changes. Not on a pan (the container owns the
  // transform), not on a selection, not on a drag.
  const world = useMemo(() => skin.world?.(layout) ?? null, [skin, layout]);
  const d = drag.drag;
  const preview = useMemo<DragPreview | null>(() => (d ? { verdictFor: d.verdicts.verdictFor, over: d.over } : null), [d]);
  const ghostSrc = d ? { ids: d.ids, lead: d.lead, phase: "carry" as GhostPhase, kind: (d.fresh ? "carry" : d.over && d.verdict ? d.verdict.kind : "none") as GhostKind } : moves.flight;
  const ghostEntry = ghostSrc ? layout.entryOf.get(ghostSrc.lead) : undefined;
  const slot = sel.active ? layout.slotOf.get(sel.active) : null;
  const cards = useCards({
    mounted: cull.mounted,
    layout,
    selected: sel.selected,
    active: sel.active,
    away: cull.away,
    pending: moves.pending,
    flagged: cull.flagged,
    glide: cull.choreo.on,
    enters: cull.enters,
    posLabel: slot ? `${slot.row + 1} of ${layout.ids[slot.lane * layout.columns.length + slot.col].length}` : null,
    skin,
    uid,
  });
  const calloutTo = d?.over ? `to ${engine.colWord(layout, d.over.col)}${d.verdict?.kind === "ok" && d.verdict.laneOnly ? ` · ${layout.lanes[d.over.lane].label}` : ""}` : "";

  return (
    <div className={`relative h-full min-h-0 w-full ${className}`}>
      <div
        ref={viewportRef}
        role="application"
        aria-roledescription="pipeline canvas"
        aria-label={`${source.label} pipeline`}
        aria-activedescendant={sel.active && cull.mounted.some((p) => p.id === sel.active) ? domIdOf(uid, sel.active) : undefined}
        aria-busy={engine.loading || undefined}
        tabIndex={0}
        data-pipeline-viewport
        data-dragging={d ? "" : undefined}
        onPointerDown={pointer.onPointerDown}
        onClick={pointer.onClick}
        onDoubleClick={pointer.onDoubleClick}
        onContextMenu={pointer.onContextMenu}
        onKeyDown={keys.onKeyDown}
        onFocus={keys.onFocus}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden rounded-xl border border-white/8 bg-[var(--gt-ink)]/50 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 data-[dragging]:cursor-grabbing data-[mode=pan]:cursor-grabbing"
      >
        <div
          ref={worldRef}
          data-pipeline-world
          className="absolute top-0 left-0 origin-top-left will-change-transform"
          style={{ transform: `translate3d(${FRAME.left + FRAME.insetX}px, ${FRAME.top + FRAME.insetY}px, 0)` }}
        >
          <CellLayer layout={layout} from={cull.laneFrom} to={cull.laneTo} preview={preview} names={names} />
          {world}
          {cards}
          {ghostSrc && ghostEntry && (
            <Ghost
              x={calm ? moves.ghost.gx : moves.ghost.sx}
              y={calm ? moves.ghost.gy : moves.ghost.sy}
              entry={ghostEntry}
              count={ghostSrc.ids.length}
              kind={ghostSrc.kind}
              phase={ghostSrc.phase}
              skin={skin}
              calm={calm}
            />
          )}
        </div>
        <StageHeads layout={layout} reg={heads} names={names} calm={calm} />
        <LaneHeads layout={layout} from={cull.laneFrom} to={cull.laneTo} reg={heads} />
        {d && <Callout x={moves.ghost.cx} y={moves.ghost.cy} verdict={d.over ? d.verdict : null} to={calloutTo} />}
      </div>

      <BoardOverlays layout={layout} names={names} viewportRef={viewportRef} verbs={verbs} moves={moves} />
    </div>
  );
}
