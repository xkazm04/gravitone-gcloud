"use client";

// THE DECK SHELL — a full-viewport wizard drawn as a card table.
//
// One decision per stage: a headline asks the question, the stage's cards are
// the candidate answers, and the controls move between stages. Progression is
// linear but freely navigable BACKWARD — going back discards nothing, because
// the state lives with the consumer and this shell only reports navigation.
// Forward is earned: a stage is reachable when everything before it is done,
// and Next stays disabled until the active stage's requirement is met. A stage
// that declares `advance: "pick"` draws no Next at all — its content is the
// forward control (DeckStageDef#advance).
//
// The active stage's content is keyed by stage id, so moving between stages
// remounts it and the deal-in entrance fires again — a stage you return to is
// re-dealt, which is the deck saying "this decision is open again".

import { Button } from "../Primitives";
import { ArtVariantSwitcher } from "./artVariants";

export interface DeckStageDef {
  id: string;
  /** Short mono name in the step rail. */
  label: string;
  /** The question this stage asks — the serif headline over the cards. */
  headline: string;
  /**
   * One supporting line under the headline — AND USUALLY A SIGN THE HEADLINE IS
   * WRONG.
   *
   * Genuinely optional, and stated as such because the shape of a container is
   * a prompt: a slot that renders under every headline is a slot every stage
   * fills, and what gets typed into it is the app explaining the question it
   * just asked. If a stage needs a `sub`, the first thing to try is a better
   * `headline` — the two of them together are one question, and a question that
   * takes two sentences has not been decided yet.
   *
   * What legitimately survives here is the WORK, not the app: a constraint, a
   * number, a real limit. Anything that begins "This stage lets you…" is
   * narration and goes. See components/ui/signal/README.md for the law and for
   * the shapes that replace a sentence.
   *
   * The layout carries no orphan margin when it is absent: the spacing lives on
   * the <p> itself (`mt-2`), so a stage with no `sub` renders its headline
   * against the table with nothing between them.
   */
  sub?: React.ReactNode;
  /** Whether this stage's requirement is met (gates Next, and forward rail). */
  done: boolean;
  /** What was decided, shown in the rail once done — "Movie · game trailer". */
  summary?: string;
  /** Why Next is disabled, in the user's words — drawn beside the button while
   *  the stage is not done. A disabled control that says nothing about what
   *  enables it is a wall, not a gate. Only read on a committing stage: with
   *  no button to explain, a hint explains nothing. */
  blockedHint?: string;
  /** How this stage is COMMITTED — and so whether the footer draws Next at all.
   *
   *  · "control" (the default) — the footer's Next/finish button advances it.
   *  · "pick" — the stage's own content commits it AND moves on, so there is
   *    nothing left for a button to do. The create wizard's three card stages
   *    are this shape (CreateWizard#pickDiscipline: "Picking IS the Next
   *    click"), and the button they used to draw was dead in every state a
   *    user could see it in — `done` and the stage change happen in the same
   *    handler, so Next was permanently disabled and permanently accompanied
   *    by a hint telling the user to do the thing that takes them off the
   *    stage. Both go (2026-09-08). Back stays: it is the change of mind. */
  advance?: "control" | "pick";
  /** The stage body — usually a DeckStage, but any surface fits (the name
   *  stage is a form, and an empty deck renders its honest empty state). */
  content: React.ReactNode;
}

