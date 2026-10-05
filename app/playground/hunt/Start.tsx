"use client";

// WHERE A HUNT BEGINS — a problem in the operator's own words, handed to the
// text engine to split into axes and concrete prompts; and the hunts already
// run, each drawn as its own map in miniature so a past search is recognised
// by its shape and its outcome (crowned leaves glow emerald) before its words
// are read.

import { useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { BookCheck, Compass, Crown } from "lucide-react";

import { Tally } from "@/components/ui/signal";
import { Panel } from "@/components/ui/Primitives";
import { EASE } from "@/components/ui/tokens";
import type { Hunt, SoundKind } from "@/lib/sound/types";

import { ago } from "../shared/format";
import { ErrorLine } from "../shared/shell";
import { BTN, BTN_CYAN, CAPS } from "../shared/ui";
import { GhostMap, ghostNodes } from "./Board";
import { IDEA_EXAMPLE, buildTree, countsOf, layoutTree } from "./model";
import type { HuntApi } from "./useHunt";

export function Start({
  api,
  kind,
  onOpen,
}: {
  api: HuntApi;
  kind: SoundKind;
  onOpen: (h: Hunt) => void;
}) {
  const [idea, setIdea] = useState("");
  const d = api.drafting;
  const go = async () => {
    const text = idea.trim();
    if (!text || d) return;
    const h = await api.draft(text);
    if (h) {
      setIdea("");
      onOpen(h);
    }
  };

  return (
    <div className="grid gap-6">
      <Panel as="section" className="grid gap-4 p-6">
        <h2 className="sr-only">New hunt</h2>
        <label className="grid gap-2">
          <span className={CAPS}>
            {kind === "sfx" ? "the effect you need" : "the music you need"}
          </span>
          <textarea
            value={d && !d.error ? d.idea : idea}
            disabled={!!d && !d.error}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void go();
            }}
            rows={2}
            placeholder={IDEA_EXAMPLE[kind]}
            className="w-full resize-none bg-transparent font-instrument text-3xl leading-snug text-white placeholder:text-white/25 focus:outline-none disabled:text-white/60"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 border-t border-white/6 pt-4">
          <button
            type="button"
            onClick={() => void go()}
            disabled={!idea.trim() || (!!d && !d.error)}
            className={`${BTN_CYAN} ${d && !d.error ? "animate-pulse" : ""}`}
          >
            <Compass className="h-4 w-4" aria-hidden />
            {d && !d.error ? "drafting the map…" : "draft the map"}
          </button>
          <span className="font-jetbrains text-label text-white/35">
            text engine · 0s of audio
          </span>
          <kbd className="ml-auto font-jetbrains text-label text-white/30">
            ctrl ↵
          </kbd>
        </div>
        {d?.error && (
          <div className="flex flex-wrap items-center gap-3">
            <ErrorLine text={d.error} />
            <button type="button" onClick={api.clearDrafting} className={BTN}>
              dismiss
            </button>
          </div>
        )}
      </Panel>

      {d && !d.error ? (
        <Panel className="overflow-hidden p-4">
          <GhostMap tree={buildTree(ghostNodes())} idea={d.idea} />
        </Panel>
      ) : (
        <PastHunts hunts={api.hunts ?? []} onOpen={onOpen} />
      )}
    </div>
  );
}

