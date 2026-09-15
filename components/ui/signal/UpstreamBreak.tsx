"use client";

// BLOCKED BECAUSE AN EARLIER STEP PRODUCED NOTHING — drawn, not explained.
//
// The single highest-value component in this vocabulary. Four surfaces each
// write a 40–60 word paragraph re-teaching the same pipeline, and each teaches
// it slightly differently:
//
//   app/_phases/score/ScoreSpotting.tsx:549-558   "Cues are spans of film, and
//                                                  this project has no frames
//                                                  for them to sit on… Step 3
//                                                  is where a beat becomes a
//                                                  frame with a length."
//   app/_phases/score/ScoreSpotting.tsx:211-215    three more branches of the
//                                                  same lesson
//   app/_phases/frames/ShotSheet.tsx:134-147       "Step 1 offers candidate
//                                                  beats… Step 2 composes the
//                                                  ones you confirm into a cut.
//                                                  This step reads that cut."
//   app/_phases/script/ScriptStep.tsx:237-242      "The Script step writes
//                                                  against research, it does
//                                                  not produce it."
//
// Every one of those sentences is the app narrating its own topology. The
// topology is a five-node chain and it is already declared once, in
// lib/projects.ts `PHASES` — so this component READS it rather than carrying a
// second copy. (That file spends a paragraph on what happened the last time a
// retired step left a second copy of the order lying around.)
//
// WHAT IS DRAWN: a filled dot where the artifact exists, a hollow cyan ring —
// gently pulsing — on the missing one, a solid block on the step the user is
// standing on. The rail is cyan up to the break and hairline after it, because
// after the break nothing is known. Under the missing node: its name, ONE VERB
// AT MOST FOUR WORDS, and a real control that goes there.
//
// WHAT IS NOT SUMMARISED: `detail`. A machine line — `kind · op · message` — is
// the WORK, not narration, and the law of this directory keeps it verbatim.
//
// SEVERITY FOLLOWS Notice.tsx, which is right and must not be contradicted:
// `error` is rose and `role="alert"` (assertive, it interrupts); `info` is cyan
// and `role="status"` (polite). A blocked-by-upstream is normally `info` — it is
// a limit you should know about, not a thing that broke.
//
// The pulse is a CSS animation (`animate-pulse`), so the blanket
// `prefers-reduced-motion` rule at the foot of app/globals.css switches it off
// for free. Nothing here animates from JS; see components/ui/deck/motionGuard.ts
// for the case that would need a guard.

import Link from "next/link";

import { AlertTriangle } from "lucide-react";

import { PHASES, PHASE_TITLE, type PhaseKey } from "@/lib/projects";

import { Button } from "../Primitives";

export interface UpstreamBreakAction {
  /** THE VERB. Four words at most — "Compose the cut", "Run Step 1". */
  label: string;
  onClick?: () => void;
  href?: string;
}

export function UpstreamBreak({
  blockedAt,
  current,
  done,
  action,
  severity = "info",
  detail,
  className = "",
}: {
  /** The step whose artifact is missing. The ring. */
  blockedAt: PhaseKey;
  /** Where the user is standing. The solid block. */
  current: PhaseKey;
  /** Steps whose artifact exists. Filled dots. */
  done: PhaseKey[];
  action?: UpstreamBreakAction;
  severity?: "info" | "error";
  /** A machine line, rendered verbatim. `kind · op · message`. */
  detail?: React.ReactNode;
  className?: string;
}) {
  const breakAt = PHASES.indexOf(blockedAt);
  const isError = severity === "error";
  const shell = isError
    ? "border-rose-400/30 bg-rose-400/[0.06]"
    : "border-cyan-400/25 bg-cyan-400/[0.04]";

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`rounded-2xl border px-4 py-4 ${shell} ${className}`}
    >
      {/* the chain */}
      <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
        {PHASES.map((p, i) => {
          const blocked = p === blockedAt;
          const here = p === current;
          const hasIt = done.includes(p);
          return (
            <li key={p} className="flex items-start gap-1">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`mt-[7px] h-px w-6 ${i <= breakAt ? "bg-cyan-400/50" : "bg-white/10"}`}
                />
              )}
              <span className="flex w-16 flex-col items-center gap-1.5">
                <span className="flex h-4 items-center justify-center">
                  {blocked ? (
                    isError ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-300" aria-hidden />
                    ) : (
                      <span
                        aria-hidden
                        className="h-3 w-3 animate-pulse rounded-full border-2 border-cyan-300"
                      />
                    )
                  ) : here ? (
                    <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-white/85" />
                  ) : hasIt ? (
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
                  ) : (
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full border border-white/20" />
                  )}
                </span>
                <span
                  aria-current={here ? "step" : undefined}
                  className={`font-jetbrains text-center text-label tracking-[0.1em] ${
                    blocked
                      ? isError
                        ? "text-rose-200"
                        : "text-cyan-200"
                      : here
                        ? "text-white/85"
                        : "text-white/35"
                  }`}
                >
                  {PHASE_TITLE[p]}
                  {/* The dots are aria-hidden, so the state has to be said
                      somewhere. Three words, not a sentence — the screen-reader
                      equivalent of the picture, not a re-narration of it. */}
                  <span className="sr-only">
                    {blocked ? " — missing" : here ? " — you are here" : hasIt ? " — done" : " — not started"}
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* the verb, and the way there */}
      {action && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {action.href ? (
            <Link
              href={action.href}
              className="font-jetbrains rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/15 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {action.label}
            </Link>
          ) : (
            <Button variant="ghost" className="px-4 py-1.5" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}

      {/* the work, verbatim */}
      {detail && (
        <p
          className={`font-jetbrains mt-3 text-label leading-snug break-words ${
            isError ? "text-rose-200/90" : "text-white/45"
          }`}
        >
          {detail}
        </p>
      )}
    </div>
  );
}
