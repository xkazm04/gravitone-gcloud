"use client";

// THE PIPELINE CANVAS — a board that survives hundreds of cards and treats a
// drop as a request.
//
// WHAT THE SHELL MOUNTS: `<PipelineCanvas source={...} />` and, optionally, a
// `skin`, `axisId`, `onOpen`, `onStatus`, `onWave`, `apiRef`. The canvas never
// fetches; `source.loadPipeline()` and `source.move()` are its only doors. See
// index.ts for the full surface and its prop types.
//
// THE FOUR RUNGS, in the order they were built:
//   0. MEASURE. `skin.face` is called exactly once per render of one card, so
//      counting its calls is counting card renders. There is no instrument in
//      the tree: the fixture harness that took rung 0's numbers is NOT shipped
//      (a page.tsx under app/ is a live route and this repo has no routable dev
//      surface), so it lives beside the exercise note with instructions to copy
//      it back. Whoever re-measures brings their own counter.
//   1. THE CONTAINER OWNS THE CAMERA. One `world` element carries
//      `translate3d(...) scale(k)`, written to the DOM directly (`setCam`); no
//      card receives it, no React state holds it. A pan step re-renders nothing.
//   2. CULL BY ARITHMETIC. Cards are a fixed size at a fixed pitch, so the
//      visible cards are a row range per cell (geometry.ts `cullRect`). The
//      culling rectangle is quantized to the card pitch and rides in state, so
//      a pan that crosses no grid line produces an equal rectangle and React
//      bails out. COLD START: `view` is null until the viewport has been
//      measured AND the data has loaded, and null culls to nothing.
//   3. WAVES. When a framing legitimately shows many cards they mount nearest-
//      the-centre first, each slice sized by how long the last frame took.
//
// A DROP IS A REQUEST. The preview is built from `admits()`, asked once at drag
// start; the move is submitted with `source.move()` and awaited; the ghost
// lands on the answer, never on the pointer-up. A refusal returns the card with
// the authority's own words beside it.

