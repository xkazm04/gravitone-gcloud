"use client";

// THE WIRING — every piece of the engine, created in the one order they can be
// created in, and handed to each other explicitly.
//
// THE ORDER IS LOAD-BEARING, and it is a chain of one-way dependencies, which is
// why there is no context and no event bus anywhere in this folder:
//
//   the refs ....... created here, named in the signature of each piece
//   the viewport ... owns the camera, the culling rectangle and the waves
//   the moves ...... need the viewport (a settled move reveals its card)
//   the verbs ...... need the moves (every verb ends in `decide`)
//   the drag ....... needs both (it asks once, then decides on the drop)
//   the culling .... needs the drag's ids (a dragged card is drawn by the ghost)
//
// WHY THE REFS ARE CREATED HERE, one by one, rather than bundled: the React
// Compiler lint (`react-hooks/immutability`) refuses a write to a ref reached
// through a value another hook returned, AND a write through an object that has
// already been passed to a hook. So a ref two pieces touch has to be created
// above both of them and passed in BY NAME. Both measured — a bag was the first
// shape tried, and it failed on `refs.mountedRef.current = …`.
//
// The cost is long signatures; the benefit is that each piece's parameter list
// IS its contract — `useBoardKeys` cannot touch the world element because it was
// never handed it. The refs the pieces do not share stay inside the piece that
// owns them: the culling rectangle in the viewport, the walk timer in the keys,
// the settled-move announcement in the moves.
//
// `liveRef` is what every delegated handler reads instead of its own closure, and
// its layout effect is registered BEFORE the viewport's on purpose: the
// viewport's ResizeObserver fires into `frame()`, which reads `liveRef.current`.

import { useLayoutEffect, useMemo, useRef } from "react";

import type { AnimationPlaybackControls } from "motion/react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { useAnnounce } from "@/lib/announcer";
import { CHOREO_MAX_CARDS } from "@/lib/board/pipeline";

import type { Live, PipelineCanvasProps } from "./canvasTypes";
import type { HeadRegistry } from "./Frame";
import { buildLayout, type Camera, type Layout } from "./geometry";
import { NO_NAMES } from "./tunables";
import { useAudition } from "./useAudition";
import { useBoardCull, type BoardCull } from "./useBoardCull";
import { useBoardKeys, type BoardKeys } from "./useBoardKeys";
import { useBoardMoves, type BoardMoves } from "./useBoardMoves";
import { useBoardVerbs, type BoardVerbs } from "./useBoardVerbs";
import { useCanvasHandle } from "./useCanvasHandle";
import { useCardDrag, type CardDrag } from "./useCardDrag";
import { usePipelineData } from "./usePipelineData";
import { usePointerVerbs, type PointerVerbs } from "./usePointerVerbs";
import { useSelection, type Selection } from "./useSelection";
import { HOME, useViewport } from "./useViewport";

export interface BoardEngine {
  layout: Layout;
  names: Partial<Record<string, string>>;
  /** Reduced motion: no glide, no stagger, no spring — every animation jumps. */
  calm: boolean;
  loading: boolean;
  sel: Selection;
  moves: BoardMoves;
  verbs: BoardVerbs;
  drag: CardDrag;
  pointer: PointerVerbs;
  keys: BoardKeys;
  cull: BoardCull;
  colWord(L: Layout, col: number): string;
}

/** The two DOM refs and the head registry are the SURFACE's, not the engine's:
 *  they belong to the elements PipelineCanvas renders, so they are created there
 *  and lent down. Everything else the board holds is created here. */
export interface EngineHost {
  uid: string;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  worldRef: React.RefObject<HTMLDivElement | null>;
  heads: HeadRegistry;
  skin: NonNullable<PipelineCanvasProps["skin"]>;
}

