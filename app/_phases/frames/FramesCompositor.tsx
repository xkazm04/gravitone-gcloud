"use client";

// COMPOSITOR — one frame, opened up.
//
// Metaphor: a compositing app. The canvas dominates, and to its right is the
// LAYER STACK — plate, elements, texts — each toggleable and each editable in
// place. Toggling a layer off is the fastest way to see what it was actually
// contributing, which on a three-layer architecture is the question that
// matters most and the one a flat preview cannot answer.
//
// It answers "standalone" first: this is where a frame is made right. The
// sequence is a rail of small numbers on the left, present but deliberately
// quiet — the bet opposite to Strip's.

import { useState } from "react";
import { Eye, EyeOff, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

import type { FrameText } from "./frames";
import { FrameCanvas, KindChip } from "./parts";
import type { useFrames } from "./useFrames";

export default function FramesCompositor({ ctl }: { ctl: ReturnType<typeof useFrames> }) {
  const { frames, busy, generatePlate, setSubject, setText, addText, removeText, removeElement } = ctl;
  const [id, setId] = useState(frames[0]?.id ?? "");
  const frame = frames.find((f) => f.id === id) ?? frames[0];
  const [show, setShow] = useState({ plate: true, elements: true, texts: true });

  if (!frame) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[68px_1fr_300px]">
      {/* the quiet rail */}
      <nav className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto pr-1" aria-label="Frames">
        {frames.map((f, i) => (
          <button
            key={f.id}
            onClick={() => setId(f.id)}
            title={`${f.at} · ${f.title}`}
            className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1.5 transition ${
              f.id === frame.id ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/8 hover:border-white/20"
            }`}
          >
            <span className="font-jetbrains text-[10px] text-white/40">{String(i + 1).padStart(2, "0")}</span>
            <span
              className={`h-5 w-8 shrink-0 overflow-hidden rounded-sm ${f.plate.src ? "" : "bg-white/[0.06]"}`}
            >
              {f.plate.src && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL
                <img src={f.plate.src} alt="" className="h-full w-full object-cover" />
              )}
            </span>
          </button>
        ))}
      </nav>

      {/* the canvas */}
      <div className="space-y-3">
        <FrameCanvas frame={frame} show={show} />
        <div className="flex flex-wrap items-center gap-2">
          <KindChip kind={frame.kind} />
          <span className="font-jetbrains text-[11px] text-white/40">{frame.at}</span>
          <span className="font-hanken truncate text-[13px] text-white/70">{frame.title}</span>
        </div>
        <p className="font-hanken text-[13px] leading-snug text-slate-400">&ldquo;{frame.line}&rdquo;</p>
      </div>

      {/* the layer stack */}
      <aside className="space-y-3">
        <p className="font-jetbrains text-[11px] tracking-[0.18em] text-white/40 uppercase">layers</p>

        <LayerGroup
          name="texts"
          n={frame.texts.length}
          visible={show.texts}
          onToggle={() => setShow((s) => ({ ...s, texts: !s.texts }))}
        >
          {frame.texts.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5">
              <span className="font-jetbrains w-11 shrink-0 text-[9px] text-white/35">{t.role}</span>
              <input
                value={t.value}
                onChange={(e) => setText(frame.id, t.id, e.target.value)}
                className="font-hanken min-w-0 flex-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-1 text-[12px] text-slate-200 focus:border-cyan-400/40 focus:outline-none"
              />
              <button
                onClick={() => removeText(frame.id, t.id)}
                aria-label={`Remove ${t.role}`}
                className="shrink-0 rounded p-1 text-white/30 transition hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}
          <div className="flex gap-1.5 pt-0.5">
            {(["caption", "figure", "label"] as FrameText["role"][]).map((r) => (
              <button
                key={r}
                onClick={() => addText(frame.id, r)}
                className="font-jetbrains inline-flex items-center gap-1 rounded border border-white/12 px-1.5 py-1 text-[10px] text-white/55 transition hover:text-white/85"
              >
                <Plus className="h-2.5 w-2.5" aria-hidden />
                {r}
              </button>
            ))}
          </div>
        </LayerGroup>

        <LayerGroup
          name="elements"
          n={frame.elements.length}
          visible={show.elements}
          onToggle={() => setShow((s) => ({ ...s, elements: !s.elements }))}
        >
          {frame.elements.length === 0 && <p className="text-[11px] text-white/30">none on this frame</p>}
          {frame.elements.map((el) => (
            <div key={el.id} className="flex items-center gap-1.5">
              <span className="font-jetbrains w-11 shrink-0 text-[9px] text-white/35">{el.kind}</span>
              <span className="font-hanken min-w-0 flex-1 truncate text-[12px] text-slate-300">{el.label}</span>
              <button
                onClick={() => removeElement(frame.id, el.id)}
                aria-label={`Remove ${el.kind}`}
                className="shrink-0 rounded p-1 text-white/30 transition hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </button>
            </div>
          ))}
        </LayerGroup>

        <LayerGroup
          name="plate"
          n={frame.plate.state === "ready" ? 1 : 0}
          visible={show.plate}
          onToggle={() => setShow((s) => ({ ...s, plate: !s.plate }))}
        >
          <textarea
            value={frame.plate.subject ?? ""}
            onChange={(e) => setSubject(frame.id, e.target.value)}
            rows={3}
            placeholder="derived from the beat's role — edit to steer"
            className="font-hanken w-full resize-none rounded border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[12px] leading-snug text-slate-200 focus:border-cyan-400/40 focus:outline-none"
          />
          <button
            onClick={() => void generatePlate(frame.id)}
            disabled={busy.has(frame.id)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300/90 py-2 text-[12px] font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-40"
          >
            {busy.has(frame.id) ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden />
            )}
            {frame.plate.state === "ready" ? "render again" : "render"}
          </button>
          {frame.plate.model && (
            <p className="font-jetbrains text-[9px] text-white/30">
              {frame.plate.model}
              {frame.plate.costUsd !== undefined && ` · $${frame.plate.costUsd.toFixed(4)}`}
            </p>
          )}
        </LayerGroup>
      </aside>
    </div>
  );
}

function LayerGroup({
  name,
  n,
  visible,
  onToggle,
  children,
}: {
  name: string;
  n: number;
  visible: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-white/8 p-2.5 transition ${visible ? "" : "opacity-45"}`}>
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={onToggle}
          aria-label={`${visible ? "Hide" : "Show"} ${name}`}
          className="rounded p-0.5 text-white/45 transition hover:text-white/85"
        >
          {visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <span className="font-jetbrains text-[11px] tracking-[0.12em] text-white/60 uppercase">{name}</span>
        <span className="font-jetbrains ml-auto text-[10px] text-white/30">{n}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
