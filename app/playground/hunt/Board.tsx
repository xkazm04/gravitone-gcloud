"use client";

// THE MAP — a hunt drawn as what it is: one idea, the questions it was split
// into, and the concrete answers to each, side by side so they can be heard
// side by side. Layout is pure (./model.ts#layoutTree, fixed card sizes, the
// viewport only decides how many leaves a line holds); this file draws it.
//
// The cards sit in HTML for type and focus; the connectors are one SVG under
// them in the same coordinate space, so a zoom is one CSS transform and the
// lines can never drift from the cards they join.
//
// Selection is the board's verb: click focuses a leaf and selects it alone,
// ctrl/cmd-click toggles, shift-click ranges from the anchor, a drag on the
// ground draws a marquee, a branch card's pill takes its whole branch. What is
// selected is what the render bar prices.

import { useEffect, useMemo, useRef, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Check,
  Crown,
  Hourglass,
  Lock,
  Maximize2,
  Minus,
  Plus,
  Repeat,
} from "lucide-react";

import { Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { Hunt, HuntNode, SoundTake } from "@/lib/sound/types";

import { PROVIDER_NAME } from "../shared/format";
import { CAPS } from "../shared/ui";
import { GhostWave, PlayButton, TakeWave } from "../shared/Wave";
import {
  fitScale,
  layoutTree,
  leavesPerLine,
  lengthOf,
  loopOf,
  marqueeHits,
  type Box,
  type HuntTree,
  type MapColumn,
} from "./model";

const PROVIDER_TONE: Record<HuntNode["provider"], string> = {
  elevenlabs: "text-cyan-200/80",
  suno: "text-amber-200/80",
  local: "text-white/45",
};

export interface BoardProps {
  hunt: Hunt;
  tree: HuntTree;
  selected: readonly string[];
  focus: string | null;
  /** The newest take of each rendered leaf. */
  takeOf: (n: HuntNode) => SoundTake | null;
  onLeaf: (id: string, mods: { shift: boolean; toggle: boolean }) => void;
  onBranch: (leafIds: string[]) => void;
  onMarquee: (hits: string[], add: boolean) => void;
  onClear: () => void;
}

const ZOOMS = [0.5, 0.65, 0.8, 1, 1.2] as const;

export function Board({
  hunt,
  tree,
  selected,
  focus,
  takeOf,
  onLeaf,
  onBranch,
  onMarquee,
  onClear,
}: BoardProps) {
  const reduce = useReducedMotion();
  const view = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [drag, setDrag] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    add: boolean;
  } | null>(null);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setViewW(Math.floor(e.contentRect.width)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perLine = viewW ? leavesPerLine(viewW) : 3;
  const layout = useMemo(() => layoutTree(tree, perLine), [tree, perLine]);
  const scale =
    zoom === "fit" ? fitScale(layout.width, viewW || layout.width) : zoom;
  const leafBoxes = useMemo(
    () =>
      layout.columns.flatMap((c) =>
        c.rows
          .filter((r) => r.kind === "leaf")
          .map((r) => ({ id: r.id, box: r.box })),
      ),
    [layout],
  );
  const byId = useMemo(
    () => new Map(hunt.nodes.map((n) => [n.id, n] as const)),
    [hunt.nodes],
  );
  const sel = useMemo(() => new Set(selected), [selected]);

  // Layout coordinates of a pointer — the marquee is measured in the same
  // units the cards are placed in, so a zoom never skews what it catches.
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const rect: Box | null = drag
    ? {
        x: drag.from.x,
        y: drag.from.y,
        w: drag.to.x - drag.from.x,
        h: drag.to.y - drag.from.y,
      }
    : null;

  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next =
      dir > 0
        ? ZOOMS.find((z) => z > cur + 0.01)
        : [...ZOOMS].reverse().find((z) => z < cur - 0.01);
    if (next) setZoom(next);
  };

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-end px-1">
        <div className="flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-0.5">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Zoom out"
            className={ZOOM_BTN}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span
            className="w-12 text-center font-jetbrains text-label tabular-nums text-white/55"
            aria-live="polite"
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Zoom in"
            className={ZOOM_BTN}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            aria-pressed={zoom === "fit"}
            aria-label="Fit the map to the width"
            className={`${ZOOM_BTN} ${zoom === "fit" ? "text-cyan-200" : ""}`}
          >
            <Maximize2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div
        ref={view}
        className="overflow-x-auto overflow-y-hidden"
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          step(e.deltaY < 0 ? 1 : -1);
        }}
      >
        <div
          style={{ width: layout.width * scale, height: layout.height * scale }}
          className="relative"
        >
          <div
            ref={canvas}
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${scale})`,
            }}
            className="absolute left-0 top-0 origin-top-left touch-none select-none"
            onPointerDown={(e) => {
              // Only the ground starts a marquee; a card handles its own press.
              if (
                e.button !== 0 ||
                (e.target as Element).closest("[data-card]")
              )
                return;
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = at(e);
              setDrag({
                from: p,
                to: p,
                add: e.shiftKey || e.ctrlKey || e.metaKey,
              });
            }}
            onPointerMove={(e) => {
              if (drag) setDrag({ ...drag, to: at(e) });
            }}
            onPointerUp={() => {
              if (!drag || !rect) return;
              const moved = Math.abs(rect.w) + Math.abs(rect.h) > 6;
              if (moved) onMarquee(marqueeHits(rect, leafBoxes), drag.add);
              else if (!drag.add) onClear();
              setDrag(null);
            }}
          >
            <svg
              aria-hidden
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute inset-0"
            >
              {layout.edges.map((e) => {
                const n = byId.get(e.to);
                const lit = n && sel.has(n.id);
                const won = n?.winner;
                return (
                  <path
                    key={e.id}
                    d={e.d}
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={lit || won ? 1.75 : 1.25}
                    className={
                      won
                        ? "stroke-emerald-300/70"
                        : lit
                          ? "stroke-cyan-300/80"
                          : "stroke-white/[0.16]"
                    }
                  />
                );
              })}
            </svg>

            <RootCard hunt={hunt} tree={tree} box={layout.root} />

            {layout.columns.map((col, ci) => {
              const c = tree.columns[ci];
              return (
                <div key={col.id}>
                  <BranchCard
                    column={c}
                    box={col.header}
                    selected={sel}
                    onToggle={() =>
                      onBranch(
                        c.rows.flatMap((r) =>
                          r.kind === "leaf" ? [r.id] : [],
                        ),
                      )
                    }
                  />
                  {col.rows.map((r, ri) => {
                    const n = byId.get(r.id);
                    if (!n) return null;
                    if (r.kind === "group")
                      return (
                        <div
                          key={r.id}
                          style={place(r.box)}
                          className="absolute flex items-end gap-2 pb-1"
                        >
                          <span className={CAPS}>{n.axis}</span>
                          <span className="truncate font-hanken text-label text-white/70">
                            {n.label}
                          </span>
                        </div>
                      );
                    return (
                      <motion.div
                        key={r.id}
                        style={place(r.box)}
                        className="absolute"
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.24,
                          ease: EASE,
                          delay: reduce
                            ? 0
                            : Math.min(0.4, ci * 0.05 + ri * 0.03),
                        }}
                      >
                        <LeafCard
                          node={n}
                          kind={hunt.kind}
                          take={takeOf(n)}
                          selected={sel.has(n.id)}
                          focused={focus === n.id}
                          onPress={(mods) => onLeaf(n.id, mods)}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}

            {rect && (
              <span
                aria-hidden
                style={place({
                  x: Math.min(rect.x, rect.x + rect.w),
                  y: Math.min(rect.y, rect.y + rect.h),
                  w: Math.abs(rect.w),
                  h: Math.abs(rect.h),
                })}
                className="pointer-events-none absolute rounded-md border border-dashed border-cyan-300/70 bg-cyan-300/[0.06]"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const ZOOM_BTN =
  "grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white/60 transition hover:bg-white/[0.08] hover:text-white";

const place = (b: Box): React.CSSProperties => ({
  left: b.x,
  top: b.y,
  width: b.w,
  height: b.h,
});

/* ── the idea ──────────────────────────────────────────────────────────── */

function RootCard({
  hunt,
  tree,
  box,
}: {
  hunt: Hunt;
  tree: HuntTree;
  box: Box;
}) {
  const heard = tree.leaves.filter((l) => l.state === "rendered").length;
  return (
    <div
      data-card
      style={place(box)}
      className="absolute flex flex-col gap-3 rounded-2xl border border-cyan-300/25 bg-gradient-to-b from-cyan-400/[0.08] to-white/[0.02] p-4 shadow-[0_0_32px] shadow-cyan-400/[0.06]"
    >
      <span className={CAPS}>{hunt.kind === "sfx" ? "effect" : "music"}</span>
      <p className="line-clamp-5 font-instrument text-xl leading-snug text-white">
        {hunt.idea}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Tally value={tree.columns.length} label="axes" tone="neutral" />
        <Tally
          value={heard}
          of={tree.leaves.length}
          label="heard"
          tone={heard ? "cyan" : "neutral"}
        />
      </div>
    </div>
  );
}

/* ── a branch: one question ────────────────────────────────────────────── */

function BranchCard({
  column,
  box,
  selected,
  onToggle,
}: {
  column: MapColumn;
  box: Box;
  selected: ReadonlySet<string>;
  onToggle: () => void;
}) {
  const leaves = column.rows.flatMap((r) =>
    r.kind === "leaf" ? [r.node] : [],
  );
  const on = leaves.filter((l) => selected.has(l.id)).length;
  const all = leaves.length > 0 && on === leaves.length;
  const won = leaves.some((l) => l.winner);
  return (
    <div
      data-card
      style={place(box)}
      className={`absolute flex flex-col gap-1.5 overflow-hidden rounded-xl border p-3.5 ${
        won
          ? "border-emerald-400/30 bg-emerald-400/[0.04]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-jetbrains text-label uppercase leading-snug tracking-[0.1em] text-white/45">
          {column.axis}
        </span>
        {won && (
          <Crown
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300"
            aria-label="a winner on this branch"
          />
        )}
      </div>
      {column.node && column.label !== column.axis && (
        <span className="line-clamp-2 font-instrument text-lg leading-tight text-white/90">
          {column.label}
        </span>
      )}
      {column.rationale && (
        <p className="line-clamp-2 font-hanken text-label leading-snug text-white/50">
          {column.rationale}
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={all}
        aria-label={`${all ? "Deselect" : "Select"} every leaf of ${column.axis}`}
        className={`mt-auto inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 font-jetbrains text-label transition ${
          all
            ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
            : on
              ? "border-cyan-400/30 text-cyan-200/80 hover:bg-cyan-400/10"
              : "border-white/12 text-white/55 hover:border-white/25 hover:text-white"
        }`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        {on ? `${on}/${leaves.length}` : `all ${leaves.length}`}
      </button>
    </div>
  );
}

/* ── a leaf: one answer you can hear ───────────────────────────────────── */

export function LeafCard({
  node,
  kind,
  take,
  selected,
  focused,
  onPress,
}: {
  node: HuntNode;
  kind: Hunt["kind"];
  take: SoundTake | null;
  selected: boolean;
  focused: boolean;
  onPress: (mods: { shift: boolean; toggle: boolean }) => void;
}) {
  const press = (e: React.MouseEvent | React.KeyboardEvent) =>
    onPress({ shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
  const loop = kind === "sfx" && loopOf(node);
  const ring = node.winner
    ? "border-emerald-400/55 bg-emerald-400/[0.06] shadow-[0_0_18px] shadow-emerald-400/10"
    : selected
      ? "border-cyan-300/55 bg-cyan-400/[0.06]"
      : node.state === "failed"
        ? "border-rose-400/30 bg-white/[0.025]"
        : node.state === "awaiting-return"
          ? "border-amber-400/30 bg-white/[0.025]"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.045]";
  return (
    <div
      data-card
      onClick={press}
      className={`group relative flex h-full cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition ${ring} ${
        focused ? "ring-2 ring-cyan-300/45 ring-offset-0" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPress({ shift: e.shiftKey, toggle: true });
          }}
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${node.label}`}
          className={`mt-1 grid h-4 w-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition ${
            selected
              ? "border-cyan-300 bg-cyan-300 text-slate-950"
              : "border-white/30 group-hover:border-white/50"
          }`}
        >
          {selected && (
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            press(e);
          }}
          className="min-w-0 flex-1 cursor-pointer truncate text-left font-instrument text-lg leading-tight text-white"
        >
          {node.label}
        </button>
        <StateMark node={node} />
      </div>
      <div className="flex items-center gap-2 font-jetbrains text-label text-white/45">
        <span className={PROVIDER_TONE[node.provider]}>
          {PROVIDER_NAME[node.provider]}
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{lengthOf(node.durationS)}</span>
        {loop && (
          <Repeat className="h-3.5 w-3.5 text-white/55" aria-label="loop" />
        )}
      </div>
      <p className="line-clamp-2 font-hanken text-label leading-snug text-white/55">
        {node.rationale}
      </p>
      {node.technique.length > 0 && (
        <span className="flex min-w-0 gap-1.5 overflow-hidden">
          {/* The first technique whole, the rest counted: two stubs cut to
              "single…" and "duration-an…" said nothing (r1 capture). */}
          <span className="min-w-0 truncate rounded-md border border-violet-300/25 bg-violet-300/[0.06] px-1.5 font-jetbrains text-label text-violet-100/80">
            {node.technique[0]}
          </span>
          {node.technique.length > 1 && (
            <span className="shrink-0 font-jetbrains text-label text-violet-200/50">
              +{node.technique.length - 1}
            </span>
          )}
        </span>
      )}
      <div className="mt-auto flex h-8 items-center gap-2">
        {node.state === "rendered" && take ? (
          <>
            <PlayButton take={take} size="sm" />
            <span
              className="min-w-0 flex-1"
              onClick={(e) => e.stopPropagation()}
            >
              <TakeWave
                take={take}
                height="h-7"
                bars={48}
                tone={node.winner ? "emerald" : "cyan"}
              />
            </span>
          </>
        ) : node.state === "rendering" ? (
          <span className="flex w-full items-center gap-2">
            <span className="font-jetbrains text-label text-cyan-200/80">
              rendering
            </span>
            <GhostWave
              seed={node.id.length}
              bars={32}
              height="h-6"
              pulse
              className="flex-1"
            />
          </span>
        ) : node.state === "failed" ? (
          <span className="line-clamp-1 font-jetbrains text-label text-rose-200/85">
            {node.error ?? "failed"}
          </span>
        ) : (
          <GhostWave
            seed={node.id.length}
            bars={40}
            height="h-6"
            className="w-full"
          />
        )}
      </div>
    </div>
  );
}

function StateMark({ node }: { node: HuntNode }) {
  if (node.winner)
    return (
      <Crown
        className="mt-1 h-4 w-4 shrink-0 text-emerald-300"
        aria-label="winner"
      />
    );
  switch (node.state) {
    case "rendered":
      return (
        <span
          aria-label="rendered"
          className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_8px] shadow-cyan-300/60"
        />
      );
    case "rendering":
      return (
        <span
          aria-label="rendering"
          className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-cyan-300/70"
        />
      );
    case "awaiting-return":
      return (
        <Hourglass
          className="mt-1 h-4 w-4 shrink-0 text-amber-300/85"
          aria-label="awaiting the Suno return"
        />
      );
    case "failed":
      return (
        <AlertTriangle
          className="mt-1 h-4 w-4 shrink-0 text-rose-300/85"
          aria-label="failed"
        />
      );
    default:
      return node.provider === "local" ? (
        <Lock
          className="mt-1 h-4 w-4 shrink-0 text-white/30"
          aria-label="engine not installed"
        />
      ) : (
        <span
          aria-label="not heard yet"
          className="mt-2 h-2 w-2 shrink-0 rounded-full border border-white/30"
        />
      );
  }
}

/** The map's shape before it exists — the same layout over placeholder
 *  nodes, drawn as outlines, while the text engine drafts. */
export function GhostMap({ tree, idea }: { tree: HuntTree; idea: string }) {
  const layout = layoutTree(tree, 3);
  return (
    <div className="relative overflow-hidden" style={{ height: layout.height }}>
      <p className="sr-only">drafting the map</p>
      <div
        aria-hidden
        className="absolute left-0 top-0 animate-pulse"
        style={{ width: layout.width, height: layout.height }}
      >
        <svg
          width={layout.width}
          height={layout.height}
          className="absolute inset-0"
        >
          {layout.edges.map((e) => (
            <path
              key={e.id}
              d={e.d}
              fill="none"
              strokeDasharray="3 5"
              className="stroke-white/25"
            />
          ))}
        </svg>
        <div
          style={place(layout.root)}
          className="absolute flex flex-col gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.05] p-4"
        >
          <p className="line-clamp-5 font-instrument text-xl leading-snug text-white/70">
            {idea}
          </p>
        </div>
        {layout.columns.map((c) => (
          <div key={c.id}>
            <div
              style={place(c.header)}
              className="absolute rounded-xl border border-dashed border-white/25"
            />
            {c.rows.map((r) => (
              <div
                key={r.id}
                style={place(r.box)}
                className="absolute rounded-xl border border-dashed border-white/20"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder nodes for the drafting ghost: four axes, three leaves each. */
export function ghostNodes(): HuntNode[] {
  const base = {
    rationale: "",
    provider: "elevenlabs" as const,
    technique: [],
    prompt: "",
    negative: null,
    durationS: 0,
    loop: null,
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    tempoBpm: null,
    key: null,
    state: "idea" as const,
    takeIds: [],
    winner: false,
    error: null,
  };
  return [0, 1, 2, 3].flatMap((a) => [
    { ...base, id: `g${a}`, parentId: null, axis: `axis ${a}`, label: "" },
    ...[0, 1, 2].map((l) => ({
      ...base,
      id: `g${a}-${l}`,
      parentId: `g${a}`,
      axis: `axis ${a}`,
      label: "",
    })),
  ]);
}
