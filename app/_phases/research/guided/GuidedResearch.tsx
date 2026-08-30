"use client";

// THE GUIDED FACE of the educational Research step — a staged wizard over the
// SAME data and the SAME stores as the expert board. There is no parallel
// state anywhere in this directory: every keep/cut below goes through
// `useScope`'s toggle (the api CardTile writes through), the run is the one
// engine in run/useResearchRun.ts, and switching faces mid-decision shows the
// identical scope on the other side because there is only one scope to show.
//
// Four stages on the deck engine (components/ui/deck — fully controlled, this
// file owns the stage index):
//   1 · run          — topic in, trace out (RunStage.tsx)
//   2 · the takes    — the hottest take(s) as keep/cut cards, and the steel-man
//                      dealt with NO pick target: it always travels, and a card
//                      that cannot be cut must not look like a choice.
//   3 · conclusions  — the opt-in conclusions dealt as choices. Picking takes
//                      one into scope; unpicked stays not taken — the default
//                      state, not a decision (scope.ts::OPT_IN_DEFAULT).
//   4 · review       — the wounds arithmetic and the checkpoint, all reused
//                      surfaces (ScopeBar, Consequences, ConfirmScope): the
//                      wizard re-frames them, it does not re-implement them.

import { useMemo, useState } from "react";

import Deck, { type DeckStageDef } from "@/components/ui/deck/Deck";
import DeckCard, { type DeckCardSpec } from "@/components/ui/deck/DeckCard";
import DeckStage from "@/components/ui/deck/DeckStage";
import { DeckArtView } from "@/components/ui/deck/artVariants";
import { useDeckReducedMotion } from "@/components/ui/deck/motionGuard";
import { SURFACE } from "@/components/ui/tokens";
import { Eyebrow } from "@/components/ui/Primitives";
import { motion } from "motion/react";

import type { GuidedModeStepData } from "../../_shared/stepStore";
import { ConfirmScope } from "../_parts/ScopeGate";
import { Consequences, ScopeBar } from "../_parts/ScopeBar";
import { stateOf, type Card } from "../scope";
import type { ScopeApi } from "../useScope";
import { conclusionChoices, hotTakes, specOf, steelManOf } from "./passes";
import RunStage from "./RunStage";
import type { EducationalResearchApi } from "./useEducationalResearch";

export type Face = GuidedModeStepData["mode"];

/** The way to the other face, on BOTH faces, discarding nothing — the
 *  ModeChooser doctrine, one step over. One face is mounted at a time, so the
 *  testid stays unique on the page. */
export function FaceSwitch({ face, onSwitch }: { face: Face; onSwitch: (f: Face) => void }) {
  const other: Face = face === "guided" ? "expert" : "guided";
  const word = other === "expert" ? "the expert board" : "the guided wizard";
  return (
    <button
      type="button"
      data-testid="research-face-switch"
      onClick={() => onSwitch(other)}
      title={`Switch to ${word}. Nothing is discarded — both faces read and write the same record.`}
      className="font-jetbrains rounded-full border border-white/12 px-2.5 py-1 text-label tracking-[0.1em] text-white/45 transition hover:border-white/25 hover:text-white/75"
    >
      switch to {word}
    </button>
  );
}

/* ── the steel-man's card — dealt, never pickable ─────────────────────────── */

// DeckCard always lays its whole-card pick target over the card, and its
// `disabled` dims the card to half opacity — both wrong here: the steel-man is
// not a switched-off choice, it is a card with no choice IN it. So this is the
// deck's card frame with the target simply absent, stating what that absence
// means. The entrance mirrors DeckCard's deal spring (same numbers) so the two
// kinds of card land as one hand; reduced motion collapses it to opacity the
// same way.
function RequiredCard({
  spec,
  why,
  dealDelay,
}: {
  spec: DeckCardSpec;
  why?: string;
  dealDelay: number;
}) {
  const reduced = useDeckReducedMotion();
  return (
    <motion.article
      data-testid={`deck-card-${spec.id}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.9 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0.2 }
          : {
              type: "spring",
              stiffness: 240,
              damping: 26,
              mass: 0.9,
              delay: dealDelay,
              opacity: { duration: 0.35, delay: dealDelay },
            }
      }
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl ${SURFACE}`}
    >
      <div className="relative h-28 shrink-0 overflow-hidden sm:h-32">
        <DeckArtView art={spec.art} title={spec.title} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--gt-ink)]/60 to-transparent"
        />
      </div>
      <div className="flex grow flex-col gap-2 p-4">
        {spec.eyebrow && (
          <span className="font-jetbrains text-label tracking-[0.16em] text-white/35 uppercase">
            {spec.eyebrow}
          </span>
        )}
        <h3 className="font-instrument text-xl leading-snug text-slate-100">{spec.title}</h3>
        {spec.body && (
          <p className="font-hanken line-clamp-4 text-content leading-relaxed text-slate-400">
            {spec.body}
          </p>
        )}
        {/* ScopeChip's words for a required card, so the two faces agree. */}
        <span className="font-jetbrains w-fit rounded-full border border-amber-400/30 bg-amber-400/[0.06] px-2 py-0.5 text-label tracking-[0.1em] text-amber-200">
          locked in scope — always travels
        </span>
        {why && (
          <p className="font-jetbrains mt-auto pt-1 text-label leading-relaxed text-white/35">
            {why}
          </p>
        )}
      </div>
    </motion.article>
  );
}