function PastHunts({
  hunts,
  onOpen,
}: {
  hunts: Hunt[];
  onOpen: (h: Hunt) => void;
}) {
  const reduce = useReducedMotion();
  const sorted = [...hunts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const [now] = useState(() => Date.now());
  return (
    <section aria-label="Hunts" className="grid gap-3">
      <div className="flex items-center gap-3">
        <span className={CAPS}>hunts</span>
        <Tally value={hunts.length} tone="neutral" />
      </div>
      {sorted.length === 0 ? (
        // Absence drawn as the thing that will fill it: three hunt cards in
        // outline, each carrying a map silhouette, never one empty box
        // (r3 live capture: a bare dashed rectangle read as a hole).
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
          <p className="sr-only">no hunts yet</p>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="grid gap-3 rounded-2xl border border-dashed border-white/25 p-4 opacity-60">
              <GhostMini />
              <span className="h-5 w-3/4 rounded-md bg-white/[0.06]" />
              <span className="flex gap-1.5">
                <span className="h-6 w-24 rounded-md border border-white/10" />
                <span className="h-6 w-16 rounded-md border border-white/10" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(22rem,1fr))]">
          {sorted.map((h, i) => {
            const c = countsOf(h);
            return (
              <motion.button
                key={h.id}
                type="button"
                onClick={() => onOpen(h)}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  ease: EASE,
                  delay: reduce ? 0 : Math.min(0.3, i * 0.04),
                }}
                className="group grid cursor-pointer gap-3 rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-4 text-left transition hover:border-white/18 hover:bg-white/[0.04]"
              >
                <MiniMap hunt={h} />
                <p className="line-clamp-2 font-instrument text-xl leading-snug text-white/90 group-hover:text-white">
                  {h.idea}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tally
                    value={c.rendered}
                    of={c.leaves}
                    label="heard"
                    tone={c.rendered ? "cyan" : "neutral"}
                  />
                  {c.winners > 0 && (
                    <Tally value={c.winners} label="won" tone="emerald" />
                  )}
                  {c.awaiting > 0 && (
                    <Tally value={c.awaiting} label="suno" tone="amber" />
                  )}
                  {c.failed > 0 && (
                    <Tally value={c.failed} label="failed" tone="rose" />
                  )}
                  {h.lessonId && (
                    <BookCheck
                      className="h-4 w-4 text-emerald-300/80"
                      aria-label="lesson saved"
                    />
                  )}
                  <span className="ml-auto font-jetbrains text-label text-white/35">
                    {ago(h.createdAt, now)}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** A map's silhouette at thumbnail size — the shape a first hunt will take. */
function GhostMini() {
  const l = layoutTree(buildTree(ghostNodes()), 3);
  return (
    <svg viewBox={`0 0 ${l.width} ${l.height}`} preserveAspectRatio="xMidYMid meet" className="h-32 w-full rounded-xl bg-white/[0.02]">
      {l.edges.map((e) => (
        <path key={e.id} d={e.d} fill="none" strokeWidth={6} strokeDasharray="12 14" className="stroke-white/25" />
      ))}
      <rect x={l.root.x} y={l.root.y} width={l.root.w} height={l.root.h} rx={22} fill="none" strokeWidth={5} strokeDasharray="14 12" className="stroke-cyan-300/40" />
      {l.columns.map((c) => (
        <g key={c.id}>
          {[c.header, ...c.rows.map((r) => r.box)].map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={16} fill="none" strokeWidth={5} strokeDasharray="14 12" className="stroke-white/30" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The hunt's own map, shrunk to a thumbnail: the same layout, cards as tiles
 *  tinted by what happened to them. */
function MiniMap({ hunt }: { hunt: Hunt }) {
  const tree = buildTree(hunt.nodes);
  const l = layoutTree(tree, 3);
  const byId = new Map(hunt.nodes.map((n) => [n.id, n] as const));
  return (
    <svg
      viewBox={`0 0 ${l.width} ${l.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${tree.leaves.length} leaves on ${tree.columns.length} axes`}
      className="h-32 w-full rounded-xl bg-white/[0.02]"
    >
      {l.edges.map((e) => (
        <path
          key={e.id}
          d={e.d}
          fill="none"
          strokeWidth={6}
          className="stroke-white/15"
        />
      ))}
      <rect
        x={l.root.x}
        y={l.root.y}
        width={l.root.w}
        height={l.root.h}
        rx={22}
        className="fill-cyan-400/20 stroke-cyan-300/40"
        strokeWidth={4}
      />
      {l.columns.map((c) => (
        <g key={c.id}>
          <rect
            x={c.header.x}
            y={c.header.y}
            width={c.header.w}
            height={c.header.h}
            rx={16}
            className="fill-white/[0.07]"
          />
          {c.rows.map((r) => {
            const n = byId.get(r.id);
            const tone = n?.winner
              ? "fill-emerald-300/70"
              : n?.state === "rendered"
                ? "fill-cyan-300/40"
                : n?.state === "awaiting-return"
                  ? "fill-amber-300/35"
                  : n?.state === "failed"
                    ? "fill-rose-400/35"
                    : "fill-white/[0.08]";
            return (
              <rect
                key={r.id}
                x={r.box.x}
                y={r.box.y}
                width={r.box.w}
                height={r.box.h}
                rx={16}
                className={tone}
              />
            );
          })}
        </g>
      ))}
      {tree.leaves.some((n) => n.winner) && (
        <Crown
          x={l.root.x + 24}
          y={l.root.y + 24}
          width={56}
          height={56}
          className="text-emerald-300"
          aria-hidden
        />
      )}
    </svg>
  );
}
