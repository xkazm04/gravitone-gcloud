// THE ONE NEXT ACTION (prototype dock-package, round 2, variant "focus"): what a step leads with, derived each render
// from the release's problems and the agent's pending proposals, never stored. The order is the operator's: a block
// first (what stops the release), then the agent's value waiting on a yes (what to take), then a warning, then
// nothing - and on the review, the release's own act (Schedule) once nothing blocks. The rail's one mark per step is
// this same derivation, so a step's mark always names what its body leads with.
import type { Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";
import { parseProposalPath, type ProposalPath, type ReleaseProposal } from "@gt/domain/release.record";

import { fieldLabel, pendingIn } from "../../../../_release/pending.ts";
import { problemsOf, STEP_LABEL, stepOf, trackIndexOf, type StepId } from "../../../../_release/wizard/steps.ts";

/** A rule in one to three words: the lead's title. The rule's own sentence (PROBLEM_TEXT) lives in the details. */
export const PROBLEM_SHORT: Readonly<Record<ProblemCode, string>> = {
  "no-tracks": "No tracks",
  "title-missing": "Title missing",
  "artist-missing": "Artist missing",
  "title-has-feat": "Feat. in title",
  "title-has-version": "Version in title",
  "title-all-caps": "All-caps title",
  "genre-missing": "Genre missing",
  "release-date-malformed": "Date format",
  "upc-malformed": "UPC format",
  "isrc-malformed": "ISRC format",
  "songwriter-missing": "No songwriter",
  "songwriter-not-full-name": "Songwriter name",
  "persona-unstated": "Persona unstated",
  "sleeve-missing": "No sleeve",
  "sleeve-not-square": "Sleeve not square",
  "sleeve-too-small": "Sleeve too small",
  "sleeve-not-rgb": "Sleeve not RGB",
  "splits-not-100": "Splits off 100%",
  "no-channel": "No channel",
  "rights-nc-licence": "Non-commercial licence",
  "rights-unknown-licence": "Licence unknown",
  "rights-unknown-vendor": "Generator unknown",
  "rights-unknown-tier": "Plan tier unknown",
};

const TRACK_FIX: Partial<Record<ProblemCode, string>> = {
  "title-missing": "title",
  "title-has-feat": "title",
  "title-has-version": "title",
  "title-all-caps": "title",
  "isrc-malformed": "isrc",
  "songwriter-missing": "songwriters",
  "songwriter-not-full-name": "songwriters",
  "persona-unstated": "ai",
  "rights-nc-licence": "rights",
  "rights-unknown-licence": "rights",
  "rights-unknown-vendor": "rights",
  "rights-unknown-tier": "rights",
};
const RELEASE_FIX: Partial<Record<ProblemCode, ProposalPath>> = {
  "title-missing": "title",
  "artist-missing": "artist",
  "genre-missing": "genre.primary",
  "release-date-malformed": "releaseDate",
  "upc-malformed": "upc",
};

/** The field a proposal would have to set to answer a problem, or null when no proposal can (the sleeve, splits). */
export function fixPath(p: ReleaseProblem): string | null {
  const ti = trackIndexOf(p);
  if (ti !== null) {
    const f = TRACK_FIX[p.code];
    return f === undefined ? null : `track:${ti + 1}.${f}`;
  }
  return p.at === "release" ? (RELEASE_FIX[p.code] ?? null) : null;
}

export type LeadKind = "block" | "warn" | "agent" | "ready" | "clear";

export interface Lead {
  /** Identity across renders: the lead's slot animates when this changes. */
  readonly key: string;
  readonly kind: LeadKind;
  readonly problem: ReleaseProblem | null;
  /** The agent's value: the suggestion itself, or the one that would answer the problem. */
  readonly proposal: ReleaseProposal | null;
  /** Everything on the step beyond the lead: the details' count. */
  readonly rest: number;
}

const answering = (pending: readonly ReleaseProposal[], p: ReleaseProblem): ReleaseProposal | null => {
  const path = fixPath(p);
  return path === null ? null : (pending.find((x) => x.path === path) ?? null);
};

export function leadOf(step: StepId, problems: readonly ReleaseProblem[], all: readonly ReleaseProposal[], release: Release): Lead {
  const mine = problemsOf(problems, step);
  const pending = pendingIn(all, step);
  const total = mine.length + pending.length;
  const block = mine.find((p) => p.severity === "block");
  const warn = mine.find((p) => p.severity === "warn");
  const first = pending[0];
  const withProblem = (kind: "block" | "warn", p: ReleaseProblem): Lead => {
    const proposal = answering(pending, p);
    return { key: `${kind}:${p.code}:${p.at}`, kind, problem: p, proposal, rest: total - 1 - (proposal === null ? 0 : 1) };
  };
  if (block !== undefined) return withProblem("block", block);
  if (first !== undefined) return { key: `agent:${first.id}`, kind: "agent", problem: null, proposal: first, rest: total - 1 };
  // A warning stops nothing (owner, wave 2): on the review, a release with nothing blocking leads with Schedule and
  // its warnings ride behind the details.
  const open = release.status !== "scheduled" && release.status !== "published";
  if (step === "review") return open ? { key: "ready", kind: "ready", problem: null, proposal: null, rest: total } : { key: "clear", kind: "clear", problem: null, proposal: null, rest: total };
  if (warn !== undefined) return withProblem("warn", warn);
  return { key: "clear", kind: "clear", problem: null, proposal: null, rest: 0 };
}

/** Where a problem sits, in a few words: `track 1`, `sleeve`; on the review also the step that fixes it. */
export function whereOf(p: ReleaseProblem, r: Release, withStep: boolean): string {
  const ti = trackIndexOf(p);
  const at = ti === null ? (p.at === "release" ? "release" : p.at) : `track ${ti + 1}${r.tracks.length > 1 ? ` · ${r.tracks[ti]?.title ?? ""}` : ""}`;
  return withStep ? `${STEP_LABEL[stepOf(p)]} · ${at}` : at;
}

/** A proposal's field without its track (`AI credits`) and where it sits (`track 1`, `release`). */
export function fieldOf(path: ProposalPath): { readonly name: string; readonly at: string } {
  const n = parseProposalPath(path)?.track ?? null;
  const label = fieldLabel(path);
  const name = label.split(" · ").pop() ?? label;
  return { name, at: n === null ? "release" : `track ${n}` };
}

/** The row of the summary a lead points at, so the read below can carry the same focus tick. */
export function focusKeyOf(lead: Lead): string | null {
  const p = lead.problem;
  if (p !== null) {
    const path = fixPath(p);
    if (p.code === "persona-unstated") return "persona";
    if (p.code === "rights-unknown-tier") return "planTier";
    if (p.code === "rights-unknown-vendor") return "vendor";
    if (p.code === "rights-nc-licence" || p.code === "rights-unknown-licence") return "licence";
    if (p.at === "sleeve") return "sleeve";
    if (p.at === "splits") return "sum";
    if (p.at === "channels") return "channels";
    if (p.code === "no-tracks") return "tracks";
    if (path !== null) return keyOfPath(path);
  }
  return lead.proposal === null ? null : keyOfPath(lead.proposal.path);
}

function keyOfPath(path: string): string {
  const p = parseProposalPath(path);
  if (p === null) return path;
  if (p.track === null) return p.field === "genre.primary" ? "genre" : p.field === "genre.secondary" ? "genre2" : p.field;
  if (p.field === "ai") return "persona";
  if (p.field === "rights") return "rights";
  if (p.field === "songwriters" || p.field === "credits" || p.field === "lyrics") return `people:${p.track}`;
  return `track:${p.track}`;
}
