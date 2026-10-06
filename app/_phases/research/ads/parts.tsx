"use client";

// THE PIECES BOTH CONCEPT ROUNDS DRAW — the card body the deck deals, the
// engine line beside the button, the receipt after a run, and a failure in the
// route's own words. Shared by research/ads (ideas) and script/ads (scenarios).

import { useState } from "react";
import { motion } from "motion/react";

import { useDeckReducedMotion } from "@/components/ui/deck/motionGuard";
import { Hint, Provenance } from "@/components/ui/signal";
import type { AdAngle, AdEngine } from "@/lib/ads/types";

import Notice from "../../_shared/ui/Notice";
import { costWords, type Preflight, type RunFailure } from "./run";

/* ── art ──────────────────────────────────────────────────────────────────────
   One literal gradient per angle (the JIT emits only what it can see), so a
   hand of six reads apart by mechanism at a glance. Tailwind classes only — no
   colour literal outside components/ui/tokens.ts. */
export const ANGLE_TONE: Record<AdAngle, string> = {
  analogy: "from-cyan-400/25 via-white/[0.04] to-transparent",
  twist: "from-violet-400/25 via-white/[0.04] to-transparent",
  exaggeration: "from-amber-400/25 via-white/[0.04] to-transparent",
  demo: "from-emerald-400/25 via-white/[0.04] to-transparent",
  emotional: "from-rose-400/25 via-white/[0.04] to-transparent",
  absurd: "from-fuchsia-400/25 via-white/[0.04] to-transparent",
  "problem-solution": "from-sky-400/25 via-white/[0.04] to-transparent",
};

export const CHIP = "font-jetbrains rounded border px-1.5 py-0.5 text-label tracking-[0.1em]";

/* ── the card body ──────────────────────────────────────────────────────────
   Handed to DeckCard as `children` — CandidatesDuel's shape — because a dense
   card lays out no `body`, and the hook (or the logline) is decision content
   that belongs on the FRONT, beside the risk, not one gesture behind it. The
   depth is an expand above the pick target (z-20), as the deck's rule says. */
export function ConceptCardBody({
  id,
  eyebrow,
  title,
  front,
  risk,
  picked,
  detail,
}: {
  id: string;
  eyebrow: React.ReactNode;
  title: string;
  front: React.ReactNode;
  risk?: string;
  picked: boolean;
  detail: React.ReactNode;
}) {
  const reduced = useDeckReducedMotion();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex grow flex-col gap-2 p-4">
      <span className="font-jetbrains text-label tracking-[0.16em] text-white/50 uppercase">{eyebrow}</span>
      <h3 className="font-hanken text-xl leading-snug font-semibold text-slate-100">{title}</h3>
      {front}
      {risk && <p className="font-jetbrains text-label leading-relaxed text-amber-200/85">risk — {risk}</p>}
      {picked && (
        <p data-testid={`concept-picked-${id}`} className="font-jetbrains text-label text-cyan-200/90">
          picked
        </p>
      )}
      {open && (
        <motion.div
          data-testid={`concept-detail-${id}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          transition={reduced ? { duration: 0.15 } : { duration: 0.28, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="space-y-2.5 border-t border-white/8 pt-3">{detail}</div>
        </motion.div>
      )}
      <div className="relative z-20 mt-auto pt-1">
        <button
          type="button"
          data-testid={`concept-more-${id}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`font-jetbrains rounded-full border px-3 py-1 text-label transition ${
            open ? "border-cyan-400/40 text-cyan-200" : "border-white/12 text-white/60 hover:text-white/85"
          }`}
        >
          {open ? "less" : "details"}
        </button>
      </div>
    </div>
  );
}

/** A labelled line inside a card's depth: a mono key, the work verbatim. */
export function DepthLine({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <p className="font-hanken text-content leading-relaxed text-slate-200">
      <span className="font-jetbrains mr-2 text-label tracking-[0.1em] text-white/45 uppercase">{k}</span>
      {children}
    </p>
  );
}

/* ── the engine, before and after ─────────────────────────────────────────── */

/** Who would serve, beside the button. Never a price it does not have. */
export function PreflightNote({ pf }: { pf: Preflight | null | undefined }) {
  if (pf === undefined) return <span className="font-jetbrains text-label text-white/45">checking the engine…</span>;
  if (pf === null) return <span className="font-jetbrains text-label text-amber-200/85">engine unknown</span>;
  if (!pf.serving)
    return (
      <span className="font-jetbrains inline-flex items-center gap-1.5 text-label text-amber-200/85" data-testid="concept-no-engine">
        no engine configured here
        <Hint tone="amber" variant="warn" label="Why no engine">
          {pf.candidates.map((c) => `${c.provider}: ${c.detail}`).join(" · ")}
        </Hint>
      </span>
    );
  return <span className="font-jetbrains text-label text-white/55">bills {pf.serving}</span>;
}

/** What the last run cost and who did it — verbatim, as Provenance draws it. */
export function Receipt({ engine }: { engine: AdEngine | null }) {
  if (!engine) return null;
  return (
    <span data-testid="concept-receipt">
      <Provenance model={engine.model} vendor={engine.provider} cost={costWords(engine)} />
    </span>
  );
}

/** The route's answer when it was not a set of options, in its own words. */
export function RunFailed({ failure }: { failure: RunFailure }) {
  if (failure.error === "needs-brief")
    return (
      <Notice announce severity="warning" title="the brief needs an answer">
        <p data-testid="concept-question">{failure.message}</p>
      </Notice>
    );
  return (
    <Notice severity="error" title={failure.error}>
      <p data-testid="concept-failure">{failure.message}</p>
      {failure.findings && failure.findings.length > 0 && (
        <ul className="font-jetbrains mt-2 list-disc space-y-0.5 pl-5 text-label">
          {failure.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </Notice>
  );
}
