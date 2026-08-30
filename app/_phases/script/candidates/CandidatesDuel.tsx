"use client";

// THE DUEL — the guided face of the Candidates tab.
//
// Three renders dealt as three cards (the deck engine, `components/ui/deck`),
// each carrying the render's PITCH on its front and its MEASUREMENTS one
// "read more" away. Adoption is the whole-card target DeckCard already builds
// (aria-pressed, unpick supported); picking writes the `script-adopted` record
// through `useAdoption`, which is what the Frames step resolves its cut from.
//
// REPO LAW this surface is bound by, from knowledge/: a card may NOT collapse
// verdicts into a single score, star, grade or "best pick" badge; `unmeasured`
// renders as loudly as `violation`; these are review items, never blockers.
// The four verdict systems disagreeing is the surface's most useful output —
// so the footnote is COUNTS from the same `runGate` rollup and the same
// hand-typed checks the expert columns read, in the same vocabulary
// (GatePanel's words, Meters' glyphs), and nothing here ranks the cards.
//
// Depth is an EXPAND, not a 3D flip — deliberately. The depth block holds
// band meters and a variable-height note; a rotate hides the pitch while the
// reader compares numbers ACROSS cards, which is the one read this tab is
// for. The expand consults the deck's reduced-motion guard like every other
// deck gesture: reduced, it appears without animating.

import { useState } from "react";
import { motion } from "motion/react";

import DeckCard, { type DeckCardSpec } from "@/components/ui/deck/DeckCard";
import DeckStage from "@/components/ui/deck/DeckStage";
import { useDeckReducedMotion } from "@/components/ui/deck/motionGuard";

import type { GateReport, GateRollup } from "../gate";
import { BandMeter } from "../_parts/Meters";
import { mmss } from "../renders";
import type { Beat, CheckState, ScriptRender } from "../types";

/* ── art ──────────────────────────────────────────────────────────────────────
   Literal Tailwind gradient classes (the JIT emits only what it can see), one
   tone per engine so the three cards read apart at a glance. Chrome colour via
   Tailwind classes only — the colour-literal rule allows no hex here. */
const ART_TONE: Record<string, string> = {
  "reversal-chain": "from-cyan-400/25 via-white/[0.04] to-transparent",
  adjudication: "from-violet-400/25 via-white/[0.04] to-transparent",
  "derived-short": "from-emerald-400/25 via-white/[0.04] to-transparent",
};

/* ── the honest footnote ─────────────────────────────────────────────────────
   Counts, never a score, never a crown. Same data the expert columns read:
   the gate report `runGate` computed for THIS chain, and the render's own
   hand-typed checks. Vocabulary is GatePanel's ("% enforced", "checked",
   "failed", "not checked") and the glyphs are Meters' CHECK marks — invented
   nothing. `unmeasured` is amber, as loud as the rose violations. */
function VerdictCounts({ report, checks }: { report: GateReport; checks: ScriptRender["checks"] }) {
  const n = (s: CheckState) => checks.filter((c) => c.state === s).length;
  const fails = n("fail");
  const unmeasuredChecks = n("unmeasured");
  return (
    <p className="font-jetbrains mt-auto pt-1 text-[10px] leading-relaxed text-white/40">
      gate: <span className="text-white/70">{report.enforced}% enforced</span>
      {" · "}
      <span className="text-emerald-300">{report.passes} checked</span>
      {" · "}
      <span className={report.violations > 0 ? "text-rose-300" : "text-white/40"}>
        {report.violations} failed
      </span>
      {" · "}
      <span className={report.unmeasured > 0 ? "text-amber-300" : "text-white/40"}>
        {report.unmeasured} not checked
      </span>
      <br />
      checks: <span className="text-emerald-300">{n("pass")}✓</span>{" "}
      <span className="text-amber-300">{n("declared")}!</span>
      {fails > 0 && <span className="text-rose-300"> {fails}✕</span>}
      {unmeasuredChecks > 0 && <span className="text-amber-300"> {unmeasuredChecks}—</span>}
    </p>
  );
}

/* ── one card's content block ────────────────────────────────────────────── */

const CHIP = "font-jetbrains rounded border px-1.5 py-0.5 text-[10px] tracking-[0.1em]";

