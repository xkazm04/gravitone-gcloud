"use client";

// ONE CARD = ONE VERSION STACK (model.ts). Its face is the head: play, the
// measured waveform, provider, mean score, terms, and what its stage asks of
// the operator — the Suno round trip in remaster / edit, the library label in
// finalized. Under it, when opened, every earlier version, each playable, and
// switching between them while one plays keeps the position (player.ts#ab):
// that is the A/B a remaster is judged by.

import { useEffect, useRef, useState } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Layers, Move, Pause, Play, Repeat, Tag } from "lucide-react";

import { EASE } from "@/components/ui/tokens";
import { STAGES, type SoundTake, type Stage } from "@/lib/sound/types";

import { cellKey, cellOf, rowWord, sameCell, STAGE_WORD, versionNumber, type Cell, type Row, type Stack } from "./model";
import { ProviderChip, TermChips } from "@/app/playground/shared/Chips";
import { lengthWord, takeSeconds } from "@/app/playground/shared/format";
import { useMeasureOnOpen } from "@/app/playground/shared/measure";
import { ScoreMeter } from "@/app/playground/shared/Rubric";
import { transport, usePlayState } from "@/app/playground/shared/transport";
import { PlayButton, TakeWave } from "@/app/playground/shared/Wave";

import { when } from "./parts";
import { CAPS_BARE as CAPS } from "@/app/playground/shared/ui";
import { RoundTrip } from "./RoundTrip";

export interface CardProps {
  stack: Stack;
  /** Cards per cell, for the move map. */
  counts: ReadonlyMap<string, number>;
  rows: readonly Row[];
  busy: boolean;
  /** Being dragged, or waiting in the finalized column for its label. */
  away: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>, s: Stack) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>, s: Stack) => void;
  onMove: (s: Stack, to: Cell) => void;
  onFile: (s: Stack, file: File, to: Stage, label?: string | null) => Promise<boolean>;
  /** A take measured on first sight (shared/measure.ts) comes back with peaks. */
  onStored: (t: SoundTake) => void;
  mapOpen: boolean;
  setMapOpen: (open: boolean) => void;
  versionsOpen: boolean;
  setVersionsOpen: (open: boolean) => void;
}

