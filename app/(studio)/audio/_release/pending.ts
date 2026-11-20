// WHERE AN AGENT'S PROPOSAL IS ANSWERED (spark studio-to-release): the wizard step that holds the field a proposal
// sets, so a step can accept all of its own, the rail can count them, and the review can send to them. Pure; derived
// from the proposal's path each render, never stored.
import { parseProposalPath, type ProposalPath, type ReleaseProposal } from "@gt/domain/release.record";

import type { StepId } from "./wizard/steps.ts";

const RELEASE_STEP: Readonly<Record<string, StepId>> = { sleevePrompt: "sleeve" };
const TRACK_STEP: Readonly<Record<string, StepId>> = {
  title: "tracks",
  version: "tracks",
  isrc: "tracks",
  explicit: "tracks",
  lyrics: "details",
  songwriters: "details",
  credits: "details",
  ai: "rights",
  rights: "rights",
};

export function stepOfPath(path: ProposalPath): StepId {
  const p = parseProposalPath(path);
  if (p === null) return "review";
  return p.track === null ? (RELEASE_STEP[p.field] ?? "details") : (TRACK_STEP[p.field] ?? "tracks");
}

/** The pending proposals a step answers; the review answers every one. */
export const pendingIn = (pending: readonly ReleaseProposal[], step: StepId): readonly ReleaseProposal[] =>
  step === "review" ? pending : pending.filter((p) => stepOfPath(p.path) === step);

/** The field a path names, as the wizard labels it: `secondary genre`, `track 1 · AI credits`. */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  title: "title",
  version: "version",
  artist: "artist",
  label: "record label",
  releaseDate: "release date",
  language: "language",
  "genre.primary": "primary genre",
  "genre.secondary": "secondary genre",
  upc: "UPC",
  sleevePrompt: "sleeve prompt",
  isrc: "ISRC",
  explicit: "explicit",
  lyrics: "lyrics",
  songwriters: "songwriters",
  credits: "credits",
  ai: "AI credits",
  rights: "rights record",
};

export function fieldLabel(path: ProposalPath): string {
  const p = parseProposalPath(path);
  if (p === null) return path;
  const name = FIELD_LABEL[p.field] ?? p.field;
  return p.track === null ? name : `track ${p.track} · ${name}`;
}
