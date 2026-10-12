"use client";

// "MOVE TO…" — the board in miniature, for the hand that can point but cannot
// hold a drag and the one that cannot point at all.
//
// One button per cell (lanes down, columns across), the card's own cell marked,
// every other cell lit by what the authority said about moving there — asked
// once, when the map opens, through the same `buildVerdicts` the drag uses. A
// cell the authority refuses is dimmed but NOT inert: choosing it puts the
// authority's own reason on screen, because a control that does nothing when
// pressed is indistinguishable from a broken one.
//
// Generalised from app/playground/arrange/Card.tsx#MoveMap (a role="dialog"
// arrow-key grid with Escape and outside-pointer close), re-keyed to the layout
// rather than to a stage x group model, and fixed-positioned beside the card.
// It is NOT modal: the canvas behind it stays readable and `overlayOpen()` does
// not count it, so a map cannot be mistaken for a dialog interrupting a drag.

import { useEffect, useRef, useState } from "react";

import { refusedKey } from "../keyGuard";
import type { Layout } from "./geometry";
import type { Verdicts } from "./moves";
import { STAGE_TONE } from "./tone";
import type { CanonStage } from "@/lib/board/pipeline";

const CELL: Record<string, string> = {
  home: "border-white/40 bg-white/15 text-white",
  ok: "border-cyan-300/35 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/25",
  needs: "border-violet-300/40 bg-violet-300/10 text-violet-100 hover:bg-violet-300/25",
  refused: "border-white/10 bg-white/[0.03] text-white/35 hover:bg-white/10",
};

export default function MoveMap({
  layout,
  id,
  verdicts,
  names,
  x,
  y,
  onPick,
  onClose,
}: {
  layout: Layout;
  id: string;
  verdicts: Verdicts;
  names: Partial<Record<CanonStage, string>>;
  x: number;
  y: number;
  onPick: (lane: number, col: number) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const own = layout.slotOf.get(id);
  const title = layout.entryOf.get(id)?.item.title ?? "";
  const nC = layout.columns.length;
  const [at, setAt] = useState<[number, number]>([own?.lane ?? 0, own?.col ?? 0]);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>(`[data-at="${at[0]}-${at[1]}"]`)?.focus();
  }, [at]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const W = Math.min(typeof window === "undefined" ? 640 : window.innerWidth - 16, 168 + nC * 60 + 32);
  const left = typeof window !== "undefined" && x + W > window.innerWidth ? Math.max(8, window.innerWidth - W - 8) : x;
  const top = typeof window !== "undefined" && y + 320 > window.innerHeight ? Math.max(8, window.innerHeight - 336) : y;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (refusedKey(e)) return;
    const [r, c] = at;
    const go = (nr: number, nc: number) => {
      e.preventDefault();
      e.stopPropagation();
      setAt([Math.max(0, Math.min(layout.lanes.length - 1, nr)), Math.max(0, Math.min(nC - 1, nc))]);
    };
    if (e.key === "ArrowUp") go(r - 1, c);
    else if (e.key === "ArrowDown") go(r + 1, c);
    else if (e.key === "ArrowLeft") go(r, c - 1);
    else if (e.key === "ArrowRight") go(r, c + 1);
    else if (e.key === "Home") go(r, 0);
    else if (e.key === "End") go(r, nC - 1);
    else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else e.stopPropagation();
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Move ${title} to…`}
      onKeyDown={onKeyDown}
      style={{ left, top, width: W }}
      className="gt-float fixed z-40 max-h-[60vh] overflow-auto rounded-xl border border-white/12 bg-[var(--gt-ink)]/95 p-3 backdrop-blur-xl"
    >
      <div className="grid items-center gap-1" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${nC}, 3.5rem)` }}>
        <span aria-hidden />
        {layout.columns.map((c) => (
          <span key={c.index} className={`font-jetbrains truncate text-center text-label ${STAGE_TONE[c.stage].head}`}>
            {c.band ? c.label : (names[c.stage] ?? c.stage).slice(0, 4)}
          </span>
        ))}
        {layout.lanes.map((lane) => (
          <div key={lane.key} className="contents">
            <span className="font-hanken truncate pr-1 text-label text-white/75">{lane.label || "·"}</span>
            {layout.columns.map((c) => {
              const v = verdicts.verdictFor(lane.index, c.index);
              const n = layout.ids[lane.index * nC + c.index].length;
              const here = own?.lane === lane.index && own.col === c.index;
              const word = here
                ? "here"
                : v.kind === "ok"
                  ? "move here"
                  : v.kind === "needs"
                    ? `needs ${v.need}`
                    : v.kind === "refused"
                      ? `not allowed: ${v.reason}`
                      : "here";
              return (
                <button
                  key={c.index}
                  type="button"
                  data-at={`${lane.index}-${c.index}`}
                  tabIndex={at[0] === lane.index && at[1] === c.index ? 0 : -1}
                  aria-current={here ? "true" : undefined}
                  aria-label={`${names[c.stage] ?? c.stage}${c.band ? ` · ${c.label}` : ""} · ${lane.label || "board"}, ${n} cards, ${word}`}
                  onFocus={() => setAt([lane.index, c.index])}
                  onClick={() => {
                    if (!here) onPick(lane.index, c.index);
                    else onClose();
                  }}
                  className={`font-jetbrains h-10 cursor-pointer rounded-md border text-label transition focus-visible:outline-2 focus-visible:outline-offset-1 ${CELL[here ? "home" : v.kind]}`}
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
