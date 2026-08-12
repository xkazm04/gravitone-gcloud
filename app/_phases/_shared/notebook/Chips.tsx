"use client";

// The two chips that carry a craft rule rather than a style: the connector
// between two claims, and how much a claim can be trusted. Both are read by the
// Research step and the Script step, so both live with the notebook contract.

import type { Confidence, Connector } from "./types";

/** BUT / THEREFORE between adjacent beats — and AND THEN drawn as the defect
 *  it is (CRAFT-BASELINE §1). This is the chip the library asks the UI for. */
export function ConnectorChip({ connector }: { connector: Connector }) {
  if (!connector) return null;
  const defect = connector === "AND THEN";
  return (
    <span
      className={`font-jetbrains inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] tracking-[0.16em] ${
        defect
          ? "border border-rose-400/40 bg-rose-400/10 text-rose-300"
          : connector === "BUT"
            ? "border border-violet-400/30 bg-violet-400/10 text-violet-200"
            : "border border-white/10 bg-white/[0.04] text-white/55"
      }`}
      title={defect ? "AND THEN is the wiki-timeline defect — these beats have no causal relationship" : undefined}
    >
      {defect && <span aria-hidden>✕</span>}
      {connector}
    </span>
  );
}

const CONF: Record<Confidence, string> = {
  high: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200",
  medium: "border-white/12 bg-white/[0.04] text-white/60",
  low: "border-rose-400/35 bg-rose-400/[0.07] text-rose-200",
};

export function ConfidenceChip({ c }: { c: Confidence }) {
  return (
    <span className={`font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.12em] ${CONF[c]}`}>
      {c}
    </span>
  );
}
