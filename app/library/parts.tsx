"use client";

// Shared leaves for the library variants: the nouns both metaphors render —
// hoisted from day one so a refinement never has to be made twice.

import type { Proof, ProofState, Theme, ThemeStatus } from "./themes";
import { STATUS_WORD, lockedCount } from "./themes";

const STATUS_CLS: Record<ThemeStatus, string> = {
  draft: "border-white/12 text-white/50",
  proofing: "border-amber-300/40 bg-amber-300/5 text-amber-200",
  locked: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
};

/** The theme's one-word state, worn as a stamp. */
export function StatusStamp({ status }: { status: ThemeStatus }) {
  return (
    <span
      className={`font-jetbrains rounded-full border px-2.5 py-0.5 text-[10px] tracking-[0.14em] uppercase ${STATUS_CLS[status]}`}
    >
      {STATUS_WORD[status]}
    </span>
  );
}

/** The three named colours, shown as what they are. */
export function PaletteDots({ palette, withNames = false }: { palette: Theme["block"]["palette"]; withNames?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {palette.map((c) => (
        <span key={c.name} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: c.hex }} aria-hidden />
          {withNames && <span className="font-jetbrains text-[11px] text-white/55">{c.name}</span>}
        </span>
      ))}
    </span>
  );
}

const PROOF_RING: Record<ProofState, string> = {
  approved: "border-cyan-300/50",
  pending: "border-white/10",
  rejected: "border-rose-400/50",
};

/** One plate on the proof sheet — gradient mock, verdict drawn on it. */
export function ProofThumb({
  proof,
  className = "h-16",
  onClick,
  selected = false,
}: {
  proof: Proof;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-lg border text-left transition ${PROOF_RING[proof.state]} ${
        selected ? "ring-1 ring-cyan-300/60" : ""
      } ${onClick ? "hover:border-cyan-400/40" : ""} ${className}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${proof.tone}`} aria-hidden />
      <span className="font-jetbrains absolute bottom-1 left-1.5 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white/70">
        {proof.label}
      </span>
      {proof.state === "rejected" && (
        <span className="font-jetbrains absolute top-1 right-1 rounded bg-rose-400/90 px-1 py-0.5 text-[9px] font-semibold text-slate-950">
          NO
        </span>
      )}
      {proof.state === "pending" && (
        <span className="font-jetbrains absolute top-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white/60">
          …
        </span>
      )}
    </Tag>
  );
}

/** The rule this page exists to enforce, stated where the user starts. */
export function GateChip() {
  const n = lockedCount();
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
