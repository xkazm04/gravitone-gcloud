"use client";

// Shared leaves for every Frames variant.
//
// FrameCanvas is the important one: it is the only place the three layers are
// composited, so all three variants agree on what a frame LOOKS like and differ
// only in how you get there. Hoisted from the first variant rather than at
// refactor time — the moment two variants render the same structure, a tweak
// has to be made twice.

import type { Frame, FrameElement, FrameText } from "./frames";

/* ── The composite ────────────────────────────────────────────────────────── */

/** Plate, then elements, then texts — in that order, always.
 *
 *  Elements and texts are drawn as DOM/SVG rather than baked into the plate, so
 *  they stay crisp at any output size and a wrong number is a text edit rather
 *  than a regeneration. That is the whole architectural bet, made visible. */
export function FrameCanvas({
  frame,
  show = { plate: true, elements: true, texts: true },
  className = "",
}: {
  frame: Frame;
  show?: { plate: boolean; elements: boolean; texts: boolean };
  className?: string;
}) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-slate-950 ${className}`}>
      {show.plate && frame.plate.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL from a
        // just-generated buffer; next/image optimises files, not blobs.
        <img src={frame.plate.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent)]" aria-hidden />
      )}

      {show.elements && (
        <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {frame.elements.map((el) => (
            <ElementMark key={el.id} el={el} />
          ))}
        </svg>
      )}

      {show.texts &&
        frame.texts.map((t) => (
          <TextMark key={t.id} t={t} />
        ))}

      {frame.plate.state === "generating" && (
        <div className="absolute inset-0 animate-pulse bg-white/[0.04]" aria-hidden />
      )}
      {frame.plate.state === "refused" && (
        <p className="font-jetbrains absolute inset-x-2 bottom-2 rounded bg-rose-500/85 px-2 py-1 text-[10px] text-slate-950">
          refused — change the subject, not the seed
        </p>
      )}
    </div>
  );
}

function ElementMark({ el }: { el: FrameElement }) {
  const stroke = el.accent ? "var(--gt-accent-cyan)" : "rgba(255,255,255,0.85)";
  const x = (el.x / 100) * 100;
  const y = (el.y / 100) * 56;
  const w = (el.w / 100) * 100;
  const h = (el.h / 100) * 56;

  switch (el.kind) {
    case "arrow":
      return (
        <g stroke={stroke} strokeWidth={1.4} fill="none" strokeLinecap="round">
          <path d={`M${x} ${y + h / 2} L${x + w} ${y + h / 2}`} />
          <path d={`M${x + w - 3} ${y + h / 2 - 2.4} L${x + w} ${y + h / 2} L${x + w - 3} ${y + h / 2 + 2.4}`} />
        </g>
      );
    case "bar":
      return (
        <g fill={stroke} opacity={0.9}>
          <rect x={x} y={y + h * 0.45} width={w * 0.24} height={h * 0.55} />
          <rect x={x + w * 0.38} y={y + h * 0.2} width={w * 0.24} height={h * 0.8} />
          <rect x={x + w * 0.76} y={y} width={w * 0.24} height={h} />
        </g>
      );
    case "bracket":
      return (
        <path d={`M${x + w} ${y} L${x} ${y} L${x} ${y + h} L${x + w} ${y + h}`} stroke={stroke} strokeWidth={1.2} fill="none" />
      );
    case "rule":
      return <line x1={x} y1={y} x2={x + w} y2={y} stroke={stroke} strokeWidth={0.8} />;
    case "marker":
      return <circle cx={x} cy={y} r={1.8} fill={stroke} />;
    case "loop":
      return (
        <g stroke={stroke} strokeWidth={1.4} fill="none">
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2} strokeDasharray="6 3" />
        </g>
      );
  }
}

const TEXT_CLASS: Record<FrameText["role"], string> = {
  kicker: "font-jetbrains text-[9px] uppercase tracking-[0.18em] text-cyan-200",
  caption: "font-hanken text-[11px] text-white",
  figure: "font-instrument text-[26px] leading-none text-white",
  label: "font-jetbrains text-[9px] text-white/70",
};

function TextMark({ t }: { t: FrameText }) {
  return (
    <span
      className={`absolute max-w-[52%] ${TEXT_CLASS[t.role]}`}
      style={{ left: `${t.x}%`, top: `${t.y}%` }}
    >
      {t.value}
      {/* A figure with no fact behind it is the defect this step exists to
          prevent, so it is marked on the canvas rather than in a side panel. */}
      {t.role === "figure" && !t.factId && (
        <span className="ml-1 align-super text-[8px] text-amber-300" title="not bound to a notebook fact">
          ●
        </span>
      )}
    </span>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────────── */

const KIND_TONE: Record<string, string> = {
  hook: "text-cyan-200 border-cyan-400/35",
  turn: "text-amber-200 border-amber-300/35",
  steelman: "text-violet-200 border-violet-300/35",
  close: "text-emerald-200 border-emerald-300/35",
};

export function KindChip({ kind }: { kind: string }) {
  return (
    <span
      className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase ${
        KIND_TONE[kind] ?? "border-white/15 text-white/50"
      }`}
    >
      {kind}
    </span>
  );
}

/** The three layers as a readable breakdown — the row-level "what is in this
 *  frame" the module is organised around. */
export function LayerBreakdown({ frame, compact = false }: { frame: Frame; compact?: boolean }) {
  const bits = [
    { label: "plate", n: frame.plate.state === "ready" ? 1 : 0, total: 1 },
    { label: "elements", n: frame.elements.length, total: frame.elements.length },
    { label: "texts", n: frame.texts.length, total: frame.texts.length },
  ];
  return (
    <div className={`font-jetbrains flex items-center ${compact ? "gap-2" : "gap-3"} text-[10px]`}>
      {bits.map((b) => (
        <span key={b.label} className={b.n ? "text-white/70" : "text-white/25"}>
          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${b.n ? "bg-cyan-300" : "bg-white/20"}`} />
          {b.label}
          {b.total > 1 && ` ${b.n}`}
        </span>
      ))}
    </div>
  );
}