export function Card({
  stack,
  counts,
  rows,
  busy,
  away,
  onPointerDown,
  onKeyDown,
  onMove,
  onFile,
  mapOpen,
  setMapOpen,
  versionsOpen,
  setVersionsOpen,
  onStored,
}: CardProps) {
  const h = stack.head;
  const { measuring } = useMeasureOnOpen(h, onStored);
  const here = cellOf(stack);
  const reduce = useReducedMotion();
  const n = stack.versions.length;
  const sfx = h.kind === "sfx";
  return (
    <motion.article
      data-card={stack.rootId}
      tabIndex={0}
      aria-roledescription="card"
      aria-label={`${h.title}, ${STAGE_WORD[here.stage]} · ${rowWord(here.group)}${n > 1 ? `, ${n} versions` : ""}${h.label ? `, label ${h.label}` : ""}`}
      aria-busy={busy}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      // Opacity is motion's (an inline style), so "away" is set here, not as a class.
      animate={{ opacity: away ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      onPointerDown={(e) => onPointerDown(e, stack)}
      onKeyDown={(e) => onKeyDown(e, stack)}
      className={`group/card relative cursor-grab select-none rounded-xl border p-3 outline-none transition-[border-color,background-color,opacity] focus-visible:border-cyan-300/60 focus-visible:shadow-[0_0_0_1px] focus-visible:shadow-cyan-300/40 active:cursor-grabbing ${
        away ? "border-dashed border-white/15 bg-white/[0.01]" : "border-white/8 bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.05]"
      } ${busy ? "animate-pulse" : ""}`}
    >
      <div className="flex items-start gap-3">
        <PlayButton take={h} />
        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-2 font-instrument text-xl leading-tight text-white/90">
            <span className="truncate">{h.title}</span>
            {sfx && h.loop && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.06] px-1.5 py-0.5 text-cyan-200/90">
                <Repeat className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">loop</span>
              </span>
            )}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <ProviderChip provider={h.provider} />
            <ScoreMeter take={h} />
            <span className="font-jetbrains text-label tabular-nums text-white/40">{lengthWord(h.kind, takeSeconds(h))}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {n > 1 && (
            <button
              type="button"
              data-nodrag
              aria-expanded={versionsOpen}
              aria-label={`${n} versions of ${h.title}`}
              onClick={() => setVersionsOpen(!versionsOpen)}
              className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border px-2 font-jetbrains text-label transition ${
                versionsOpen ? "border-cyan-300/45 bg-cyan-300/10 text-cyan-100" : "border-white/12 text-white/60 hover:border-white/25 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden />v{n}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              data-nodrag
              aria-haspopup="dialog"
              aria-expanded={mapOpen}
              aria-label={`Move ${h.title} to…`}
              onClick={() => setMapOpen(!mapOpen)}
              className={`grid h-8 w-8 cursor-pointer place-items-center rounded-full border transition ${
                mapOpen ? "border-cyan-300/45 bg-cyan-300/10 text-cyan-100" : "border-transparent text-white/40 hover:border-white/15 hover:text-white/80"
              }`}
            >
              <Move className="h-4 w-4" aria-hidden />
            </button>
            {mapOpen && <MoveMap title={h.title} here={here} rows={rows} counts={counts} onPick={(c) => onMove(stack, c)} onClose={() => setMapOpen(false)} />}
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <TakeWave take={h} bars={sfx ? 40 : 64} height={sfx ? "h-8" : "h-10"} measuring={measuring} />
      </div>
      <div className="mt-1.5">
        {/* One of each facet: a board card has one line for terms, and the
            first of each list is the one the brief led with. */}
        <TermChips
          terms={{ ...h.terms, genre: h.terms.genre.slice(0, 1), mood: h.terms.mood.slice(0, 1), instrument: h.terms.instrument.slice(0, 1) }}
          kind={h.kind}
        />
      </div>

      {here.stage === "finalized" && (
        <p className="mt-2.5 flex min-w-0 items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-2.5 py-1.5">
          <Tag className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
          {h.label ? (
            <span className="truncate font-hanken text-label text-emerald-100">{h.label}</span>
          ) : (
            <span className="font-jetbrains text-label text-amber-200/80">no label</span>
          )}
        </p>
      )}
      {(here.stage === "remaster" || here.stage === "edit") && (
        <RoundTrip stack={stack} stage={here.stage} busy={busy} onFile={(f, to, label) => onFile(stack, f, to, label)} />
      )}
      {versionsOpen && n > 1 && <Versions stack={stack} />}
    </motion.article>
  );
}

/** The stack, newest first. Pressing play on another version while one of
 *  this stack plays SWITCHES at the same position rather than restarting. */
function Versions({ stack }: { stack: Stack }) {
  const st = usePlayState();
  const playingHere = !!st?.playing && stack.versions.some((v) => v.id === st.id);
  return (
    <ol data-nodrag aria-label={`Versions of ${stack.head.title}`} className="mt-3 space-y-1.5 border-t border-white/6 pt-2.5">
      {stack.versions.map((v) => {
        const vn = versionNumber(stack, v.id);
        const on = st?.id === v.id && st.playing;
        const swap = playingHere && !on;
        return (
          <li key={v.id} className={`grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-1.5 py-1 ${on ? "bg-cyan-300/[0.06]" : ""}`}>
            <VersionPlay take={v} vn={vn ?? 0} on={on} swap={swap} />
            <span className="min-w-[7.5rem]">
              <span className={`font-jetbrains text-label ${v.id === stack.head.id ? "text-cyan-200" : "text-white/70"}`}>v{vn}</span>
              <span className="ml-2 font-jetbrains text-label text-white/40">{v.origin === "suno-return" ? "suno" : v.provider}</span>
              <span className="block font-jetbrains text-label tabular-nums text-white/30">
                {when(v.createdAt)} · {lengthWord(v.kind, takeSeconds(v))}
              </span>
            </span>
            <TakeWave take={v} bars={36} height="h-7" />
          </li>
        );
      })}
    </ol>
  );
}

function VersionPlay({ take, vn, on, swap }: { take: SoundTake; vn: number; on: boolean; swap: boolean }) {
  return (
    <button
      type="button"
      disabled={!take.file}
      onClick={() =>
        swap ? transport.play(take.id, transport.getSnapshot()?.position ?? 0, take.durationS) : transport.toggle(take.id, take.durationS)
      }
      aria-label={swap ? `Switch to v${vn} at the same position` : `${on ? "Pause" : "Play"} v${vn}`}
      aria-pressed={on}
      className={`grid h-8 min-w-8 cursor-pointer place-items-center rounded-full border px-2 font-jetbrains text-label transition disabled:opacity-30 ${
        on
          ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100"
          : swap
            ? "border-cyan-300/30 text-cyan-200/90 hover:bg-cyan-300/10"
            : "border-white/15 text-white/70 hover:border-cyan-300/40 hover:text-cyan-100"
      }`}
    >
      {on ? <Pause className="h-3.5 w-3.5" aria-hidden /> : swap ? "A/B" : <Play className="ml-0.5 h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}

/* ── move to… ──────────────────────────────────────────────────────────── */

const SHORT: Record<Stage, string> = { pending: "pend", remaster: "rem", edit: "edit", finalized: "fin" };

/**
 * The board in miniature: one button per cell, the card's own cell lit. The
 * keyboard path that does not need the drag — arrows walk the map, Enter
 * moves, Escape closes and hands focus back to the card.
 */
export function MoveMap({
  title,
  here,
  rows,
  counts,
  onPick,
  onClose,
}: {
  title: string;
  here: Cell;
  rows: readonly Row[];
  counts: ReadonlyMap<string, number>;
  onPick: (c: Cell) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<[number, number]>(() => [Math.max(0, rows.findIndex((r) => r.name === here.group)), STAGES.indexOf(here.stage)]);
  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>(`[data-at="${at[0]}-${at[1]}"]`)?.focus();
  }, [at]);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);
  const back = () => {
    onClose();
    (box.current?.closest("[data-card]") as HTMLElement | null)?.focus();
  };
  return (
    <div
      ref={box}
      data-nodrag
      role="dialog"
      aria-label={`Move ${title} to…`}
      onKeyDown={(e) => {
        const [r, c] = at;
        const go = (nr: number, nc: number) => {
          e.preventDefault();
          e.stopPropagation();
          setAt([Math.max(0, Math.min(rows.length - 1, nr)), Math.max(0, Math.min(STAGES.length - 1, nc))]);
        };
        if (e.key === "ArrowUp") go(r - 1, c);
        else if (e.key === "ArrowDown") go(r + 1, c);
        else if (e.key === "ArrowLeft") go(r, c - 1);
        else if (e.key === "ArrowRight") go(r, c + 1);
        else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          back();
        } else if (e.key === "Tab") {
          e.preventDefault();
        } else e.stopPropagation();
      }}
      className="absolute right-0 top-10 z-30 w-[22rem] rounded-xl border border-white/12 bg-[var(--gt-ink)]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(4,3.25rem)] items-center gap-1">
        <span className={`${CAPS} text-white/35`}>move</span>
        {STAGES.map((s) => (
          <span key={s} className={`${CAPS} text-center text-white/45`}>
            {SHORT[s]}
          </span>
        ))}
        {rows.map((row, ri) => (
          <div key={row.key} className="contents">
            <span className={`truncate pr-1 font-hanken text-label ${row.name === null ? "text-white/40" : "text-white/75"}`}>{rowWord(row.name)}</span>
            {STAGES.map((s, ci) => {
              const c: Cell = { stage: s, group: row.name };
              const cur = sameCell(c, here);
              const n = counts.get(cellKey(c)) ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  data-at={`${ri}-${ci}`}
                  tabIndex={at[0] === ri && at[1] === ci ? 0 : -1}
                  aria-current={cur ? "true" : undefined}
                  aria-label={`${STAGE_WORD[s]} · ${rowWord(row.name)}, ${n} card${n === 1 ? "" : "s"}${cur ? " (here)" : ""}`}
                  onFocus={() => setAt([ri, ci])}
                  onClick={() => {
                    if (!cur) onPick(c);
                    back();
                  }}
                  className={`h-8 cursor-pointer rounded-md border font-jetbrains text-label text-white/45 transition focus-visible:outline-2 focus-visible:outline-offset-1 ${
                    cur
                      ? "border-cyan-300/60 bg-cyan-300/25"
                      : s === "finalized"
                        ? "border-emerald-400/15 bg-emerald-400/[0.04] hover:bg-emerald-400/15"
                        : s === "remaster" || s === "edit"
                          ? "border-amber-300/15 bg-amber-300/[0.03] hover:bg-amber-300/12"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                  }`}
                >
                  {n > 0 ? n : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