import { memo, useEffect, useEffectEvent, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

import { animate, useMotionValue, useSpring, type AnimationPlaybackControls } from "motion/react";
import { X } from "lucide-react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { EASE } from "@/components/ui/tokens";
import { useAnnounce } from "@/lib/announcer";
import { overlayOpen } from "@/lib/board/keys";
import {
  CHOREO_MAX_CARDS,
  type MoveNeed,
  type MoveResult,
  type PipelineEntry,
  type PipelineItem,
  type PipelineSource, isStubbedMove, } from "@/lib/board/pipeline";

import { Card } from "./Card";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { CellLayer, createHeadRegistry, LaneHeads, StageHeads, type DragPreview } from "./Frame";
import { Callout, Ghost, type GhostKind, type GhostPhase } from "./Ghost";
import MoveMap from "./MoveMap";
import MovePrompt, { type PromptAnswer, type PromptOutcome } from "./MovePrompt";
import { pressDrag } from "./dragMode";
import {
  CARD_H,
  CARD_W,
  FRAME,
  PITCH,
  buildLayout,
  cardPos,
  countRect,
  cullRect,
  fitCamera,
  frameCamera,
  laneRange,
  nearestTo,
  overlap,
  quantize,
  resolveCell,
  revealCamera,
  sameRect,
  stepCell,
  tailPos,
  toScreen,
  toWorld,
  viewRect,
  walk,
  zoomAt,
  type Camera,
  type Dir,
  type Layout,
  type Rect,
} from "./geometry";
import { startGesture, type Exit } from "./gesture";
import { pipelineKeyAction } from "./keymap";
import { buildVerdicts, requestFor, type Verdicts } from "./moves";
import type { CanvasStatus, ChoreoState, PipelineHandle, PipelineSkin, Verdict, WaveSample } from "./types";
import { usePipelineData } from "./usePipelineData";

/* ── tunables, each with the reason it is that number ──────────────────── */

/** Screen px of cards mounted beyond the viewport on every side. One pitch is
 *  the minimum for a card to be in the DOM before it is on screen; this is a
 *  few, so a flick of the wheel does not outrun the mount. It must stay larger
 *  than QUANT_PX, which eats into it. */
const OVERSCAN_PX = 320;
/** The culling rectangle snaps outward to a grid of about this many SCREEN px
 *  (a whole number of card pitches in world units): a pan step shorter than the
 *  grid usually crosses no line and re-renders nothing at all. Snapping to one
 *  pitch in WORLD units — the first version — crossed a line on every wheel
 *  step once the board was zoomed out, because a pitch is nine screen pixels at
 *  a tenth of the zoom. */
const QUANT_PX = 96;
const quantum = (k: number): number => Math.max(PITCH, Math.round(QUANT_PX / k / PITCH) * PITCH);
const WAVE_FIRST = 24;
const WAVE_MIN = 8;
const WAVE_MAX = 160;
/** One frame and a little: a slice that fits runs the next one bigger. */
const WAVE_BUDGET_MS = 20;
/** A view that overlaps the last by less than this, or whose zoom moved by more
 *  than e^JUMP_LN, is a JUMP (a fit, a big zoom): its new cards mount in waves.
 *  A pan or a wheel-zoom step overlaps almost entirely and mounts at once. */
const JUMP_OVERLAP = 0.4;
const JUMP_LN = 0.3;
const NODRAG =
  "[data-nodrag],button,a,input,textarea,select,summary,[contenteditable],[role=slider],[role=menuitem],[role=textbox]";
const EDGE_PX = 70;
const EDGE_SPEED = 18;
const EASE4 = [...EASE] as [number, number, number, number];
const NONE: ReadonlySet<string> = new Set();
const NO_NAMES: Partial<Record<string, string>> = {};

export interface PipelineCanvasProps {
  source: PipelineSource;
  /** Which of `source.groupAxes` draws the Y axis. Default: the first. */
  axisId?: string;
  /**
   * WHETHER A MOVE IS ALLOWED TO SPEND MONEY. Default `"stub"`, and the default
   * is the whole point: a dispatch costs the operator's own Claude seat at
   * $47-92 and 26-32 turns, so the arm fails to the side that spends nothing.
   *
   * A confirm dialog answers `{ live: true }` meaning "the operator pressed
   * yes"; that is INTENT, and it is not authority. This prop is the authority,
   * and it is clamped over every request in `submitMoves` - the one chokepoint
   * every path reaches (a drag, the context menu, the move map, the keyboard).
   * Before it existed a dragged confirm set `live: true` unconditionally and no
   * prop could disarm it, so a shell showing STUB could still have spent the
   * seat. Found by WP4a, which could only work around it from outside.
   */
  arm?: "stub" | "live";
  skin?: PipelineSkin;
  /** Re-load every this many ms. 0 = only on mount and on `apiRef.reload()`. */
  pollMs?: number;
  /** The Open verb: Enter, double-click, the menu. */
  onOpen?: (entry: PipelineEntry) => void;
  /** Counts, selection and whether the board is choreographing. */
  onStatus?: (s: CanvasStatus) => void;
  /** One call per mounting wave — the per-frame slice sizes. */
  onWave?: (w: WaveSample) => void;
  /** Visible cards above which the entrance stagger and layout glide switch
   *  off. Defaults to CHOREO_MAX_CARDS; the knob exists so the cap can be moved
   *  by a measurement (and so a measurement can move it). */
  choreoCap?: number;
  apiRef?: React.Ref<PipelineHandle>;
  className?: string;
}

interface DragState {
  ids: string[];
  lead: string;
  verdicts: Verdicts;
  over: { lane: number; col: number } | null;
  verdict: Verdict | null;
  /** The pointer has not yet resolved to anything. */
  fresh: boolean;
}

interface Flight {
  ids: string[];
  lead: string;
  phase: GhostPhase;
  kind: GhostKind;
}

interface PromptState {
  ids: string[];
  laneKey: string;
  col: number;
  need: MoveNeed;
  prompt: string;
  cost?: Extract<Verdict, { kind: "needs" }>["cost"];
  title: string;
  verb: string;
  flight: boolean;
}

interface Notice {
  ids: string[];
  text: string;
  retry?: () => void;
}

/** `stubbed` counts the moves the authority answered but did not act on, so a
 *  caller can tell "it moved" from "it would have". */
type Outcome = { ok: true; stubbed: number } | { ok: false; reason: string; retryable: boolean; failed: string[] };

interface Live {
  layout: Layout;
  source: PipelineSource;
  selected: ReadonlySet<string>;
  active: string | null;
  notice: Notice | null;
  apply(item: PipelineItem): void;
  names: Partial<Record<string, string>>;
  calm: boolean;
  onOpen?: (entry: PipelineEntry) => void;
  onWave?: (w: WaveSample) => void;
}

const DEFAULT_SKIN: PipelineSkin = {};

const domIdOf = (uid: string, id: string) => `${uid}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** The canvas re-renders when its DATA props change, not when its parent hands
 *  it a fresh callback. A shell that keeps `onStatus`'s answer in state re-renders
 *  on every status change, and without this each of those re-rendered the canvas
 *  a second time (measured: two commits per cull step instead of one). The
 *  callbacks are read through refs and effect events, so a stale closure is not a
 *  risk. */
export const PipelineCanvas = memo(PipelineCanvasImpl, (a, b) =>
  a.source === b.source && a.axisId === b.axisId && a.skin === b.skin && a.pollMs === b.pollMs && a.choreoCap === b.choreoCap && a.className === b.className && !!a.onOpen === !!b.onOpen,
);

function PipelineCanvasImpl({ source, axisId, arm = "stub", skin = DEFAULT_SKIN, pollMs = 0, onOpen, onStatus, onWave, choreoCap = CHOREO_MAX_CARDS, apiRef, className = "" }: PipelineCanvasProps) {
  const uid = useId().replace(/[^A-Za-z0-9]/g, "");
  const announce = useAnnounce();
  const reduced = usePrefersReducedMotion();
  const data = usePipelineData(source, pollMs);
  const axis = source.groupAxes.find((a) => a.id === axisId) ?? source.groupAxes[0];
  const layout = useMemo(() => buildLayout(data.entries, source, axis), [data.entries, source, axis]);
  const names = skin.stageLabel ?? NO_NAMES;

  /* ── refs: the camera and everything an event handler needs ─────────── */

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<Camera>({ x: FRAME.left + FRAME.inset, y: FRAME.top + FRAME.inset, k: 1 });
  const sizeRef = useRef<{ w: number; h: number } | null>(null);
  const viewRef = useRef<{ rect: Rect; m: number; k: number } | null>(null);
  const mountedRef = useRef<readonly { id: string }[]>([]);
  const framedRef = useRef(false);
  const wavingRef = useRef(false);
  const freshRef = useRef(0);
  const deadRef = useRef(false);
  const viewRaf = useRef(0);
  const camAnim = useRef<AnimationPlaybackControls | null>(null);
  const swallow = useRef(false);
  const sayN = useRef(0);
  const walkSay = useRef(0);
  const pendingSay = useRef<{ id: string; verb: string; dry?: boolean } | null>(null);
  const live = useRef<Live | null>(null);
  // Where a POINTER last touched. It is not state: a click that moved the
  // keyboard cursor would re-render the card the cursor left, and a selection
  // change is meant to re-render the cards entering and leaving the selection
  // and nothing else. The first key press adopts it as the cursor.
  const cursor = useRef<string | null>(null);
  const pointerFocus = useRef(false);
  const heads = useMemo(() => createHeadRegistry({ x: FRAME.left + FRAME.inset, y: FRAME.top + FRAME.inset, k: 1 }), []);

  /* ── state ──────────────────────────────────────────────────────────── */

  const [view, setView] = useState<{ rect: Rect; m: number } | null>(null);
  const [wave, setWave] = useState<{ keep: ReadonlySet<string>; from: number; to: number } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NONE);
  const [active, setActive] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [map, setMap] = useState<{ x: number; y: number; id: string; verdicts: Verdicts } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(NONE);

  // The ghost: raw targets (`gx`, `gy`) and the springs that follow them. The
  // callout (`cx`, `cy`) is in screen space and follows the pointer directly.
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const sx = useSpring(gx, { stiffness: 520, damping: 42, mass: 0.7 });
  const sy = useSpring(gy, { stiffness: 520, damping: 42, mass: 0.7 });
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);

  /* ── derived: what is mounted ───────────────────────────────────────── */

  const visible = useMemo(() => (view ? countRect(layout, { x0: view.rect.x0 + view.m, y0: view.rect.y0 + view.m, x1: view.rect.x1 - view.m, y1: view.rect.y1 - view.m }) : 0), [layout, view]);
  const choreo = useMemo<ChoreoState>(
    () => ({ on: !reduced && visible <= choreoCap, reason: reduced ? "reduced-motion" : visible > choreoCap ? "cap" : null, visible, cap: choreoCap }),
    [reduced, visible, choreoCap],
  );
  const calm = reduced;

  const want = useMemo(() => (view ? cullRect(layout, view.rect) : []), [layout, view]);
  const { mounted, enters, fresh } = useMemo(() => {
    let list = want;
    let enters: Map<string, number> | null = null;
    let fresh = 0;
    if (view && wave) {
      // A wave limits how many NEW cards mount per frame, nearest the middle
      // first. What was already mounted stays: dropping it to re-mount it a
      // frame later is the flicker a naive limit would cause.
      const mx = (view.rect.x0 + view.rect.x1) / 2;
      const my = (view.rect.y0 + view.rect.y1) / 2;
      const ranked: { i: number; d: number }[] = [];
      want.forEach((p, i) => {
        if (!wave.keep.has(p.id)) ranked.push({ i, d: (p.x + CARD_W / 2 - mx) ** 2 + (p.y + CARD_H / 2 - my) ** 2 });
      });
      ranked.sort((a, b) => a.d - b.d);
      fresh = ranked.length;
      const chosen = new Set<number>();
      enters = new Map();
      for (let r = 0; r < Math.min(wave.to, ranked.length); r++) {
        const p = want[ranked[r].i];
        chosen.add(ranked[r].i);
        if (r >= wave.from) enters.set(p.id, p.col * 70 + ((r - wave.from) % 10) * 16);
      }
      list = want.filter((p, i) => wave.keep.has(p.id) || chosen.has(i));
    }
    // The keyboard cursor is always in the DOM, so aria-activedescendant can
    // name it wherever the camera has wandered.
    if (active && !list.some((p) => p.id === active)) {
      const s = layout.slotOf.get(active);
      if (s) list = [...list, { id: active, lane: s.lane, col: s.col, row: s.row, x: layout.columns[s.col].x + 12, y: layout.lanes[s.lane].y + 12 + s.row * PITCH }];
    }
    return { mounted: list, enters: choreo.on ? enters : null, fresh };
  }, [want, wave, view, active, layout, choreo.on]);
  const [laneFrom, laneTo] = useMemo(() => (view ? laneRange(layout, view.rect) : [0, 0]), [layout, view]);

  const dragIds = drag ? drag.ids : null;
  const away = useMemo(() => {
    const s = new Set<string>();
    if (dragIds) dragIds.forEach((i) => s.add(i));
    if (flight && flight.phase !== "done") flight.ids.forEach((i) => s.add(i));
    if (prompt) prompt.ids.forEach((i) => s.add(i));
    return s;
  }, [dragIds, flight, prompt]);
  const flagged = useMemo(() => (notice ? new Set(notice.ids) : NONE), [notice]);

  /* ── the camera: DOM writes, no React ───────────────────────────────── */

  const syncView = () => {
    const s = sizeRef.current;
    const L = live.current;
    if (!s || !L || !framedRef.current) return;
    const cam = camRef.current;
    const q = quantize(viewRect(cam, s.w, s.h, OVERSCAN_PX), quantum(cam.k));
    const prev = viewRef.current;
    if (prev && sameRect(prev.rect, q)) return;
    const next = { rect: q, m: OVERSCAN_PX / cam.k, k: cam.k };
    viewRef.current = next;
    const now = countRect(L.layout, q);
    setView(next);
    if (wavingRef.current || now <= WAVE_FIRST) return;
    // First view, a fit, a big zoom: little or none of what is wanted is
    // mounted already. A pan or a wheel-zoom step is not that.
    const jump = !prev || Math.abs(Math.log(cam.k / prev.k)) > JUMP_LN || overlap(prev.rect, q) < JUMP_OVERLAP;
    if (jump) beginWaves(new Set(mountedRef.current.map((p) => p.id)));
  };

  const scheduleView = () => {
    if (viewRaf.current) return;
    viewRaf.current = requestAnimationFrame(() => {
      viewRaf.current = 0;
      syncView();
    });
  };

  const setCam = (c: Camera) => {
    const s = sizeRef.current;
    const L = live.current;
    let next = c;
    if (s && L) {
      // Some part of the board always stays in reach; "0" brings the rest back.
      const keep = 160;
      next = {
        k: c.k,
        x: Math.min(s.w - keep, Math.max(keep - L.layout.width * c.k, c.x)),
        y: Math.min(s.h - keep, Math.max(keep - L.layout.height * c.k, c.y)),
      };
    }
    camRef.current = next;
    const w = worldRef.current;
    if (w) w.style.transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.k})`;
    heads.apply(next);
    scheduleView();
  };

  const glideTo = (to: Camera) => {
    camAnim.current?.stop();
    if (calm) return setCam(to);
    const from = camRef.current;
    camAnim.current = animate(0, 1, {
      duration: 0.34,
      ease: EASE4,
      onUpdate: (t) => setCam({ k: from.k + (to.k - from.k) * t, x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }),
    });
  };

  const reveal = (id: string) => {
    const s = sizeRef.current;
    const L = live.current;
    if (!s || !L) return;
    const to = revealCamera(camRef.current, L.layout, id, s.w, s.h);
    if (to) glideTo(to);
  };

  const zoomBy = (factor: number) => {
    const s = sizeRef.current;
    if (!s) return;
    const c = camRef.current;
    glideTo(zoomAt(c, c.k * factor, FRAME.left + (s.w - FRAME.left) / 2, FRAME.top + (s.h - FRAME.top) / 2));
  };

  const fit = () => {
    const s = sizeRef.current;
    const L = live.current;
    if (s && L) glideTo(fitCamera(L.layout, s.w, s.h));
  };

  /* ── waves: a framing that shows many cards mounts them nearest-first ── */

  function beginWaves(keep: ReadonlySet<string>) {
    wavingRef.current = true;
    let slice = WAVE_FIRST;
    let shown = WAVE_FIRST;
    setWave({ keep, from: 0, to: shown });
    // Each step is timed frame to frame by the rAF timestamps themselves: the
    // slice that was just committed is on screen by the next frame, so the gap
    // between two callbacks is how long that slice took to cost.
    const next = (t0: number) => {
      requestAnimationFrame((now) => {
        if (deadRef.current) return;
        const ms = now - t0;
        const total = freshRef.current;
        live.current?.onWave?.({ slice, shown: Math.min(shown, total), of: total, ms });
        if (shown >= total) {
          wavingRef.current = false;
          setWave(null);
          return;
        }
        slice = Math.max(WAVE_MIN, Math.min(WAVE_MAX, Math.round(slice * Math.min(2, WAVE_BUDGET_MS / Math.max(ms, 1)))));
        const from = shown;
        shown += slice;
        setWave({ keep, from, to: shown });
        next(now);
      });
    };
    requestAnimationFrame((t) => next(t));
  }

  /* ── keep the handlers' view of the world current ───────────────────── */

  useLayoutEffect(() => {
    live.current = { layout, source, selected, active, notice, apply: data.apply, names, calm, onOpen, onWave };
  });
  useEffect(() => {
    freshRef.current = fresh;
    mountedRef.current = mounted;
  });
  useEffect(() => {
    deadRef.current = false;
    return () => {
      deadRef.current = true;
      cancelAnimationFrame(viewRaf.current);
      viewRaf.current = 0;
      camAnim.current?.stop();
      window.clearTimeout(walkSay.current);
    };
  }, []);

  function frame() {
    const s = sizeRef.current;
    const L = live.current;
    if (!s || !L || framedRef.current || data.loading || s.w === 0) return;
    framedRef.current = true;
    setCam(frameCamera(L.layout, s.w, s.h));
  }

  // Measure the viewport; a cold start mounts nothing until this has answered.
  const onResize = useEffectEvent(() => {
    const el = viewportRef.current;
    if (!el) return;
    sizeRef.current = { w: el.clientWidth, h: el.clientHeight };
    if (!framedRef.current) frame();
    else scheduleView();
  });
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => onResize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLoaded = useEffectEvent(() => frame());
  useEffect(() => {
    if (data.loading) return;
    const id = requestAnimationFrame(() => onLoaded());
    return () => cancelAnimationFrame(id);
  }, [data.loading]);

  // A relayout (a poll, a move) re-culls against the same camera.
  const onRelayout = useEffectEvent(() => scheduleView());
  useEffect(() => {
    onRelayout();
  }, [layout]);

  // The wheel must be a non-passive native listener to prevent the page scroll.
  const onWheelEvent = useEffectEvent((e: WheelEvent) => {
    const el = viewportRef.current;
    if (!el || overlayOpen()) return;
    e.preventDefault();
    camAnim.current?.stop();
    const r = el.getBoundingClientRect();
    const c = camRef.current;
    const unit = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      setCam(zoomAt(c, c.k * Math.exp((-e.deltaY * unit) / 400), e.clientX - r.left, e.clientY - r.top));
    } else {
      const horizontal = e.shiftKey && e.deltaX === 0;
      setCam({ k: c.k, x: c.x - (horizontal ? e.deltaY : e.deltaX) * unit, y: c.y - (horizontal ? 0 : e.deltaY) * unit });
    }
  });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const listener = (e: WheelEvent) => onWheelEvent(e);
    el.addEventListener("wheel", listener, { passive: false });
    return () => el.removeEventListener("wheel", listener);
  }, []);

  /* ── announcing ─────────────────────────────────────────────────────── */

  const say = (text: string) => announce({ key: `${uid}:${++sayN.current}`, text });
  const colWord = (L: Layout, col: number) => {
    const c = L.columns[col];
    return `${names[c.stage] ?? c.stage}${c.band ? ` · ${c.label}` : ""}`;
  };

  // "moved to gate, 4 of 9" needs the card's place AFTER the relayout.
  const onSettled = useEffectEvent((): (() => void) | void => {
    const p = pendingSay.current;
    if (!p) return;
    const s = layout.slotOf.get(p.id);
    if (!s) return;
    pendingSay.current = null;
    const n = layout.ids[s.lane * layout.columns.length + s.col].length;
    const title = layout.entryOf.get(p.id)?.item.title ?? "";
    // A stubbed move did not happen, so it is not announced as one: the card
    // has returned to where it was and the sentence has to agree with it.
    say(p.dry ? `${title} not moved: nothing was spent` : `${title} moved to ${colWord(layout, s.col)}, ${s.row + 1} of ${n}`);
    const id = requestAnimationFrame(() => reveal(p.id));
    return () => cancelAnimationFrame(id);
  });
  useEffect(() => onSettled(), [layout]);

  /* ── the move: ask, submit, reconcile ───────────────────────────────── */

  const targetsFor = (id: string): string[] =>
    selected.has(id) && selected.size > 1 ? [...selected].filter((i) => layout.slotOf.has(i)) : [id];

  /** Send one request per card, in order, and fold each confirmed item back in.
   *  Nothing here renders anything as moved: only `apply` does, with the
   *  authority's own item. */
  const submitMoves = async (ids: string[], laneKey: string, col: number, answers: PromptAnswer = {}): Promise<Outcome> => {
    const todo = ids.filter((id) => live.current!.layout.entryOf.has(id));
    setPending((p) => new Set([...p, ...todo]));
    const failed: string[] = [];
    let stubbed = 0;
    let first: { reason: string; retryable: boolean } | null = null;
    for (const id of todo) {
      const L = live.current!;
      const entry = L.layout.entryOf.get(id);
      if (!entry) continue;
      let r: MoveResult;
      try {
        const req = requestFor(L.layout, entry.item, laneKey, col, answers);
        // THE ARM CLAMPS EVERY PATH. A confirm answers `live: true` to mean the
        // operator pressed yes; whether that is allowed to spend anything is
        // this prop's call, not the dialog's. Both must agree, so STUB cannot
        // be talked round by a gesture.
        r = await L.source.move({ ...req, live: arm === "live" && req.live === true });
      } catch (e) {
        r = { ok: false, reason: e instanceof Error ? e.message : String(e), retryable: true };
      }
      if (r.ok) {
        // `MoveResult`'s own contract: "a caller that commits on `ok` alone
        // draws a move that never happened." A stubbed result IS ok - the
        // authority answered, it just did not act - so the board reconciles the
        // unchanged item (the card returns home, which is right) and the verb
        // is NOT announced as done.
        live.current!.apply(r.item);
        if (isStubbedMove(r)) stubbed++;
      } else {
        failed.push(id);
        first ??= { reason: r.reason, retryable: r.retryable };
      }
    }
    if (!deadRef.current)
      setPending((p) => {
        const n = new Set(p);
        todo.forEach((i) => n.delete(i));
        return n;
      });
    return first ? { ok: false, ...first, failed } : { ok: true, stubbed };
  };

  const refuse = (ids: string[], reason: string, retry?: () => void) => {
    setNotice({ ids, text: reason, retry });
    say(reason);
  };

  /** Settle the ghost on a slot and say when it has arrived. */
  const settle = (tx: number, ty: number): Promise<void> => {
    gx.set(tx);
    gy.set(ty);
    if (calm) {
      sx.jump(tx);
      sy.jump(ty);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const poll = () => {
        if (deadRef.current || performance.now() - t0 > 700 || (Math.abs(sx.get() - tx) < 0.6 && Math.abs(sy.get() - ty) < 0.6)) return resolve();
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  };

  /** Return the ghost to where the cards came from — "returned", not "glitched":
   *  it travels back on the same spring it left on, and the home slot lights. */
  const goHome = async (f: { ids: string[]; lead: string }) => {
    const L = live.current!;
    const home = cardPos(L.layout, f.lead);
    if (!home) {
      setFlight(null);
      return;
    }
    setFlight({ ids: f.ids, lead: f.lead, phase: "back", kind: "none" });
    await settle(home.x, home.y);
    if (!deadRef.current) setFlight(null);
  };

  const landDone = () => {
    setFlight((f) => (f ? { ...f, phase: "done" } : f));
    window.setTimeout(() => !deadRef.current && setFlight(null), calm ? 0 : 200);
  };

  /** Everything that moves cards by a route other than a drag, and the drop
   *  itself once it has landed on a verdict. */
  const decide = async (ids: string[], lane: number, col: number, via: { drag: boolean; verdicts?: Verdicts }) => {
    const L = live.current!;
    const lead = ids[0];
    const laneKey = L.layout.lanes[lane].key;
    const verdict = (via.verdicts ?? buildVerdicts(L.source, L.layout, ids)).verdictFor(lane, col);
    const title = ids.length > 1 ? `${ids.length} cards` : (L.layout.entryOf.get(lead)?.item.title ?? "");
    const dest = colWord(L.layout, col);

    if (verdict.kind === "home") {
      if (via.drag) void goHome({ ids, lead });
      say(`${title} stays where it is`);
      return;
    }
    if (verdict.kind === "refused") {
      if (via.drag) void goHome({ ids, lead });
      refuse(ids, verdict.reason);
      return;
    }
    if (verdict.kind === "needs") {
      const slot = tailPos(L.layout, lane, col);
      if (via.drag) {
        setFlight({ ids, lead, phase: "land", kind: "needs" });
        void settle(slot.x, slot.y);
      }
      setPrompt({ ids, laneKey, col, need: verdict.need, prompt: verdict.prompt, cost: verdict.cost, title, verb: `Move to ${dest}`, flight: via.drag });
      say(`${verdict.prompt}`);
      return;
    }
    // ok
    if (via.drag) {
      setFlight({ ids, lead, phase: "land", kind: "ok" });
      const slot = tailPos(L.layout, lane, col);
      void settle(slot.x, slot.y);
    }
    say(`${title} dropped on ${dest}`);
    const o = await submitMoves(ids, laneKey, col);
    if (o.ok) {
      pendingSay.current = { id: lead, verb: dest, dry: o.stubbed > 0 && o.stubbed === ids.length };
      setNotice((n) => (n && n.ids.some((i) => ids.includes(i)) ? null : n));
      if (via.drag) landDone();
    } else {
      if (via.drag) void goHome({ ids: o.failed, lead: o.failed[0] ?? lead });
      refuse(o.failed, o.reason, o.retryable ? () => void decide(o.failed, lane, col, { drag: false }) : undefined);
    }
  };

  const answerPrompt = async (p: PromptState, a: PromptAnswer): Promise<PromptOutcome> => {
    const o = await submitMoves(p.ids, p.laneKey, p.col, a);
    if (o.ok) {
      pendingSay.current = { id: p.ids[0], verb: p.verb, dry: o.stubbed > 0 && o.stubbed === p.ids.length };
      setNotice((n) => (n && n.ids.some((i) => p.ids.includes(i)) ? null : n));
      setPrompt(null);
      if (p.flight) landDone();
      viewportRef.current?.focus({ preventScroll: true });
      return { ok: true };
    }
    return { ok: false, reason: o.reason, retryable: o.retryable };
  };

  const cancelPrompt = (p: PromptState) => {
    setPrompt(null);
    if (p.flight) void goHome({ ids: p.ids, lead: p.ids[0] });
    say("cancelled");
    viewportRef.current?.focus({ preventScroll: true });
  };

  /* ── the drag ───────────────────────────────────────────────────────── */

  const pressCard = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
    let ids = targetsFor(id);
    if (!ids.includes(id)) ids = [id];
    let grab = { x: 0, y: 0 };
    let last: { cell: { lane: number; col: number } | null; verdict: Verdict | null } = { cell: null, verdict: null };
    let overKey = -2;
    let rect = vp.getBoundingClientRect();
    let pointer = { x: press.x, y: press.y };
    let verdicts: Verdicts | null = null;
    pointerFocus.current = document.activeElement !== vp;
    vp.focus({ preventScroll: true });
    cursor.current = id;
    camAnim.current?.stop();
    swallow.current = false;

    const track = (px: number, py: number) => {
      const L = live.current!;
      pointer = { x: px, y: py };
      const w = toWorld(camRef.current, px - rect.left, py - rect.top);
      gx.set(w.x - grab.x);
      gy.set(w.y - grab.y);
      cx.set(px - rect.left + 18);
      cy.set(py - rect.top + 24);
      const cell = resolveCell(L.layout, w.x, w.y);
      const key = cell ? cell.lane * L.layout.columns.length + cell.col : -1;
      if (key === overKey || !verdicts) return;
      overKey = key;
      const verdict = cell ? verdicts.verdictFor(cell.lane, cell.col) : null;
      last = { cell, verdict };
      setDrag((d) => (d ? { ...d, over: cell, verdict, fresh: false } : d));
    };

    pressDrag(press, {
      surface: vp,
      start: () => {
        const L = live.current!;
        const home = cardPos(L.layout, id);
        if (!home) return false;
        rect = vp.getBoundingClientRect();
        const w = toWorld(camRef.current, press.x - rect.left, press.y - rect.top);
        grab = { x: w.x - home.x, y: w.y - home.y };
        gx.set(home.x);
        gy.set(home.y);
        sx.jump(home.x);
        sy.jump(home.y);
        // THE ONE ASK. Every admits() call this drag will make is made here.
        verdicts = buildVerdicts(L.source, L.layout, ids);
        setMenu(null);
        setMap(null);
        setNotice(null);
        setFlight(null);
        cursor.current = null;
        setActive(id);
        setDrag({ ids, lead: id, verdicts, over: null, verdict: null, fresh: true });
        say(`grabbed ${ids.length > 1 ? `${ids.length} cards` : (L.layout.entryOf.get(id)?.item.title ?? "")}`);
        return true;
      },
      move: track,
      frame: () => {
        const L = live.current!;
        if (!L.layout.slotOf.has(id)) return "vanished";
        const live2 = ids.filter((i) => L.layout.slotOf.has(i));
        if (live2.length !== ids.length) {
          ids = live2;
          setDrag((d) => (d ? { ...d, ids: live2 } : d));
        }
        // Edge auto-scroll: the board travels under a stationary pointer.
        const px = pointer.x - rect.left;
        const py = pointer.y - rect.top;
        const edge = (v: number, max: number) => (v < EDGE_PX ? ((EDGE_PX - v) / EDGE_PX) * EDGE_SPEED : v > max - EDGE_PX ? -((v - (max - EDGE_PX)) / EDGE_PX) * EDGE_SPEED : 0);
        const dx = edge(px, rect.width);
        const dy = edge(py, rect.height);
        if (dx || dy) {
          const c = camRef.current;
          setCam({ k: c.k, x: c.x + dx, y: c.y + dy });
          overKey = -2;
          track(pointer.x, pointer.y);
        }
      },
      end: ({ exit, started }) => {
        setDrag(null);
        if (!started) return;
        swallow.current = true;
        window.setTimeout(() => (swallow.current = false), 150);
        const L = live.current!;
        const lead = ids[0];
        if (exit === "vanished") {
          setFlight(null);
          say("cancelled: the card is no longer on the board");
          return;
        }
        if (exit !== "up") {
          void goHome({ ids, lead });
          say(exit === "dialog" ? "cancelled: a dialog opened" : "cancelled");
          return;
        }
        const cell = last.cell;
        if (!cell || !L.layout.slotOf.has(lead)) {
          void goHome({ ids, lead });
          say("cancelled: dropped outside the board");
          return;
        }
        void decide(ids, cell.lane, cell.col, { drag: true, verdicts: verdicts ?? undefined });
      },
    });
  };

  const pressPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const from = { x: e.clientX, y: e.clientY, cx: camRef.current.x, cy: camRef.current.y };
    let moved = false;
    camAnim.current?.stop();
    swallow.current = false;
    pointerFocus.current = document.activeElement !== vp;
    vp.focus({ preventScroll: true });
    const g = startGesture({
      pointerId: e.pointerId,
      onMove(ev) {
        const dx = ev.clientX - from.x;
        const dy = ev.clientY - from.y;
        if (!moved) {
          if (Math.hypot(dx, dy) < 4) return;
          moved = true;
          g.engage(vp);
          vp.dataset.mode = "pan";
        }
        setCam({ k: camRef.current.k, x: from.cx + dx, y: from.cy + dy });
      },
      onEnd() {
        delete vp.dataset.mode;
        if (moved) {
          swallow.current = true;
          window.setTimeout(() => (swallow.current = false), 150);
        }
      },
    });
  };

  /* ── audition: ONE Audio element for the whole board ────────────────── */

  // A skin may put `data-play data-src` on a control inside a card (ledger does,
  // for audio takes). Five hundred cards must not mean five hundred media
  // elements, and a card may not hold a callback, so the playing is done here:
  // one detached Audio, found through the same delegated listener as everything
  // else. The button's state is written as ATTRIBUTES on its own node rather
  // than lifted into React state — a `playing` prop would re-render a memoised
  // card on every play, which is the one thing Card.tsx's contract forbids.
  const audio = useRef<HTMLAudioElement | null>(null);
  const playBtn = useRef<HTMLElement | null>(null);

  const markPlay = (btn: HTMLElement | null) => {
    const was = playBtn.current;
    // `isConnected`: the card holding the previous button may have been culled
    // while its take played on, and an attribute written to a detached node is
    // harmless but pointless.
    if (was && was !== btn && was.isConnected) {
      was.removeAttribute("data-playing");
      was.setAttribute("aria-pressed", "false");
    }
    playBtn.current = btn;
    if (btn) {
      btn.setAttribute("data-playing", "");
      btn.setAttribute("aria-pressed", "true");
    }
  };

  const playFromCard = (btn: HTMLElement) => {
    const src = btn.dataset.src;
    if (!src) return;
    let el = audio.current;
    if (!el) {
      el = new Audio();
      el.preload = "none";
      // ONE listener, and `ended` ONLY. A `pause` listener here looked right and
      // was a race: assigning `el.src` while something is playing makes the
      // browser fire `pause`, asynchronously, AFTER this function has already
      // marked the new button — so pressing a second card's play released the
      // first (correct), marked the second, and was then cleared by the first's
      // own pause event. Nothing played, and both buttons read idle. Driven:
      // first press plays, second press used to leave silence, now it hands over.
      // Every deliberate stop marks itself below, so `pause` has no work to do.
      el.addEventListener("ended", () => markPlay(null));
      audio.current = el;
    }
    // The same source pressed again is a stop, which is what a toggle means.
    if (playBtn.current === btn && !el.paused) {
      el.pause();
      markPlay(null);
      return;
    }
    if (el.src !== new URL(src, window.location.href).href) el.src = src;
    el.currentTime = 0;
    markPlay(btn);
    // A refused play (no gesture, a 404, a codec) must leave the button honest
    // rather than stuck showing a pause glyph over silence.
    void el.play().catch(() => markPlay(null));
  };

  useEffect(
    () => () => {
      const el = audio.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
      audio.current = null;
      playBtn.current = null;
    },
    [],
  );

  /* ── pointer, delegated: one listener, the card found by closest() ──── */

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || overlayOpen()) return;
    const t = e.target as Element;
    if (t.closest(NODRAG)) return;
    const card = t.closest<HTMLElement>("[data-card]");
    if (card) pressCard(e, card.dataset.card!);
    else pressPan(e);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (swallow.current) {
      swallow.current = false;
      return;
    }
    const t = e.target as Element;
    // Before NODRAG returns (a <button> is in it): an audition is a click on a
    // control, and it changes neither the selection nor the cursor.
    const play = t.closest<HTMLElement>("[data-play]");
    if (play) {
      playFromCard(play);
      return;
    }
    const verbs = t.closest("[data-verbs]");
    const card = t.closest<HTMLElement>("[data-card]");
    if (verbs && card) {
      const r = verbs.getBoundingClientRect();
      touch(card.dataset.card!);
      setMenu({ x: r.left, y: r.bottom + 4, id: card.dataset.card! });
      return;
    }
    if (t.closest(NODRAG)) return;
    if (card) {
      const id = card.dataset.card!;
      touch(id);
      if (e.ctrlKey || e.metaKey || e.shiftKey) toggleSelect(id);
      else setSelected(new Set([id]));
    } else if (selected.size) setSelected(NONE);
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = (e.target as Element).closest<HTMLElement>("[data-card]");
    const entry = card && layout.entryOf.get(card.dataset.card!);
    if (entry) live.current?.onOpen?.(entry);
  };

  const onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = (e.target as Element).closest<HTMLElement>("[data-card]");
    if (!card) return;
    e.preventDefault();
    touch(card.dataset.card!);
    setMap(null);
    setMenu({ x: e.clientX, y: e.clientY, id: card.dataset.card! });
  };

  /** A pointer touched a card: it becomes the cursor at the next key press, and
   *  the ring on whichever card the keyboard had is put out. */
  const touch = (id: string) => {
    cursor.current = id;
    if (active) setActive(null);
  };

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ── the verbs: one list, three ways in ─────────────────────────────── */

  const cardAnchor = (id: string): { x: number; y: number } => {
    const r = viewportRef.current?.getBoundingClientRect();
    const p = cardPos(layout, id);
    if (!r || !p) return { x: 80, y: 80 };
    const s = toScreen(camRef.current, p.x + CARD_W, p.y);
    return { x: Math.min(r.right - 24, Math.max(r.left + 24, r.left + s.x)), y: Math.min(r.bottom - 24, Math.max(r.top + 24, r.top + s.y)) };
  };

  const openMap = (id: string, at?: { x: number; y: number }) => {
    const a = at ?? cardAnchor(id);
    setMenu(null);
    // asked once, when the map opens — the same table the drag uses
    setMap({ x: a.x, y: a.y, id, verdicts: buildVerdicts(source, layout, targetsFor(id)) });
  };

  const stepMove = (id: string, dir: Dir) => {
    const cell = stepCell(layout, id, dir);
    if (!cell) {
      say(`${layout.entryOf.get(id)?.item.title ?? ""} · edge of the board`);
      return;
    }
    void decide(targetsFor(id), cell.lane, cell.col, { drag: false });
  };

  const retryOf = (id: string) => (notice && notice.ids.includes(id) ? notice.retry : undefined);

  /** The verb list, as data. One list serves the menu, the keyboard and the
   *  actions button; `runVerb` is the one place a verb is carried out. */
  const verbItems = (id: string): MenuItem[] => {
    const entry = layout.entryOf.get(id);
    if (!entry || !layout.slotOf.has(id)) return [];
    const many = targetsFor(id).length;
    const lead = many > 1 ? `${many} cards ` : "";
    // The menu focuses its first item on open: the first verb is the safe one.
    const items: MenuItem[] = [{ id: "select", label: selected.has(id) ? "Deselect" : "Select", detail: "Space" }];
    if (onOpen) items.push({ id: "open", label: "Open", detail: "Enter" });
    const toward = (dir: Dir, detail: string) => {
      const c = stepCell(layout, id, dir);
      if (!c) return;
      const to = dir === "left" || dir === "right" ? `to ${colWord(layout, c.col)}` : `${dir} to ${layout.lanes[c.lane].label || "lane"}`;
      items.push({ id: `move-${dir}`, label: `Move ${lead}${to}`, detail });
    };
    toward("right", "⇧→");
    toward("left", "⇧←");
    toward("up", "⇧↑");
    toward("down", "⇧↓");
    items.push({ id: "map", label: `Move ${lead}to…`, detail: "M" });
    if (retryOf(id)) items.push({ id: "retry", label: "Retry the move", detail: "R" });
    return items;
  };

  const runVerb = (id: string, verb: string) => {
    const entry = layout.entryOf.get(id);
    if (!entry) return;
    if (verb === "select") toggleSelect(id);
    else if (verb === "open") live.current?.onOpen?.(entry);
    else if (verb === "map") openMap(id, menu ? { x: menu.x, y: menu.y } : undefined);
    else if (verb === "retry") retryOf(id)?.();
    else if (verb.startsWith("move-")) stepMove(id, verb.slice(5) as Dir);
  };

  /* ── keyboard ───────────────────────────────────────────────────────── */

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const a = pipelineKeyAction(e, overlayOpen());
    if (!a) return;
    const s = sizeRef.current;
    const from = cursor.current && layout.slotOf.has(cursor.current) ? cursor.current : active;
    const here = from && layout.slotOf.has(from) ? from : null;
    cursor.current = null;
    if (here && here !== active) setActive(here);
    const take = () => e.preventDefault();

    switch (a.kind) {
      case "walk": {
        take();
        const L = layout;
        const from = here ?? (view && s ? nearestTo(L, viewRect(camRef.current, s.w, s.h)) : null);
        if (!from) return;
        const to = here ? walk(L, from, a.dir) : from;
        if (!to) {
          say("edge of the board");
          return;
        }
        setActive(to);
        reveal(to);
        window.clearTimeout(walkSay.current);
        walkSay.current = window.setTimeout(() => {
          const l = live.current;
          const sl = l?.layout.slotOf.get(to);
          if (!l || !sl) return;
          const n = l.layout.ids[sl.lane * l.layout.columns.length + sl.col].length;
          say(`${l.layout.entryOf.get(to)?.item.title ?? ""} · ${colWord(l.layout, sl.col)} · ${sl.row + 1} of ${n}`);
        }, 220);
        return;
      }
      case "move":
        take();
        if (here) stepMove(here, a.dir);
        return;
      case "toggle":
        take();
        if (here) toggleSelect(here);
        return;
      case "open": {
        const entry = here ? layout.entryOf.get(here) : null;
        if (entry && onOpen) {
          take();
          live.current?.onOpen?.(entry);
        }
        return;
      }
      case "map":
        take();
        if (here) openMap(here);
        return;
      case "menu":
        take();
        if (here) {
          const p = cardAnchor(here);
          setMenu({ x: p.x, y: p.y, id: here });
        }
        return;
      case "retry":
        if (notice?.retry) {
          take();
          notice.retry();
        }
        return;
      case "zoom":
        take();
        zoomBy(a.by > 0 ? 1.25 : 0.8);
        return;
      case "fit":
        take();
        fit();
        return;
      case "escape":
        if (notice) {
          take();
          setNotice(null);
        } else if (selected.size) {
          take();
          setSelected(NONE);
        }
        return;
    }
  };

  const onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (pointerFocus.current) {
      pointerFocus.current = false;
      return;
    }
    if (e.target !== e.currentTarget || active || !view || !sizeRef.current) return;
    const s = sizeRef.current;
    setActive(nearestTo(layout, viewRect(camRef.current, s.w, s.h)));
  };

  /* ── what the shell can read and call ───────────────────────────────── */

  // The skin's world layer: behind the cards, inside the world transform, and
  // rebuilt ONLY when the layout changes. Not on a pan (the container owns the
  // transform), not on a selection, not on a drag.
  const world = useMemo(() => skin.world?.(layout) ?? null, [skin, layout]);

  const status = useMemo<CanvasStatus>(
    () => ({ loading: data.loading, error: data.error, notes: data.notes, total: layout.total, counts: layout.stageCounts, selected: selected.size, mounted: mounted.length, choreo }),
    [data.loading, data.error, data.notes, layout, selected, mounted.length, choreo],
  );
  const emitStatus = useEffectEvent((s: CanvasStatus) => onStatus?.(s));
  useEffect(() => {
    emitStatus(status);
  }, [status]);

  const impl = useRef({ fit, zoomBy, reveal });
  useLayoutEffect(() => {
    impl.current = { fit, zoomBy, reveal };
  });
  useImperativeHandle(
    apiRef,
    () => ({
      reload: data.reload,
      fit: () => impl.current.fit(),
      zoomBy: (f: number) => impl.current.zoomBy(f),
      reveal: (id: string) => impl.current.reveal(id),
      camera: () => camRef.current,
    }),
    [data.reload],
  );

  /* ── render ─────────────────────────────────────────────────────────── */

  const preview = useMemo<DragPreview | null>(() => (drag ? { verdictFor: drag.verdicts.verdictFor, over: drag.over } : null), [drag]);
  const ghostSrc = drag
    ? { ids: drag.ids, lead: drag.lead, phase: "carry" as GhostPhase, kind: (drag.fresh ? "carry" : drag.over && drag.verdict ? drag.verdict.kind : "none") as GhostKind }
    : flight;
  const ghostEntry = ghostSrc ? layout.entryOf.get(ghostSrc.lead) : undefined;
  const posLabel = (() => {
    const s = active ? layout.slotOf.get(active) : null;
    return s ? `${s.row + 1} of ${layout.ids[s.lane * layout.columns.length + s.col].length}` : null;
  })();
  // The card elements are built once per change of what they depend on. While a
  // drag moves over cells, or the status is read, or a callout is drawn, none
  // of these inputs change, the SAME element objects are returned, and React
  // skips the whole subtree without comparing a single card's props.
  const cards = useMemo(
    () =>
      mounted.map((p) => {
        const entry = layout.entryOf.get(p.id);
        if (!entry) return null;
        return (
          <Card
            key={p.id}
            entry={entry}
            x={p.x}
            y={p.y}
            lane={layout.lanes[p.lane].label}
            selected={selected.has(p.id)}
            active={active === p.id}
            away={away.has(p.id)}
            busy={pending.has(p.id)}
            flagged={flagged.has(p.id)}
            glide={choreo.on}
            enter={enters?.get(p.id) ?? null}
            pos={active === p.id ? posLabel : null}
            skin={skin}
            domId={domIdOf(uid, p.id)}
          />
        );
      }),
    [mounted, layout, selected, active, away, pending, flagged, choreo.on, enters, posLabel, skin, uid],
  );
  const calloutTo = drag?.over ? `to ${colWord(layout, drag.over.col)}${drag.verdict?.kind === "ok" && drag.verdict.laneOnly ? ` · ${layout.lanes[drag.over.lane].label}` : ""}` : "";

  return (
    <div className={`relative h-full min-h-0 w-full ${className}`}>
      <div
        ref={viewportRef}
        role="application"
        aria-roledescription="pipeline canvas"
        aria-label={`${source.label} pipeline`}
        aria-activedescendant={active && mounted.some((p) => p.id === active) ? domIdOf(uid, active) : undefined}
        aria-busy={data.loading || undefined}
        tabIndex={0}
        data-pipeline-viewport
        data-dragging={drag ? "" : undefined}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        className="absolute inset-0 cursor-grab touch-none overflow-hidden rounded-xl border border-white/8 bg-[var(--gt-ink)]/50 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 data-[dragging]:cursor-grabbing data-[mode=pan]:cursor-grabbing"
      >
        <div
          ref={worldRef}
          data-pipeline-world
          className="absolute top-0 left-0 origin-top-left will-change-transform"
          style={{ transform: `translate3d(${FRAME.left + FRAME.inset}px, ${FRAME.top + FRAME.inset}px, 0)` }}
        >
          <CellLayer layout={layout} from={laneFrom} to={laneTo} preview={preview} names={names} />
          {world}
          {cards}
          {ghostSrc && ghostEntry && (
            <Ghost
              x={calm ? gx : sx}
              y={calm ? gy : sy}
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
        <LaneHeads layout={layout} from={laneFrom} to={laneTo} reg={heads} />
        {drag && <Callout x={cx} y={cy} verdict={drag.over ? drag.verdict : null} to={calloutTo} />}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={`Actions for ${layout.entryOf.get(menu.id)?.item.title ?? "card"}`}
          items={verbItems(menu.id)}
          onPick={(verb) => runVerb(menu.id, verb)}
          onClose={() => setMenu(null)}
          restoreTo={() => viewportRef.current}
        />
      )}
      {map && (
        <MoveMap
          layout={layout}
          id={map.id}
          verdicts={map.verdicts}
          names={names}
          x={map.x}
          y={map.y}
          onPick={(lane, col) => {
            setMap(null);
            viewportRef.current?.focus({ preventScroll: true });
            void decide(targetsFor(map.id), lane, col, { drag: false, verdicts: map.verdicts });
          }}
          onClose={() => {
            setMap(null);
            viewportRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
      {prompt && (
        <MovePrompt
          title={prompt.title}
          verb={prompt.verb}
          need={prompt.need}
          prompt={prompt.prompt}
          cost={prompt.cost}
          onSubmit={(a) => answerPrompt(prompt, a)}
          onCancel={() => cancelPrompt(prompt)}
        />
      )}
      {notice && (
        <div
          data-notice
          className="font-hanken absolute bottom-4 left-1/2 z-30 flex max-w-[min(36rem,90%)] -translate-x-1/2 items-start gap-3 rounded-xl border border-rose-300/50 bg-[var(--gt-ink)]/95 py-2.5 pr-2 pl-4 text-content text-rose-100 shadow-xl shadow-black/50 backdrop-blur-md"
        >
          <span className="min-w-0 flex-1 py-0.5">{notice.text}</span>
          {notice.retry && (
            <button type="button" onClick={notice.retry} className="font-jetbrains cursor-pointer rounded-full border border-rose-300/50 px-3 py-1 text-label text-rose-100 transition hover:bg-rose-300/15 focus-visible:outline-2">
              Retry
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-rose-100/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

export type { Exit };
