"use client";

// Shared leaves for library assets: kind glyphs, kind-native mock previews,
// the honest caption block, provenance as a walkable chain, and the step
// status dot. AssetDrawer composes these in its own file.

import { AudioLines, Clapperboard, FileText, Image as ImageIcon, Sparkles, Upload } from "lucide-react";

import { Provenance } from "@/components/ui/signal";

import type { Asset, AssetKind, StepStatus } from "./types";
import { assetById } from "./assets";

export const fmtBytes = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`;

export const fmtDur = (s?: number) =>
  s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const KIND_ICON: Record<AssetKind, typeof ImageIcon> = {
  image: ImageIcon,
  audio: AudioLines,
  video: Clapperboard,
  script: FileText,
};

export function KindGlyph({ kind, className = "h-3.5 w-3.5" }: { kind: AssetKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={className} aria-hidden />;
}

/** Deterministic pseudo-waveform bars from the asset id — a mock preview
 *  that at least LOOKS like the medium, and never animates (nothing here is
 *  playing). */
function AudioBars({ id }: { id: string }) {
  const bars = Array.from({ length: 36 }, (_, i) => {
    const c = id.charCodeAt(i % id.length) * (i + 3);
    return 20 + (c % 70);
  });
  return (
    <div className="flex h-full items-center gap-[2px] px-4" aria-hidden>
      {bars.map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-cyan-300/50" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

/** Kind-native placeholder: gradient still for image/video, bars for audio,
 *  mono excerpt for script. Honest about being a mock — no fake photos. */
export function MockPreview({ asset, className = "" }: { asset: Asset; className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${asset.tone} ${className}`}>
      {asset.kind === "audio" && <AudioBars id={asset.id} />}
      {asset.kind === "script" && (
        <div className="font-jetbrains space-y-1.5 p-4 text-content leading-relaxed text-white/25">
          <p>INT. HARBOR GATE — NIGHT</p>
          <p className="pl-4">MARLA (V.O.)</p>
          <p className="pl-8">Every city keeps one door unlocked.</p>
        </div>
      )}
      {asset.kind === "video" && (
        <span className="font-jetbrains absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 text-label text-white/80">
          {fmtDur(asset.durationS)}
        </span>
      )}
      {asset.provenance.source === "generated" && (
        <span className="absolute top-2 right-2 grid h-6 w-6 place-items-center rounded-full border border-cyan-400/30 bg-slate-950/70 text-cyan-300">
          <Sparkles className="h-3 w-3" aria-hidden />
          <span className="sr-only">generated</span>
        </span>
      )}
    </div>
  );
}

/** The caption, or the truth about why there isn't one. */
export function CaptionBlock({ asset }: { asset: Asset }) {
  if (asset.captionStatus === "written")
    return <p className="text-content leading-relaxed text-slate-300">{asset.caption}</p>;
  // A CAPTION THAT IS COMING IS DRAWN WHERE IT WILL LAND. The sentence here
  // ("the library is watching this clip; search will find it once the caption
  // lands") described the app's own plumbing in the space the caption itself
  // will occupy. A shimmering bar of caption-shaped ground says the same thing
  // without a word, and `gt-indeterminate` is a CSS animation, so the blanket
  // prefers-reduced-motion rule at the foot of app/globals.css stills it.
  if (asset.captionStatus === "pending")
    return (
      <div className="space-y-1.5" role="status" aria-label="Caption in flight">
        <span className="sr-only">Caption in flight</span>
        {["w-full", "w-3/5"].map((w) => (
          <span
            key={w}
            aria-hidden
            className={`block h-3 overflow-hidden rounded-full bg-white/[0.06] ${w}`}
          >
            <span className="gt-indeterminate block h-full w-1/3 rounded-full bg-cyan-300/30" />
          </span>
        ))}
      </div>
    );
  return (
    <p className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-content text-amber-200/90">
      {asset.captionError}
    </p>
  );
}

/** Where an asset came from, as a chain the user can walk. */
export function ProvenanceBlock({
  asset,
  onSelect,
}: {
  asset: Asset;
  onSelect: (id: string) => void;
}) {
  const p = asset.provenance;
  return (
    <div className="space-y-2">
      <p className="font-jetbrains text-content tracking-[0.14em] text-white/40 uppercase">provenance</p>
      {/* "Made by X in run R, step S." was three facts wearing an English
          sentence — two of them already styled mono, because the sentence could
          not carry them. <Provenance> is the same three as chips, in a fixed
          order so no two surfaces disagree about which comes first, and the
          values verbatim: a model id and a run id are what somebody pastes into
          a search box. */}
      {p.source === "upload" ? (
        <p className="flex items-center gap-1.5 text-content text-slate-300">
          <Upload className="h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden />
          uploaded
        </p>
      ) : (
        <Provenance model={p.model} run={p.runId} step={p.stepId} />
      )}
      {p.prompt && (
        <p className="font-jetbrains rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-content text-slate-400">
          “{p.prompt}”
        </p>
      )}
      {p.parentIds.length > 0 && (
        <div className="space-y-1">
          <p className="text-content text-slate-500">from</p>
          {p.parentIds.map((pid) => {
            const parent = assetById.get(pid);
            if (!parent) return null;
            return (
              <button
                key={pid}
                onClick={() => onSelect(pid)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-label text-slate-300 transition hover:border-cyan-400/30 hover:text-white"
              >
                <KindGlyph kind={parent.kind} className="h-3.5 w-3.5 text-white/50" />
                <span className="truncate">{parent.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Step status dot — the run chip's truth marker. */
export function StepDot({ status }: { status: StepStatus }) {
  const cls =
    status === "done"
      ? "bg-cyan-300"
      : status === "failed"
        ? "bg-rose-400"
        : status === "running"
          ? "bg-cyan-300/60 ring-2 ring-cyan-300/25"
          : "bg-white/20";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}
