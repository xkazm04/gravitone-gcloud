"use client";

// The two chips that carry a craft rule rather than a style: the connector
// between two claims, and how much a claim can be trusted. Both are read by the
// Research step and the Script step, so both live with the notebook contract.

import type { ChainConnector, Confidence, Connector, EvidenceClass } from "./types";

/** BUT / THEREFORE between adjacent beats — and AND THEN drawn as the defect
 *  it is (CRAFT-BASELINE §1). This is the chip the library asks the UI for. */
export function ConnectorChip({ connector }: { connector: Connector }) {
  if (!connector) return null;
  const defect = connector === "AND THEN";
  return (
    <span
      className={`font-jetbrains inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label tracking-[0.16em] ${
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
      className={`font-jetbrains inline-flex items-center rounded px-1.5 py-0.5 text-label tracking-[0.16em] ${
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

/** HOW a source stands to the event. The third chip that carries a craft rule
 *  rather than a style, and the one that had no chip at all.
 *
 *  `EvidenceClass` exists because, in its own words, "run 1 shipped an
 *  all-aggregator source list — and nothing consumed it, so run 2 shipped the
 *  same way. A rule with no field to live in is a comment." The field was then
 *  added and nothing rendered it, which is the same sentence one layer up: a
 *  field no surface draws is a comment with a type annotation.
 *
 *  ORDER OF TONE IS THE LADDER, not decoration. `primary` is the record itself
 *  and reads calm; `aggregator` and `vendor` are the two the schema warns about
 *  by name, so they are the two that carry warmth. `protected` is cyan rather
 *  than warm on purpose — it is TRUE and merely uncitable, and colouring it like
 *  a weakness is how a researcher learns to launder it into a citable class,
 *  which is the failure the category was invented to prevent. */
const EVIDENCE: Record<EvidenceClass, { tone: string; why: string }> = {
  primary: {
    tone: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200",
    why: "The record itself — a filing, the statute, the chain, the disclosure.",
  },
  secondary: {
    tone: "border-white/12 bg-white/[0.04] text-white/60",
    why: "Reporting or analysis about a primary record.",
  },
  aggregator: {
    tone: "border-amber-400/30 bg-amber-400/[0.06] text-amber-200",
    why: "A site that restates others' numbers. Nothing here was checked against the record it describes.",
  },
  vendor: {
    tone: "border-rose-400/35 bg-rose-400/[0.07] text-rose-200",
    why: "A third-party research shop selling the conclusion — low confidence by default, because the conclusion is the product.",
  },
  "self-published": {
    tone: "border-violet-400/35 bg-violet-400/[0.08] text-violet-200",
    why: "The subject's own account of itself — authoritative AND interested. Interest is not unreliability.",
  },
  protected: {
    tone: "border-cyan-400/25 bg-cyan-400/[0.07] text-cyan-200/90",
    why: "True, verified by the researcher, and not citable by the reader. A real category — not a weaker one.",
  },
};

export function EvidenceClassChip({ c, interested }: { c: EvidenceClass; interested?: boolean }) {
  const e = EVIDENCE[c];
  return (
    <span
      // Interest is recorded as a FLAG on the source, never as a confidence
      // demotion — types.ts is explicit that conflating them is how the ladder
      // demoted a regulator's own number.
      title={interested ? `${e.why} Flagged interested: a party with a stake in the answer.` : e.why}
      className={`font-jetbrains rounded border px-1.5 py-0.5 text-label tracking-[0.12em] ${e.tone}`}
    >
      {c}
      {interested && <span className="ml-1 opacity-70">· interested</span>}
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
    <span className={`font-jetbrains rounded border px-1.5 py-0.5 text-label tracking-[0.12em] ${CONF[c]}`}>
      {c}
    </span>
  );
}
