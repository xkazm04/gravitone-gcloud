// THE DECISION STACK'S READING OF A RELEASE (prototype dock-package, direction "cards"): pure derivations the stack
// draws - each step's mark (block, warn, done, ahead) and counts, a problem's short name, a finished step's one-line
// summary. Nothing here is stored; every value is read off the release, its problems and the agent's pending
// proposals on each render (registry wizard-flows/progress-communication).
import { CHANNEL_NAMES, releaseKind, type Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";
import type { ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../_release/pending.ts";
import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import { problemsOf, severityOf, STEPS, type StepId } from "../../../../../_release/wizard/steps.ts";

export type Mark = "block" | "warn" | "done" | "ahead";

export interface StepMark {
  readonly step: StepId;
  readonly block: number;
  readonly warn: number;
  readonly suggested: number;
  readonly mark: Mark;
}

/** Every step's mark: its own problems (the review gathers every step's), its pending proposals, whether it is behind
 *  the walk (seen, or folded above the step in focus - a clean step the stack has passed is finished). */
export function marksOf(problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[], seen: ReadonlySet<StepId>, current: StepId): StepMark[] {
  const at = STEPS.indexOf(current);
  return STEPS.map((step, i) => {
    const sev = severityOf(problemsOf(problems, step));
    const suggested = step === "review" ? 0 : pendingIn(pending, step).length;
    const mark: Mark = sev.block > 0 ? "block" : sev.warn > 0 ? "warn" : seen.has(step) || i < at ? "done" : "ahead";
    return { step, block: sev.block, warn: sev.warn, suggested, mark };
  });
}

/** A problem's name on a chip; its rule, verbatim, is PROBLEM_TEXT in the rule dialog. */
export const ISSUE_LABEL: Readonly<Record<ProblemCode, string>> = {
  "no-tracks": "no tracks",
  "title-missing": "title missing",
  "artist-missing": "artist missing",
  "title-has-feat": "feat. in title",
  "title-has-version": "version in title",
  "title-all-caps": "all-caps title",
  "genre-missing": "genre missing",
  "release-date-malformed": "date format",
  "upc-malformed": "UPC format",
  "isrc-malformed": "ISRC format",
  "songwriter-missing": "songwriter missing",
  "songwriter-not-full-name": "songwriter name",
  "persona-unstated": "persona unstated",
  "sleeve-missing": "sleeve missing",
  "sleeve-not-square": "sleeve not square",
  "sleeve-too-small": "sleeve small",
  "sleeve-not-rgb": "sleeve not RGB",
  "splits-not-100": "splits ≠ 100%",
  "no-channel": "no channel",
  "rights-nc-licence": "CC BY-NC",
  "rights-unknown-licence": "licence unknown",
  "rights-unknown-vendor": "generator unknown",
  "rights-unknown-tier": "plan tier unknown",
};

/** The release field a release-level problem sits on (the details tile it marks). */
export const ISSUE_FIELD: Partial<Readonly<Record<ProblemCode, string>>> = {
  "title-missing": "title",
  "title-has-feat": "title",
  "title-has-version": "title",
  "title-all-caps": "title",
  "artist-missing": "artist",
  "genre-missing": "genre.primary",
  "release-date-malformed": "releaseDate",
  "upc-malformed": "upc",
};

export const titleOf = (r: Release): string => (r.title.trim() === "" ? "untitled" : r.title);
export const totalOf = (r: Release): number => r.tracks.reduce((a, t) => a + t.durationS, 0);

/** A finished step folded to one line: the values it settled, as chips. */
export function summaryOf(step: StepId, r: Release): readonly string[] {
  switch (step) {
    case "tracks":
      return [KIND_LABEL[releaseKind(r.tracks)], `${r.tracks.length} ${r.tracks.length === 1 ? "track" : "tracks"}`, clock(totalOf(r))];
    case "details":
      return [r.genre.primary ?? "no genre", r.releaseDate === null ? "no date" : day(r.releaseDate), r.label ?? "no label"];
    case "rights": {
      const stated = r.tracks.filter((t) => t.ai.audio !== "all" || t.ai.persona !== null).length;
      const licences = [...new Set(r.tracks.map((t) => (t.rights.licence === "cc-by-nc" ? "CC BY-NC" : t.rights.licence)))];
      return [`persona ${stated}/${r.tracks.length}`, ...licences];
    }
    case "sleeve":
      return r.sleeve === null ? ["no sleeve"] : [`${r.sleeve.widthPx} × ${r.sleeve.heightPx}`, r.sleeve.rgb ? "RGB" : "not RGB"];
    case "channels":
      return r.channels.length === 0 ? ["none"] : r.channels.map((c) => CHANNEL_NAMES[c]);
    case "extras": {
      const sum = Math.round(r.splits.reduce((a, x) => a + x.share, 0) * 100) / 100;
      return r.splits.length === 0 ? ["no splits"] : [`${r.splits.length} splits`, `${sum}%`];
    }
    case "review":
      return [r.status];
  }
}
