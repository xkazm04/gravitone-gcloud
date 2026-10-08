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
import { Tally } from "@/components/ui/signal";

import { ConfirmScope } from "../_parts/ScopeGate";
import { Consequences, ScopeBar } from "../_parts/ScopeBar";
import { stateOf, type Card } from "../scope";
import type { ScopeApi } from "../useScope";
import { conclusionChoices, hotTakes, specOf, steelManOf } from "./passes";
import { FaceSwitch, type Face } from "./FaceSwitch";
import RunStage from "./RunStage";
import type { EducationalResearchApi } from "./useEducationalResearch";

// The face switch lives in ./FaceSwitch.tsx so the expert face can draw it
// without pulling this wizard into its chunk (ResearchStep's split).
export { FaceSwitch, type Face };

/* ── a stage of keep/cut cards over the live scope ────────────────────────── */

/** Deals `cards` and writes every pick THROUGH the scope api — `toggle` is the
 *  exact call the board's CardTile makes, so a decision made here IS the board
 *  moving. `pickedId` is unused (these are independent toggles, not a
 *  single-choice hand), so the default path never renders. */
function ChoiceDeck({ cards, api }: { cards: Card[]; api: ScopeApi }) {
  const specs = cards.map((c) => specOf(c, stateOf(api.scope, c.id, api.optIn)));
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
        const kept = !stateOf(api.scope, spec.id, api.optIn).descoped;
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
  // Cards exist: the replay landed, or the creator's own notebook is the active
  // source (useEducationalResearch's `dealt`).
  const dealt = research.dealt;
  // A notebook that already exists opens the wizard on stage 2 — stage 1 has
  // nothing to ask, only a record to show (RunStage's compact card).
  const [active, setActive] = useState(() => (dealt ? 1 : 0));

  const hot = useMemo(() => hotTakes(api.cards), [api.cards]);
  const steel = useMemo(() => steelManOf(api.cards), [api.cards]);
  const picks = useMemo(() => conclusionChoices(api.cards), [api.cards]);

  const takesHand = useMemo(() => [...hot, ...(steel ? [steel] : [])], [hot, steel]);
  const hotKept = hot.filter((c) => !stateOf(api.scope, c.id, api.optIn).descoped).length;
  const taken = picks.filter((c) => !stateOf(api.scope, c.id, api.optIn).descoped).length;

  const s = api.summary;
  const drifted = api.diverged.length;

  // WHAT THE REVIEW STAGE CONFIRMS THAT THE WIZARD NEVER SHOWED (B-002, the
  // interim of C-001 — docs/product/concepts/guided-research-hand.md). The
  // wizard deals the takes and the conclusions; the facts, mechanisms,
  // reversals and counters are in scope by default and are never on its table.
  // `confirm scope` then signs off on all of them, which a fact-vetter read as
  // "confirmed 29 cards after dealing me 8" (uat 2026-09-05, PR-L1-5). So the
  // review stage counts what it did not deal, by kind, and the way to see them
  // is the button beside the count — the expert board, where every card is.
  const unseen = useMemo(() => {
    const dealtIds = new Set([...takesHand, ...picks].map((c) => c.id));
    return api.cards.filter((c) => !dealtIds.has(c.id));
  }, [api.cards, takesHand, picks]);
  const unseenKept = unseen.filter((c) => !stateOf(api.scope, c.id, api.optIn).descoped).length;
  const unseenByKind = useMemo(() => {
    const n = new Map<Card["kind"], number>();
    for (const c of unseen) n.set(c.kind, (n.get(c.kind) ?? 0) + 1);
    return [...n].map(([kind, count]) => `${count} ${kind}${count === 1 ? "" : "s"}`).join(" · ");
  }, [unseen]);

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
      // NAMES ONLY WHAT THE READER CAN SEE. It used to read "run the research,
      // or load the saved run" — and "load the saved run" is an evaluation
      // control that no longer renders in a production build (run/controls.tsx),
      // so for a user the hint named a button that is not there. A gate that
      // points at a missing control is worse than one that says nothing.
      //
      // EITHER RUN OPENS IT (research-scope-board-A stage 3). This used to be
      // the replay landing only, because everything after this stage was dealt
      // from the shipped fixture and a reasoned notebook would have unlocked
      // somebody else's cards under the creator's topic. The takes, the
      // conclusions and the scope arithmetic are now dealt from the project's
      // active notebook, so the creator's own notebook opens them as itself.
      blockedHint: "run the research to deal the takes",
      done: dealt,
      summary: dealt ? "notebook ready" : undefined,
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
      done: dealt,
      summary: hot.length ? `hottest ${hotKept ? "taken" : "not taken"}` : "read",
      content: <ChoiceDeck cards={takesHand} api={api} />,
    },
    {
      id: "conclusions",
      label: "conclusions",
      headline: "Which conclusions travel with the script?",
      done: dealt,
      summary: `${taken}/${picks.length} taken`,
      content: <ChoiceDeck cards={picks} api={api} />,
    },
    {
      id: "review",
      label: "review",
      headline: "What did your scope decisions cost?",
      done: dealt,
      summary: api.confirmed
        ? drifted
          ? "moved since confirm"
          : "confirmed"
        : `${s.kept}/${s.total} in scope`,
      content: (
        <div className="mx-auto w-full max-w-3xl space-y-5">
          <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-5">
            <ScopeBar api={api} trouble={research.trouble} />
          </div>
          <Consequences api={api} />
          {unseen.length > 0 && (
            <div
              data-testid="review-undealt"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] px-5 py-3.5"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Tally label="dealt" value={api.cards.length - unseen.length} of={api.cards.length} />
                <Tally label="not dealt" value={unseen.length} tone="amber" />
                <span className="font-jetbrains text-label text-white/45">
                  {unseenByKind} · {unseenKept} in scope
                </span>
              </div>
              <button
                type="button"
                data-testid="review-undealt-board"
                onClick={() => onSwitchFace("expert")}
                className="font-jetbrains rounded-full border border-amber-400/35 px-3.5 py-1.5 text-label text-amber-200 transition hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                review them on the expert board →
              </button>
            </div>
          )}
          <ConfirmScope api={api} />
        </div>
      ),
    },
  ];

  return (
    <Deck
      // NO EYEBROW (operator, 2026-09-09) — the same ruling that took `create`
      // off the project wizard, applied to the tag this face drew in the same
      // slot. It read `step 1 · research · guided`, on its own row above the
      // stage rail, and every third of it was already on screen: the studio's
      // own stepper marks step 1 Research as current (app/studio/[projectId]/
      // phases.tsx), and which FACE you are on is what the FaceSwitch in the
      // footer below says and is the control that changes it. Deck's `eyebrow`
      // stays optional and its rail's top margin is conditional on it, so the
      // row leaves no gap behind.
      stages={stages}
      active={active}
      onNavigate={setActive}
      finishLabel="Go to Step 2 · Script →"
      onFinish={onFinish}
      exit={<FaceSwitch face="guided" onSwitch={onSwitchFace} />}
    />
  );
}