/* ── a stage of keep/cut cards over the live scope ────────────────────────── */

/** Deals `cards` and writes every pick THROUGH the scope api — `toggle` is the
 *  exact call the board's CardTile makes, so a decision made here IS the board
 *  moving. `pickedId` is unused (these are independent toggles, not a
 *  single-choice hand), so the default path never renders. */
function ChoiceDeck({ cards, api }: { cards: Card[]; api: ScopeApi }) {
  const specs = cards.map((c) => specOf(c, stateOf(api.scope, c.id)));
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  return (
    <DeckStage
      cards={specs}
      pickedId={null}
      onPick={() => undefined}
      renderCard={({ spec, dealDelay }) => {
        const card = byId.get(spec.id);
        if (card?.required) return <RequiredCard spec={spec} why={card.requiredWhy} dealDelay={dealDelay} />;
        const kept = !stateOf(api.scope, spec.id).descoped;
        return (
          <DeckCard
            spec={spec}
            picked={kept}
            onPick={() => api.toggle(spec.id, "descoped")}
            dealDelay={dealDelay}
          />
        );
      }}
    />
  );
}

/* ── the wizard ───────────────────────────────────────────────────────────── */

export default function GuidedResearch({
  research,
  api,
  onOpenNotebook,
  onOpenEvidence,
  onClear,
  onSwitchFace,
}: {
  research: EducationalResearchApi;
  api: ScopeApi;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onClear: () => void;
  onSwitchFace: (f: Face) => void;
}) {
  const ready = research.ready;
  // A notebook that already exists opens the wizard on stage 2 — stage 1 has
  // nothing to ask, only a record to show (RunStage's compact card).
  const [active, setActive] = useState(() => (ready ? 1 : 0));

  const hot = useMemo(() => hotTakes(api.cards), [api.cards]);
  const steel = useMemo(() => steelManOf(api.cards), [api.cards]);
  const picks = useMemo(() => conclusionChoices(api.cards), [api.cards]);

  const takesHand = useMemo(() => [...hot, ...(steel ? [steel] : [])], [hot, steel]);
  const hotKept = hot.filter((c) => !stateOf(api.scope, c.id).descoped).length;
  const taken = picks.filter((c) => !stateOf(api.scope, c.id).descoped).length;

  const s = api.summary;
  const drifted = api.diverged.length;

  const stages: DeckStageDef[] = [
    {
      id: "run",
      label: "run",
      headline: "What should the research investigate?",
      sub: "A topic in, a notebook out. The run is a background job — leave this step and the bell reports the result. The stages after this one deal the notebook's decisions as cards.",
      done: ready,
      summary: ready ? "notebook ready" : undefined,
      content: (
        <RunStage
          research={research}
          onOpenNotebook={onOpenNotebook}
          onOpenEvidence={onOpenEvidence}
          onClear={onClear}
        />
      ),
    },
    {
      id: "takes",
      label: "the takes",
      headline: "The takes that need your eyes first",
      sub: "The steel-man always travels — the library forbids cutting it, so it has no pick target. The hottest take is yours: picking the card takes it into the script, picking again puts it back. Nothing here is final; the board and every later stage read the same record.",
      // READ decisions with an honest default — met as soon as the cards exist.
      // Not `true` outright: a fresh step would draw ✓ and a summary for cards
      // that do not exist yet, which is a checkmark over nothing.
      done: ready,
      summary: hot.length ? `hottest ${hotKept ? "taken" : "not taken"}` : "read",
      content: <ChoiceDeck cards={takesHand} api={api} />,
    },
    {
      id: "conclusions",
      label: "conclusions",
      headline: "Which conclusions travel with the script?",
      sub: "A conclusion is a leap past the evidence, so every one starts OUT of scope — picking a card takes it, and an unpicked card simply stays not taken. That default is the board's own rule, not this wizard's.",
      done: ready,
      summary: `${taken}/${picks.length} taken`,
      content: <ChoiceDeck cards={picks} api={api} />,
    },
    {
      id: "review",
      label: "review",
      headline: "What did your scope decisions cost?",
      sub: "The notebook is a graph — cutting a card can quietly disarm a turn three beats away. This is the arithmetic, and the checkpoint the board's gate takes.",
      done: ready,
      summary: api.confirmed
        ? drifted
          ? "moved since confirm"
          : "confirmed"
        : `${s.kept}/${s.total} in scope`,
      content: (
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
            <ScopeBar api={api} />
          </div>
          <Consequences api={api} />
          <ConfirmScope api={api} />
        </div>
      ),
    },
  ];

  return (
    <Deck
      eyebrow={<Eyebrow>step 1 · research · guided</Eyebrow>}
      stages={stages}
      active={active}
      onNavigate={setActive}
      finishLabel="Open the expert board"
      onFinish={() => onSwitchFace("expert")}
      exit={<FaceSwitch face="guided" onSwitch={onSwitchFace} />}
    />
  );
}
