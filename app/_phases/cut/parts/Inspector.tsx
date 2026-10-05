"use client";

// THE INSPECTOR — the selected block, as the work it stands for: its span, its
// state and why, the line or cue purpose verbatim, and the step that owns it.
// A music cue is where a take is loaded for this session: a file from disk,
// played against the cue's span by the clock. Not persisted — see SessionTake.

import { useId } from "react";

import { ArrowUpRight, Music, X } from "lucide-react";

import { CHIP_CLASS, Ghost, TALLY_TONE } from "@/components/ui/signal";

import { FrameCanvas } from "../../frames/parts";
import { drawnStart } from "../offsets";
import { useCutCtx } from "../useCut";

const LANE_WORD = { video: "picture", vo: "voice", music: "music" } as const;

export function Inspector({ className = "" }: { className?: string }) {
  const { cut, selected, select, offsets, takes, attachTake, detachTake, openStep, clock } = useCutCtx();
  const fileId = useId();

  if (!selected)
    return (
      <section className={`rounded-2xl border border-white/8 bg-white/[0.02] p-4 ${className}`} aria-label="Inspector">
        <Ghost shape="card" label="no block selected" />
      </section>
    );

  const c = selected;
  const from = drawnStart(offsets, c);
  const frame = c.track !== "music" ? cut.frames[c.ref] : undefined;
  const take = c.track === "music" ? takes[c.ref] : undefined;

  return (
    <section
      className={`rounded-2xl border border-white/8 bg-white/[0.02] p-4 ${className}`}
      aria-label="Inspector"
      data-testid="cut-inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-jetbrains text-label tracking-[0.14em] text-white/45 uppercase">{LANE_WORD[c.track]}</p>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="Clear selection"
          className="text-white/40 transition hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <h3 className="font-instrument mt-1 text-xl leading-snug text-white">{c.label}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => clock.seek(from)}
          className="font-jetbrains rounded border border-white/12 px-1.5 text-label text-white/75 tabular-nums transition hover:bg-white/5"
        >
          {from.toFixed(2)}s → {(from + c.durS).toFixed(2)}s
        </button>
        <span
          className={`${CHIP_CLASS} ${TALLY_TONE[c.status === "missing" ? "rose" : c.status === "drift" ? "amber" : "emerald"]}`}
        >
          {c.status === "missing" ? (c.why ?? "missing") : c.status === "drift" ? "drift" : "placed"}
        </span>
      </div>

      {frame && c.track === "video" && <FrameCanvas frame={frame} className="mt-3" />}
      {c.note && c.note !== c.label && (
        <p className="font-hanken mt-3 text-content leading-snug text-white/75">{c.note}</p>
      )}

      {c.track === "music" && cut.origin === "project" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {take ? (
            <>
              <span className="font-jetbrains inline-flex min-w-0 items-center gap-1.5 text-label text-cyan-200/90">
                <Music className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{take.name}</span>
                {take.durationS !== null && <span className="text-white/40">· {take.durationS.toFixed(1)}s</span>}
              </span>
              <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>session</span>
              <button
                type="button"
                onClick={() => detachTake(c.ref)}
                className="font-jetbrains text-label text-white/45 transition hover:text-white"
              >
                unload
              </button>
            </>
          ) : (
            <label
              htmlFor={fileId}
              className="font-jetbrains inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cyan-400/30 px-2.5 py-1 text-label text-cyan-200 transition hover:bg-cyan-400/10"
            >
              <Music className="h-3.5 w-3.5" aria-hidden />
              load take
              <input
                id={fileId}
                type="file"
                accept="audio/*"
                className="sr-only"
                data-testid="take-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void attachTake(c.ref, f);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => openStep(c.owner)}
        className="font-jetbrains mt-4 inline-flex items-center gap-1 text-label text-white/55 transition hover:text-white"
      >
        {c.owner}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </section>
  );
}