export function useBoardEngine(props: PipelineCanvasProps & EngineHost): BoardEngine {
  const { source, axisId, arm = "stub", skin, pollMs = 0, onOpen, onStatus, onWave, choreoCap = CHOREO_MAX_CARDS, apiRef } = props;
  const { uid, viewportRef, worldRef, heads } = props;
  const announce = useAnnounce();
  const calm = usePrefersReducedMotion();
  const data = usePipelineData(source, pollMs);
  const axis = source.groupAxes.find((a) => a.id === axisId) ?? source.groupAxes[0];
  const layout = useMemo(() => buildLayout(data.entries, source, axis), [data.entries, source, axis]);
  const names = skin.stageLabel ?? NO_NAMES;

  /* ── the board's own state ──────────────────────────────────────────── */

  const camRef = useRef<Camera>(HOME);
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  const camAnimRef = useRef<AnimationPlaybackControls | null>(null);
  /** True from the unmount cleanup onward: every awaited continuation tests it
   *  before touching state, because a move outlives the board that asked. */
  const deadRef = useRef(false);
  /** What the culling produced this render, and how much of it is new — what a
   *  wave needs to know and cannot derive. */
  const mountedRef = useRef<readonly { id: string }[]>([]);
  const freshRef = useRef(0);
  /** Where a POINTER last touched. Not state: a click that moved the keyboard
   *  cursor would re-render the card the cursor left, for a ring nobody asked to
   *  see. The first key press adopts it. */
  const cursorRef = useRef<string | null>(null);
  /** Focus arrived from a pointer rather than a Tab — what suppresses the ring. */
  const pointerFocusRef = useRef(false);
  /** A drop is being swallowed: the click after a drag is not a selection. */
  const swallowRef = useRef(false);
  const liveRef = useRef<Live | null>(null);

  /* ── the one live region, and the one word for a column ─────────────── */

  const sayNRef = useRef(0);
  const say = (text: string) => announce({ key: `${uid}:${++sayNRef.current}`, text });
  const colWord = (L: Layout, col: number) => {
    const c = L.columns[col];
    return `${names[c.stage] ?? c.stage}${c.band ? ` · ${c.label}` : ""}`;
  };

  /* ── the pieces ─────────────────────────────────────────────────────── */

  useLayoutEffect(() => {
    liveRef.current = { layout, source, apply: data.apply, onOpen, onWave };
  });

  const sel = useSelection(cursorRef);
  const viewport = useViewport({ viewportRef, worldRef, camRef, sizeRef, camAnimRef, deadRef, mountedRef, freshRef, liveRef, heads, layout, loading: data.loading, calm });
  const moves = useBoardMoves({ viewportRef, deadRef, liveRef, viewport, layout, arm, calm, say, colWord });
  const verbs = useBoardVerbs({ viewportRef, camRef, liveRef, moves, sel, layout, source, hasOpen: !!onOpen, say, colWord });
  const playFromCard = useAudition();
  const drag = useCardDrag({ viewportRef, camRef, camAnimRef, cursorRef, pointerFocusRef, swallowRef, liveRef, viewport, moves, verbs, sel, say });
  const pointer = usePointerVerbs({ liveRef, swallowRef, layout, sel, drag, verbs, playFromCard });
  const keys = useBoardKeys({ camRef, sizeRef, cursorRef, pointerFocusRef, liveRef, viewport, moves, verbs, sel, layout, hasOpen: !!onOpen, say, colWord });
  const cull = useBoardCull({
    layout,
    view: viewport.view,
    wave: viewport.wave,
    active: sel.active,
    reduced: calm,
    choreoCap,
    dragIds: drag.drag ? drag.drag.ids : null,
    flight: moves.flight,
    prompt: moves.prompt,
    notice: moves.notice,
  });

  // What the culling produced, published for the waves.
  useLayoutEffect(() => {
    mountedRef.current = cull.mounted;
    freshRef.current = cull.fresh;
  });

  useCanvasHandle({ data, layout, viewport, selected: sel.selected, mountedCount: cull.mounted.length, choreo: cull.choreo, onStatus, apiRef });

  return { layout, names, calm, loading: data.loading, sel, moves, verbs, drag, pointer, keys, cull, colWord };
}
