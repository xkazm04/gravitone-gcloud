"use client";

// A PROBLEM ON A CARD (kit candidate `IssueChip`): the kit's Chip in the problem's tone, its short name, and a press
// that opens the rule in the store's own words (PROBLEM_TEXT, verbatim - that sentence is the work) with where it sits
// and, when it lives on another step, the door to it. A warning is as loud as a block and stops nothing.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { PROBLEM_TEXT, type ReleaseProblem } from "@gt/domain/release.problems";

import { STEP_LABEL, stepOf, trackIndexOf, type StepId } from "../../../../../_release/wizard/steps.ts";
import { Sheet } from "./Door.tsx";
import { ISSUE_LABEL } from "./model.ts";
import s from "./parts.module.css";

export interface IssueChipProps {
  readonly problem: ReleaseProblem;
  /** Track titles in release order, to name a track-level problem's place. */
  readonly tracks: readonly string[];
  /** The step's door, when the chip sits away from the step that fixes it (the review). */
  readonly go?: (step: StepId, track?: number) => void;
}

export function whereOf(p: ReleaseProblem, tracks: readonly string[]): string {
  const ti = trackIndexOf(p);
  return ti === null ? STEP_LABEL[stepOf(p)] : `${STEP_LABEL[stepOf(p)]} · ${ti + 1} ${tracks[ti] ?? ""}`.trim();
}

export function IssueChip({ problem: p, tracks, go }: IssueChipProps) {
  const [open, setOpen] = useState(false);
  const tone = p.severity === "block" ? "rose" : "amber";
  const ti = trackIndexOf(p);
  const label = ti === null || tracks.length < 2 ? ISSUE_LABEL[p.code] : `${ti + 1} · ${ISSUE_LABEL[p.code]}`;
  return (
    <>
      <Chip label={label} tone={tone} dot casing="lower" name={`${p.severity}: ${ISSUE_LABEL[p.code]}, ${whereOf(p, tracks)}`} onPress={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={ISSUE_LABEL[p.code]}>
        <div className={s.rule}>
          <span className={s.ruleMarks}>
            <Chip label={p.severity} tone={tone} dot />
            <Chip label={whereOf(p, tracks)} casing="lower" />
          </span>
          <blockquote className={s.ruleText}>{PROBLEM_TEXT[p.code]}</blockquote>
          {go !== undefined && (
            <span className={s.ruleAct}>
              <Button
                label={STEP_LABEL[stepOf(p)]}
                tone="cyan"
                glyphAfter="chevR"
                onPress={() => {
                  setOpen(false);
                  go(stepOf(p), ti ?? undefined);
                }}
              />
            </span>
          )}
        </div>
      </Sheet>
    </>
  );
}

/** A row of a card's problems. */
export function Issues({ problems, tracks, go, label }: { readonly problems: readonly ReleaseProblem[]; readonly tracks: readonly string[]; readonly go?: IssueChipProps["go"]; readonly label: string }) {
  if (problems.length === 0) return null;
  return (
    <ul className={s.issues} aria-label={label}>
      {problems.map((p, i) => (
        <li key={`${p.code}:${p.at}:${i}`}>
          <IssueChip problem={p} tracks={tracks} {...(go === undefined ? {} : { go })} />
        </li>
      ))}
    </ul>
  );
}
