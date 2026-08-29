"use client";

// The two chips that carry a craft rule rather than a style: the connector
// between two claims, and how much a claim can be trusted. Both are read by the
// Research step and the Script step, so both live with the notebook contract.

import type { ChainConnector, Confidence, Connector } from "./types";

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

/** THE NOTEBOOK LAYER'S connector, which is a longer list by exactly one word.
 *
 *  Separate from `ConnectorChip` on purpose, and not a widening of it. TRANSFER
 *  is notebook vocabulary ONLY — a typed non-causal step, a deduction or a
 *  hand-off — and types.ts is explicit that it "is not a render licence: when
 *  these steps become beats, the script layer still holds them to `Connector`".
 *  Teaching the script layer's chip to draw TRANSFER is exactly how that licence
 *  would leak. Two chips, two vocabularies, one law each.
 *
 *  There is no defect state here: this alphabet has no AND THEN in it. A chain
 *  that needs one has run out of vocabulary, and the answer is a TRANSFER or a
 *  missing link, not a red chip. */
export function ChainConnectorChip({ connector }: { connector: ChainConnector | undefined }) {
  if (!connector) return null;
  return (
    <span
      className={`font-jetbrains inline-flex items-center rounded px-1.5 py-0.5 text-[10px] tracking-[0.16em] ${
        connector === "BUT"
          ? "border border-violet-400/30 bg-violet-400/10 text-violet-200"
          : connector === "TRANSFER"
            ? "border border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200/90"
            : "border border-white/10 bg-white/[0.04] text-white/55"
      }`}
      title={
        connector === "TRANSFER"
          ? "A typed non-causal step — a deduction, a hand-off, a recognition. Notebook vocabulary only; the script layer does not accept it."
          : undefined
      }
    >
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
