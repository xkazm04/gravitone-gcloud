"use client";

// THE DECK SHELL — a full-viewport wizard drawn as a card table.
//
// One decision per stage: a headline asks the question, the stage's cards are
// the candidate answers, and the controls move between stages. Progression is
// linear but freely navigable BACKWARD — going back discards nothing, because
// the state lives with the consumer and this shell only reports navigation.
// Forward is earned: a stage is reachable when everything before it is done,
// and Next stays disabled until the active stage's requirement is met.
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
  /** One supporting line under the headline. */
  sub?: React.ReactNode;
  /** Whether this stage's requirement is met (gates Next, and forward rail). */
  done: boolean;
  /** What was decided, shown in the rail once done — "Movie · game trailer". */
  summary?: string;
  /** Why Next is disabled, in the user's words — drawn beside the button while
   *  the stage is not done. A disabled control that says nothing about what
   *  enables it is a wall, not a gate. */
  blockedHint?: string;
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
}: {
  eyebrow?: React.ReactNode;
  stages: DeckStageDef[];
  active: number;
  onNavigate: (index: number) => void;
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

  /** Backward is always free; forward only over ground already covered. */
  const reachable = (i: number): boolean =>
    i <= active || stages.slice(0, i).every((s) => s.done);

  return (
    <div className="relative flex min-h-[calc(100dvh-9rem)] flex-col">
      {/* header row: eyebrow + rail on the left, the prototype art switch in
          the corner on the right */}
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
        <ArtVariantSwitcher />
      </div>

      {/* the question */}
      <header className="mt-8">
        <h1 className="font-instrument text-3xl text-white sm:text-4xl">{stage.headline}</h1>
        {stage.sub && (
          <p className="font-hanken mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
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
            onClick={() => onNavigate(active - 1)}
          >
            Back
          </Button>
          {exit}
        </div>
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
      </div>
    </div>
  );
}
