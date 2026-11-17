// THE SHEET'S MODEL (prototype dock-package, round 2, variant "sheet"): pure. A step's page is set in SECTIONS, and
// every problem and every pending proposal is filed under the one section whose editor answers it - so the lead's
// list can send an item straight to the form that fixes it, and the rail and the lead read the same derivation.
// Nothing here is stored: it is recomputed from `releaseProblems` and `session.pending` each render.
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";
import { parseProposalPath, type ProposalPath, type ReleaseProposal } from "@gt/domain/release.record";

import { pendingIn } from "../../../../../_release/pending.ts";
import { problemsOf, severityOf, stepOf, trackIndexOf, type StepId } from "../../../../../_release/wizard/steps.ts";

export type SectionId = "list" | "shelf" | "release" | "people" | "ai" | "record" | "sleeve" | "prompt" | "channels" | "splits" | "previews";

export const SECTION_LABEL: Readonly<Record<SectionId, string>> = {
  list: "Tracks",
  shelf: "Shelf",
  release: "Release",
  people: "People",
  ai: "AI credits",
  record: "Rights record",
  sleeve: "Sleeve",
  prompt: "Prompt",
  channels: "Channels",
  splits: "Splits",
  previews: "Around the release",
};

export const SECTION_STEP: Readonly<Record<SectionId, StepId>> = {
  list: "tracks",
  shelf: "tracks",
  release: "details",
  people: "details",
  ai: "rights",
  record: "rights",
  sleeve: "sleeve",
  prompt: "sleeve",
  channels: "channels",
  splits: "extras",
  previews: "extras",
};

/** The sections whose editor works on one track at a time. */
export const PER_TRACK: ReadonlySet<SectionId> = new Set(["people", "ai", "record"]);

export function sectionOfProblem(p: ReleaseProblem): SectionId {
  const step = stepOf(p);
  if (step === "details") return p.at === "release" ? "release" : "people";
  if (step === "rights") return p.code === "persona-unstated" ? "ai" : "record";
  if (step === "sleeve") return "sleeve";
  if (step === "channels") return "channels";
  if (step === "extras") return "splits";
  return "list";
}

const TRACK_FIELD_SECTION: Readonly<Record<string, SectionId>> = { lyrics: "people", songwriters: "people", credits: "people", ai: "ai", rights: "record" };

export function sectionOfPath(path: ProposalPath): SectionId {
  const p = parseProposalPath(path);
  if (p === null) return "release";
  if (p.track === null) return p.field === "sleevePrompt" ? "prompt" : "release";
  return TRACK_FIELD_SECTION[p.field] ?? "list";
}

/** What a problem is about, in one to three words: the lead names it, the rule's sentence waits in the dialog. */
export const WHAT: Readonly<Record<ProblemCode, string>> = {
  "no-tracks": "tracks",
  "title-missing": "title",
  "artist-missing": "artist",
  "title-has-feat": "title",
  "title-has-version": "title",
  "title-all-caps": "title",
  "genre-missing": "primary genre",
  "release-date-malformed": "release date",
  "upc-malformed": "UPC",
  "isrc-malformed": "ISRC",
  "songwriter-missing": "songwriter",
  "songwriter-not-full-name": "songwriter",
  "persona-unstated": "artist persona",
  "sleeve-missing": "sleeve",
  "sleeve-not-square": "sleeve shape",
  "sleeve-too-small": "sleeve size",
  "sleeve-not-rgb": "sleeve colour",
  "splits-not-100": "splits sum",
  "no-channel": "channel",
  "rights-nc-licence": "licence",
  "rights-unknown-licence": "licence",
  "rights-unknown-vendor": "generator",
  "rights-unknown-tier": "plan tier",
};

/** One state per step, in the order the eye should take it: what blocks, what warns, what the agent proposes. */
export type Tone = "block" | "warn" | "agent" | "clear";

export interface Lead {
  readonly tone: Tone;
  readonly blocks: readonly ReleaseProblem[];
  readonly warns: readonly ReleaseProblem[];
  readonly suggested: readonly ReleaseProposal[];
  /** The first item's subject - `artist persona · track 2` - or null when the step is clear. */
  readonly focus: string | null;
  readonly total: number;
}

const onTrack = (ti: number | null, tracks: number): string => (ti === null || tracks < 2 ? "" : ` · track ${ti + 1}`);

export function leadOf(problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[], step: StepId, tracks: number): Lead {
  const mine = problemsOf(problems, step);
  const blocks = mine.filter((p) => p.severity === "block");
  const warns = mine.filter((p) => p.severity === "warn");
  const suggested = pendingIn(pending, step);
  const first = blocks[0] ?? warns[0];
  const tone: Tone = blocks.length > 0 ? "block" : warns.length > 0 ? "warn" : suggested.length > 0 ? "agent" : "clear";
  const proposal = suggested[0];
  const focus = first !== undefined ? `${WHAT[first.code]}${onTrack(trackIndexOf(first), tracks)}` : proposal !== undefined ? proposalSubject(proposal.path, tracks) : null;
  return { tone, blocks, warns, suggested, focus, total: blocks.length + warns.length + suggested.length };
}

function proposalSubject(path: ProposalPath, tracks: number): string {
  const p = parseProposalPath(path);
  if (p === null) return path;
  return `${FIELD_WORD[p.field] ?? p.field}${onTrack(p.track === null ? null : p.track - 1, tracks)}`;
}

const FIELD_WORD: Readonly<Record<string, string>> = {
  "genre.primary": "primary genre",
  "genre.secondary": "secondary genre",
  releaseDate: "release date",
  sleevePrompt: "sleeve prompt",
  ai: "AI credits",
  rights: "rights record",
  label: "record label",
  upc: "UPC",
  isrc: "ISRC",
};

/** The rail's one mark per step. */
export type Mark = Tone | "ahead";

export function markOf(problems: readonly ReleaseProblem[], pending: readonly ReleaseProposal[], step: StepId, seen: boolean): Mark {
  const sev = severityOf(problemsOf(problems, step));
  if (sev.block > 0) return "block";
  if (step !== "review" && sev.warn > 0) return "warn";
  if (step !== "review" && pendingIn(pending, step).length > 0) return "agent";
  return seen ? "clear" : "ahead";
}

export const MARK_WORD: Readonly<Record<Mark, string>> = { block: "to fix", warn: "to check", agent: "suggested", clear: "clear", ahead: "not started" };
