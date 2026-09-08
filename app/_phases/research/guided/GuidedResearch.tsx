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
import DeckCard from "@/components/ui/deck/DeckCard";
import DeckStage from "@/components/ui/deck/DeckStage";
import { Eyebrow } from "@/components/ui/Primitives";

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
        if (card?.required) {
          // The steel-man: a card with no choice IN it — DeckCard's own
          // `pickable: false` face (no target, no lift), dealt with the hand.
          // ScopeChip's words plus the reason it cannot leave.
          return (
            <DeckCard
              spec={{
                ...spec,
                pickable: false,
                chips: [{ label: "locked in scope — always travels", tone: "amber" }],
                footnote: card.requiredWhy ?? spec.footnote,
              }}
              picked={false}
              onPick={() => undefined}
              dealDelay={dealDelay}
            />
          );
        }
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
  onFinish,
}: {
  research: EducationalResearchApi;
  api: ScopeApi;
  onOpenNotebook: () => void;
  onOpenEvidence: () => void;
  onClear: () => void;
  onSwitchFace: (f: Face) => void;
  /** The last stage's primary action — go to Step 2. The expert board stays
   *  one click away through the FaceSwitch in the exit slot. */
  onFinish: () => void;
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

  // NO STAGE CARRIES A `sub`, AND THAT IS THE POINT. All four did, and each was
  // a manual for the cards directly beneath it — the run stage re-explained the
  // background job the run log states while it is running; the takes stage
  // explained a lock the steel-man card already wears as a chip ("locked in
  // scope — always travels") with `requiredWhy` as its footnote; the
  // conclusions stage explained a default the cards themselves draw ("not
  // taken" vs "taken", passes.tsx::specOf); the review stage explained the
  // arithmetic that IS the panel below it. Deck#sub's own doc says a stage
  // needing one usually needs a better headline instead — these four had good
  // headlines and a paragraph anyway, because the slot was there.
  //
  // What the run stage's `sub` was doing that nothing else did — telling a
  // reader why Next will not move — is `blockedHint`, which draws it beside the
  // disabled button rather than three screens above it.
  const stages: DeckStageDef[] = [
    {
      id: "run",
      label: "run",
      headline: "What should the research investigate?",
      blockedHint: "run the research, or load the saved run",
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
      done: ready,
      summary: `${taken}/${picks.length} taken`,
      content: <ChoiceDeck cards={picks} api={api} />,
    },
    {
      id: "review",
      label: "review",
      headline: "What did your scope decisions cost?",
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
      finishLabel="Go to Step 2 · Script →"
      onFinish={onFinish}
      exit={<FaceSwitch face="guided" onSwitch={onSwitchFace} />}
    />
  );
}
