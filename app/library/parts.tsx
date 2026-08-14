"use client";

// Shared leaves for /library. These used to draw gradient mocks; they now draw
// real generated pixels, so the only thing that changed conceptually is that a
// proof can be WRONG — hence the judge affordances.

import { Check, X } from "lucide-react";

import type { PaletteColor, Proof, ProofState, Theme, ThemeStatus } from "@/lib/themes";
import { lockedOnly, STATUS_WORD } from "@/lib/themes";

const STATUS_CLS: Record<ThemeStatus, string> = {
  draft: "border-white/12 text-white/50",
  proofing: "border-amber-300/40 bg-amber-300/5 text-amber-200",
  locked: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
};

export function StatusStamp({ status }: { status: ThemeStatus }) {
  return (
    <span
      className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-[10px] tracking-[0.14em] uppercase ${STATUS_CLS[status]}`}
    >
      {STATUS_WORD[status]}
    </span>
  );
}

/** The three colours, shown doing their jobs. The role is the part that keeps a
 *  style consistent, so it is what the swatch labels. */
export function PaletteDots({ palette, withNames = false }: { palette: PaletteColor[]; withNames?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {palette.map((c) => (
        <span key={c.name} className="flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 rounded-full border border-white/25"
            style={{ background: c.hex }}
            aria-hidden
          />
          {withNames && (
            <span className="font-jetbrains text-[11px] text-white/55">
              {c.name}
              <span className="text-white/30"> · {c.role}</span>
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

const PROOF_RING: Record<ProofState, string> = {
  approved: "border-cyan-300/60",
  pending: "border-white/12",
  rejected: "border-rose-400/50 opacity-55",
};

/** One plate on the proof sheet — a real image, with its verdict on it. */
export function ProofThumb({
  proof,
  className = "aspect-video",
  onJudge,
  onClick,
  selected = false,
}: {
  proof: Proof;
  className?: string;
  onJudge?: (state: ProofState) => void;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border transition ${PROOF_RING[proof.state]} ${
        selected ? "ring-1 ring-cyan-300/60" : ""
      } ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL held in
          IndexedDB; there is no remote file for next/image to optimise. */}
      <img
        src={`data:${proof.mime};base64,${proof.base64}`}
        alt={proof.label}
        onClick={onClick}
        className={`h-full w-full object-cover ${onClick ? "cursor-zoom-in" : ""}`}
      />

      <span className="font-jetbrains pointer-events-none absolute bottom-1 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/80">
        {proof.label}
      </span>

      {proof.state === "approved" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-cyan-300/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
          APPROVED
        </span>
      )}
      {proof.state === "rejected" && (
        <span className="font-jetbrains pointer-events-none absolute top-1 left-1.5 rounded bg-rose-400/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
          REJECTED
        </span>
      )}

      {/* The verdict is the whole job of this surface, so the controls are
          always reachable — revealed on hover, but never hidden behind a menu. */}
      {onJudge && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => onJudge("approved")}
            aria-label={`Approve ${proof.label}`}
            className="rounded bg-black/70 p-1 text-cyan-300 transition hover:bg-cyan-300 hover:text-slate-950"
          >
            <Check className="h-3 w-3" aria-hidden />
          </button>
          <button
            onClick={() => onJudge("rejected")}
            aria-label={`Reject ${proof.label}`}
            className="rounded bg-black/70 p-1 text-rose-300 transition hover:bg-rose-400 hover:text-slate-950"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** The rule this page exists to enforce, stated where the user starts. */
export function GateChip({ themes }: { themes: Theme[] }) {
  const n = lockedOnly(themes).length;
  const open = n > 0;
  return (
    <span
      className={`font-jetbrains inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
        open ? "border-cyan-400/30 bg-cyan-400/5 text-cyan-200" : "border-amber-300/40 bg-amber-300/5 text-amber-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-cyan-300" : "bg-amber-300"}`} />
      {open
        ? `${n} locked ${n === 1 ? "style" : "styles"} — projects open`
        : "no locked style — project creation is gated"}
    </span>
  );
}