function DuelCardBody({
  render: r,
  words,
  rewritten,
  chainLabel,
  report,
  picked,
  open,
  onToggleOpen,
  onReadBeats,
}: {
  render: ScriptRender;
  words: number;
  rewritten: boolean;
  chainLabel?: string;
  report: GateReport;
  picked: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onReadBeats: () => void;
}) {
  const reduced = useDeckReducedMotion();

  return (
    <div className="flex grow flex-col gap-2 p-4">
      <span className="font-jetbrains text-[10px] tracking-[0.16em] text-white/35 uppercase">
        {r.engineLabel}
      </span>
      <h3 className="font-instrument text-xl leading-snug text-slate-100">{r.title}</h3>
      <p className="font-hanken text-[13px] leading-relaxed text-slate-400 transition-colors duration-200 ease-linear group-hover:text-slate-200">
        pleasure: {r.pleasure}. Reads like {r.feelsLike}.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${CHIP} border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200/90`}>
          {r.bestFor}
        </span>
        <span className={`${CHIP} border-white/12 bg-white/[0.04] text-white/60`}>
          {mmss(r.durationS)} · {words} words
        </span>
      </div>
      <p className="font-jetbrains text-[11px] leading-relaxed text-amber-200/85">
        risk — {r.weakness}
      </p>

      {picked && (
        <p data-testid={`duel-adopted-${r.id}`} className="font-jetbrains text-[11px] text-cyan-200/90">
          adopted — the Frames step opens on this chain
        </p>
      )}

      {/* the depth, one gesture away — measured facts, lightly re-presented */}
      {open && (
        <motion.div
          data-testid={`duel-depth-${r.id}`}
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
          transition={reduced ? { duration: 0.15 } : { duration: 0.28, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="space-y-2.5 border-t border-white/8 pt-3">
            {r.turns !== null && r.turnBand ? (
              <BandMeter
                label="turns"
                value={r.turns}
                band={r.turnBand}
                belowNote="below the band reads as a lecture"
                aboveNote="above the band, no conclusion stands long enough to matter"
              />
            ) : (
              <p className="font-jetbrains text-[11px] text-white/35">
                turns — n/a for this engine (
                {r.engine === "adjudication" ? "candidates, not turns" : "one turn by construction"})
              </p>
            )}
            <BandMeter
              label="essay words"
              value={words}
              band={[Math.round(r.wordBudget * 0.9), r.wordBudget]}
              aboveNote="over the budget the duration bought"
            />
            <p className="font-jetbrains text-[11px] text-white/45">
              {mmss(r.durationS)} at {r.wpm} wpm · promise form: {r.promiseForm} · {r.questionsAloud}{" "}
              question{r.questionsAloud === 1 ? "" : "s"} aloud
            </p>
            {rewritten && (
              <p className="font-jetbrains text-[11px] leading-snug text-amber-200/70">
                words are counted from {chainLabel ?? "this version"}&rsquo;s own chain. Turns,
                questions aloud and the promise form are the original render&rsquo;s and were not
                re-measured.
              </p>
            )}
          </div>
        </motion.div>
      )}

      <VerdictCounts report={report} checks={r.checks} />

      {/* Actions sit ABOVE the whole-card pick target (z-20 over its z-10) —
          the deck's own rule for anything layered on a card. */}
      <div className="relative z-20 flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          data-testid={`duel-more-${r.id}`}
          aria-expanded={open}
          onClick={onToggleOpen}
          className={`font-jetbrains rounded-full border px-3 py-1 text-[11px] transition ${
            open ? "border-cyan-400/40 text-cyan-200" : "border-white/12 text-white/50 hover:text-white/80"
          }`}
        >
          {open ? "read less" : "read more"}
        </button>
        {open && (
          <button
            type="button"
            data-testid={`duel-beats-${r.id}`}
            onClick={onReadBeats}
            className="font-jetbrains rounded-full border border-white/12 px-3 py-1 text-[11px] text-white/50 transition hover:border-cyan-400/40 hover:text-cyan-200"
          >
            read the beats
          </button>
        )}
      </div>
    </div>
  );
}

/* ── the stage ────────────────────────────────────────────────────────────── */

export default function CandidatesDuel({
  renders,
  chains,
  chainLabel,
  gate,
  adoptedId,
  onAdopt,
  onReadBeats,
}: {
  renders: ScriptRender[];
  /** The chain each card is ABOUT — the same map the expert columns and the
   *  beats modal read, so a recalibrated version is counted as itself here too. */
  chains: Record<string, Beat[]>;
  chainLabel?: string;
  /** The rollup ScriptStep already computed once — never a second `gateChains`
   *  call, which would be a second answer waiting to disagree with the pad's. */
  gate: GateRollup;
  adoptedId: string | null;
  onAdopt: (id: string | null) => void;
  /** Opens the SAME beats modal the expert face uses — the modal lives on the
   *  step, so both faces read one BeatList and cannot drift apart. */
  onReadBeats: (id: string) => void;
}) {
  const [openDepth, setOpenDepth] = useState<Record<string, boolean>>({});

  const specs: DeckCardSpec[] = renders.map((r) => ({
    id: r.id,
    eyebrow: r.engineLabel,
    title: r.title,
    art: { kind: "gradient", tone: ART_TONE[r.id] ?? "", manifestKey: `engine-${r.id}` },
  }));

  return (
    <div data-testid="candidates-duel">
      <DeckStage
        cards={specs}
        pickedId={adoptedId}
        onPick={onAdopt}
        renderCard={({ spec, picked, dealDelay }) => {
          const r = renders.find((x) => x.id === spec.id)!;
          const chain = chains[r.id] ?? r.beats;
          const rewritten = chain !== r.beats;
          const words = rewritten
            ? chain.map((b) => b.text).join(" ").split(/\s+/).filter(Boolean).length
            : r.words;
          return (
            <DeckCard spec={spec} picked={picked} onPick={onAdopt} dealDelay={dealDelay}>
              <DuelCardBody
                render={r}
                words={words}
                rewritten={rewritten}
                chainLabel={chainLabel}
                report={gate.byRender[r.id]}
                picked={picked}
                open={!!openDepth[r.id]}
                onToggleOpen={() => setOpenDepth((o) => ({ ...o, [r.id]: !o[r.id] }))}
                onReadBeats={() => onReadBeats(r.id)}
              />
            </DeckCard>
          );
        }}
      />
    </div>
  );
}
