"use client";

// One beat of the cut, editable in place.
//
// The label and the text are the creator's; they are held locally while typing
// and pushed to the cut on blur or after a short pause, so the checker at the
// foot of the page does not re-run on every keystroke. The rung's raised
// variables are not debounced — a chip toggle is a decision, and the finding
// it changes should change with it.

import { useEffect, useRef, useState } from "react";

import RaisesChips from "./RaisesChips";
import type { BeatPatch } from "./cut";
import type { RaisedVariable, TrailerBeat, TrailerBeatKind } from "./types";

const KIND_CLS: Partial<Record<TrailerBeatKind, string>> = {
  "cold-open": "text-cyan-200",
  peak: "text-violet-200",
  reset: "text-amber-200",
  rung: "text-emerald-300/90",
};

const DEBOUNCE_MS = 400;

export default function BeatEditor({
  beat,
  isRung,
  previousRaise,
  onPatch,
}: {
  beat: TrailerBeat;
  /** Escalation-role beats carry the raised-variable field. */
  isRung: boolean;
  previousRaise: RaisedVariable | null;
  onPatch: (patch: BeatPatch) => void;
}) {
  const [label, setLabel] = useState(beat.label);
  const [text, setText] = useState(beat.text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ label, text });
  const flushRef = useRef<() => void>(() => {});

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const { label: l, text: t } = latest.current;
    const patch: BeatPatch = {};
    if (l !== beat.label) patch.label = l;
    if (t !== beat.text) patch.text = t;
    if (Object.keys(patch).length) onPatch(patch);
  };

  // Refs are written after render, never during it — the compiler lint reads a
  // render-time ref write as a bug, and here it would also be one: the blur
  // handler that reads them fires after commit anyway.
  useEffect(() => {
    latest.current = { label, text };
    flushRef.current = flush;
  });

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, DEBOUNCE_MS);
  };

  // A pending edit is flushed on unmount rather than lost.
  useEffect(() => () => { if (timer.current) flushRef.current(); }, []);

  return (
    <div data-testid={`tbeat-${beat.id}`} className="grid grid-cols-[3.2rem_1fr] gap-3">
      <span className="font-jetbrains pt-1.5 text-[11px] text-white/30">{beat.at}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-jetbrains rounded border border-white/10 px-1.5 py-0.5 text-[10px] tracking-[0.14em] uppercase ${KIND_CLS[beat.kind] ?? "text-white/45"}`}
          >
            {beat.kind}
          </span>
          <input
            aria-label="beat label"
            value={label}
            onChange={(e) => { setLabel(e.target.value); schedule(); }}
            onBlur={flush}
            className="font-jetbrains min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[11px] tracking-[0.1em] text-white/80 placeholder:text-white/25"
            placeholder="label"
          />
          {beat.spends?.length ? (
            <span className="font-jetbrains text-[10px] text-amber-200/70">spends {beat.spends.join(", ")}</span>
          ) : null}
        </div>
        <textarea
          aria-label="beat text"
          data-testid={`tbeat-text-${beat.id}`}
          value={text}
          rows={3}
          onChange={(e) => { setText(e.target.value); schedule(); }}
          onBlur={flush}
          className="font-hanken mt-1.5 w-full resize-y rounded-lg border border-white/12 bg-white/[0.03] px-2.5 py-1.5 text-[14px] leading-relaxed text-slate-200 placeholder:text-white/25"
          placeholder="what is on screen"
        />
        {isRung && (
          <RaisesChips
            beatId={beat.id}
            value={beat.raises ?? []}
            previous={previousRaise}
            onChange={(raises) => onPatch({ raises })}
          />
        )}
      </div>
    </div>
  );
}
