"use client";

// ASSEMBLY — the cut as a production ledger.
//
// Metaphor: a shot list on a wall. One row per scene, and the columns are the
// three layers, so the eye reads DOWN a column and finds every frame still
// missing a plate, not across a row and finds one frame. On a sixteen-frame cut
// the real question is "what is not done", and neither a band nor a canvas
// answers it without scrolling.
//
// Rows carry the beat's own title and its breakdown, and expand in place to
// show the composite — so the sequence view and the standalone view are the
// same view at two densities, rather than two screens.
//
// It also does the thing neither sibling can: RENDER EVERY MISSING PLATE in one
// action, serially, because sixteen clicks is not a workflow.

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";

import { durationOf, isComposed, type Frame } from "./frames";
import { FrameCanvas, KindChip, LayerBreakdown } from "./parts";
import type { useFrames } from "./useFrames";

export default function FramesAssembly({ ctl }: { ctl: ReturnType<typeof useFrames> }) {
  const { frames, render, busy, generatePlate, setSubject, totalCost } = ctl;
  const [openId, setOpenId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);

  const missing = frames.filter((f) => !isComposed(f));

  /** Serial, not parallel: the vendor's rate ceiling is unpublished and a
   *  sixteen-wide burst is exactly how you find it. */
  const renderMissing = async () => {
    setRunningAll(true);
    for (const f of frames) if (!isComposed(f)) await generatePlate(f.id);
    setRunningAll(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-jetbrains text-[12px] text-white/50">
          {frames.length - missing.length}/{frames.length} composed
          {totalCost > 0 && <span className="text-white/30"> · ${totalCost.toFixed(3)} spent</span>}
        </p>
        <button
          onClick={() => void renderMissing()}
          disabled={runningAll || missing.length === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
        >
          {runningAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {runningAll ? "rendering…" : `render ${missing.length} missing plate${missing.length === 1 ? "" : "s"}`}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/8">
        <div className="font-jetbrains grid grid-cols-[52px_1fr_150px_120px_86px] gap-2 border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">
          <span>at</span>
          <span>scene</span>
          <span>breakdown</span>
          <span>plate</span>
          <span className="text-right">holds</span>
        </div>

        {frames.map((f, i) => (
          <Row
            key={f.id}
            frame={f}
            index={i}
            holdS={durationOf(frames, i, render.durationS)}
            open={openId === f.id}
            busy={busy.has(f.id)}
            onToggle={() => setOpenId(openId === f.id ? null : f.id)}
            onRender={() => void generatePlate(f.id)}
            onSubject={(v) => setSubject(f.id, v)}
          />
        ))}
      </div>
    </div>
  );
}

const PLATE_WORD: Record<string, { word: string; cls: string }> = {
  ready: { word: "rendered", cls: "text-cyan-300" },
  generating: { word: "rendering", cls: "text-cyan-300/60" },
  refused: { word: "refused", cls: "text-rose-300" },
  empty: { word: "—", cls: "text-white/25" },
};

function Row({
  frame,
  index,
  holdS,
  open,
  busy,
  onToggle,
  onRender,
  onSubject,
}: {
  frame: Frame;
  index: number;
  holdS: number;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onRender: () => void;
  onSubject: (v: string) => void;
}) {
  const plate = PLATE_WORD[frame.plate.state];
  return (
    <div className={`border-b border-white/6 last:border-0 ${open ? "bg-white/[0.02]" : ""}`}>
      <div className="grid grid-cols-[52px_1fr_150px_120px_86px] items-center gap-2 px-3 py-2">
        <button onClick={onToggle} className="flex items-center gap-1 text-left">
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
          )}
          <span className="font-jetbrains text-[11px] text-white/55">{frame.at}</span>
        </button>

        <button onClick={onToggle} className="flex min-w-0 items-center gap-2 text-left">
          <span className="font-jetbrains w-5 shrink-0 text-[10px] text-white/25">{String(index + 1).padStart(2, "0")}</span>
          <span className="font-hanken truncate text-[13px] text-white/85">{frame.title}</span>
          <KindChip kind={frame.kind} />
        </button>

        <LayerBreakdown frame={frame} compact />

        <span className={`font-jetbrains text-[11px] ${plate.cls}`}>{plate.word}</span>

        <span className="font-jetbrains text-right text-[11px] text-white/35">{holdS}s</span>
      </div>

      {open && (
        <div className="grid gap-4 px-3 pb-4 lg:grid-cols-[1fr_300px]">
          <FrameCanvas frame={frame} />
          <div className="space-y-2.5">
            <p className="font-hanken text-[13px] leading-snug text-slate-400">&ldquo;{frame.line}&rdquo;</p>
            {frame.device && (
              <p className="font-jetbrains text-[10px] text-white/35">device · {frame.device}</p>
            )}
            <div>
              <p className="font-jetbrains mb-1 text-[10px] tracking-[0.14em] text-white/40 uppercase">plate subject</p>
              <textarea
                value={frame.plate.subject ?? ""}
                onChange={(e) => onSubject(e.target.value)}
                rows={3}
                placeholder="derived from the beat's role — edit to steer"
                className="font-hanken w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[12px] leading-snug text-slate-200 focus:border-cyan-400/40 focus:outline-none"
              />
            </div>
            <button
              onClick={onRender}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300/90 py-2 text-[12px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Sparkles className="h-3 w-3" aria-hidden />}
              {frame.plate.state === "ready" ? "render again" : "render the plate"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