export default function Deck({
  eyebrow,
  stages,
  active,
  onNavigate,
  finishLabel,
  onFinish,
  busy = false,
  notice,
  exit,
  onBack,
}: {
  eyebrow?: React.ReactNode;
  stages: DeckStageDef[];
  active: number;
  onNavigate: (index: number) => void;
  /** What the Back control does, when stepping back is more than `active - 1`.
   *  A consumer that mirrors its stages into session history (CreateWizard)
   *  passes `history.back` here so ONE gesture means one thing: the in-page
   *  Back and the browser's own Back walk the same entries in the same order.
   *  Unset = the plain default, navigate one stage left. */
  onBack?: () => void;
  /** The last stage's primary action — "Create & open". */
  finishLabel: string;
  onFinish: () => void;
  /** Latched while the finish write is in flight — the CTA says so and locks. */
  busy?: boolean;
  /** Rendered above the controls — the consumer's error/status banner. */
  notice?: React.ReactNode;
  /** A low-key way out of the wizard (a Link back to where it was opened). */
  exit?: React.ReactNode;
}) {
  const stage = stages[active];
  const isLast = active === stages.length - 1;
  /** A "pick" stage has no forward control — its cards are the control. */
  const commits = stage.advance !== "pick";

  /** Backward is always free; forward only over ground already covered. */
  const reachable = (i: number): boolean =>
    i <= active || stages.slice(0, i).every((s) => s.done);

  return (
    <div className="relative flex min-h-[calc(100dvh-9rem)] flex-col">
      {/* header row: eyebrow + rail on the left, and in development only the
          prototype art switch in the corner on the right */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow}
          <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {stages.map((s, i) => {
              const activeStage = i === active;
              return (
                <li key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span aria-hidden className="font-jetbrains text-label text-white/20">
                      →
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={!reachable(i)}
                    aria-current={activeStage ? "step" : undefined}
                    onClick={() => onNavigate(i)}
                    className={`font-jetbrains rounded-full border px-2.5 py-1 text-label tracking-[0.12em] transition disabled:cursor-not-allowed ${
                      activeStage
                        ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                        : s.done
                          ? "border-white/12 text-white/60 hover:border-white/25 hover:text-white/85"
                          : reachable(i)
                            ? "border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
                            : "border-white/[0.06] text-white/25"
                    }`}
                  >
                    <span className={activeStage ? "" : s.done ? "text-emerald-200/80" : ""}>
                      {s.done && !activeStage ? "✓" : i + 1}
                    </span>{" "}
                    {s.label}
                    {s.done && s.summary && !activeStage && (
                      <span className="ml-1 text-cyan-200/70 normal-case">· {s.summary}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
        {/* THE BAKE-OFF SWITCH IS AN OPERATOR CONTROL, AND IT SHIPPED (2026-09-08).
            It was rendered unconditionally, so every user creating a project met
            an "ART · gradient | illustrated | emblem" toggle — and on the two
            stages where it is most prominent it does NOTHING: the create
            wizard's discipline and template cards PIN `artVariant: "emblem"`
            (DeckCard#artVariant, the operator's 2026-08-30 verdict), which wins
            over this switch. Captured at 1920: the switch reading "gradient"
            over three cards drawing emblems.

            GATED, NOT DELETED, because the bake-off is settled only where a card
            pins itself. The script duel's engine cards (CandidatesDuel.tsx) pass
            `engine-*` manifest keys and pin nothing, so they still follow this
            switch — their illustrated faces (public/deck-art/engine-*) and their
            emblems exist and have never been ruled on. Deleting the switch would
            retire that comparison by accident and freeze those cards on the
            store's default, and it would strand `gravitone.deck.art` in
            lib/identityEviction.ts and its probe.

            The guard is the inline `process.env.NODE_ENV === "development"`
            literal app/layout.tsx uses for <DevInspector /> — Next inlines it
            and the branch is eliminated, so the control does not render for a
            user. Note the distinction pipeline/check-bundle.mjs draws: a gate
            like this stops something RUNNING, not necessarily shipping. That is
            the right bar here (a switcher in a chunk is inert; a leaked key or a
            reachable test harness is not), which is why no fingerprint is
            added for it. */}
        {process.env.NODE_ENV === "development" && <ArtVariantSwitcher />}
      </div>

      {/* the question */}
      <header className="mt-8">
        <h1 className="font-instrument text-3xl text-white sm:text-4xl">{stage.headline}</h1>
        {/* text-content, never smaller. The stage's supporting line is PROSE the
            user reads to answer the question above it — globals.css's scale puts
            that on the content rung, and it sat on `text-sm` (the label floor,
            for chips and stamps) until 2026-09-06. A subtitle is not a label. */}
        {stage.sub && (
          <p className="font-hanken mt-2 max-w-2xl text-content leading-relaxed text-slate-400">
            {stage.sub}
          </p>
        )}
      </header>

      {/* the table — keyed so returning to a stage re-deals it */}
      <div key={stage.id} className="mt-8 grow">
        {stage.content}
      </div>

      {notice && <div className="mt-6">{notice}</div>}

      {/* controls */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5 pb-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="cursor-pointer px-4 py-2"
            disabled={active === 0 || busy}
            onClick={() => (onBack ? onBack() : onNavigate(active - 1))}
          >
            Back
          </Button>
          {exit}
        </div>
        {/* The forward half — only on a stage that HAS a forward control. A
            "pick" stage commits from its own cards, so this side of the footer
            is empty by design and Back keeps the left edge on its own. */}
        {commits && (
          <div className="flex items-center gap-3">
            {!stage.done && stage.blockedHint && (
              <span data-testid="deck-blocked-hint" className="font-jetbrains text-label text-white/40">
                {stage.blockedHint}
              </span>
            )}
            <Button
              className="cursor-pointer px-6 py-2.5"
              disabled={!stage.done || busy}
              onClick={() => (isLast ? onFinish() : onNavigate(active + 1))}
            >
              {isLast ? (busy ? "Saving…" : finishLabel) : "Next"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
