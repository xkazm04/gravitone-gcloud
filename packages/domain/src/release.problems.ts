// WHAT A RELEASE IS MISSING (spark audio-distribution, S1): the one validator the review of every
// layout draws. The rules are a distributor's upload rules (DistroKid as researched 2026-11-16,
// docs/concepts/distribution/distrokid-research.md) plus the studio's own: an unmastered track and
// a rights gap WARN, they never block (owner, wave 2). A `block` is something a store would reject
// or that leaves the release with nowhere to go.
import { MASTER_TARGET, SLEEVE_PX, type AiCredits, type Release, type RightsRecord } from "./release.ts";

export type ProblemSeverity = "block" | "warn";

export const PROBLEM_CODES = [
  "no-tracks",
  "title-missing",
  "artist-missing",
  "title-has-feat",
  "title-has-version",
  "title-all-caps",
  "genre-missing",
  "release-date-malformed",
  "upc-malformed",
  "isrc-malformed",
  "songwriter-missing",
  "songwriter-not-full-name",
  "persona-unstated",
  "sleeve-missing",
  "sleeve-not-square",
  "sleeve-too-small",
  "sleeve-not-rgb",
  "splits-not-100",
  "no-channel",
  "unmastered",
  "master-off-target",
  "rights-nc-licence",
  "rights-unknown-licence",
  "rights-unknown-vendor",
  "rights-unknown-tier",
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** Where a problem sits: the release, one track (1-based, in release order), the sleeve, the splits
 *  or the channels. */
export type ProblemAt = "release" | `track:${number}` | "sleeve" | "splits" | "channels";

export interface ReleaseProblem {
  readonly code: ProblemCode;
  readonly severity: ProblemSeverity;
  readonly at: ProblemAt;
}

const SEVERITY: Readonly<Record<ProblemCode, ProblemSeverity>> = {
  "no-tracks": "block",
  "title-missing": "block",
  "artist-missing": "block",
  "title-has-feat": "block",
  "title-has-version": "block",
  "title-all-caps": "warn",
  "genre-missing": "block",
  "release-date-malformed": "block",
  "upc-malformed": "block",
  "isrc-malformed": "block",
  "songwriter-missing": "block",
  "songwriter-not-full-name": "warn",
  "persona-unstated": "block",
  "sleeve-missing": "block",
  "sleeve-not-square": "block",
  "sleeve-too-small": "warn",
  "sleeve-not-rgb": "block",
  "splits-not-100": "block",
  "no-channel": "block",
  unmastered: "warn",
  "master-off-target": "warn",
  "rights-nc-licence": "warn",
  "rights-unknown-licence": "warn",
  "rights-unknown-vendor": "warn",
  "rights-unknown-tier": "warn",
};

/** The rule each code enforces, in the store's terms - the work, quoted on the review. */
export const PROBLEM_TEXT: Readonly<Record<ProblemCode, string>> = {
  "no-tracks": "A release needs at least one track.",
  "title-missing": "Title is required.",
  "artist-missing": "Artist name is required.",
  "title-has-feat": "Featured artists go in credits, not the title.",
  "title-has-version": "Live, Remix, Acoustic, Radio Edit and similar go in the version field.",
  "title-all-caps": "Stores reject all-caps titles unless the artist styles it that way.",
  "genre-missing": "Primary genre is required.",
  "release-date-malformed": "Release date must be YYYY-MM-DD.",
  "upc-malformed": "UPC must be 12 or 13 digits.",
  "isrc-malformed": "ISRC must read CC-XXX-YY-NNNNN.",
  "songwriter-missing": "Every track needs at least one songwriter.",
  "songwriter-not-full-name": "Songwriters are credited by full legal name.",
  "persona-unstated": "All audio is AI: state whether the artist is a human or an AI persona.",
  "sleeve-missing": "Cover art is required.",
  "sleeve-not-square": "Cover art must be square.",
  "sleeve-too-small": `Cover art under ${SLEEVE_PX} px is accepted by some stores and rejected by others.`,
  "sleeve-not-rgb": "Cover art must be RGB.",
  "splits-not-100": "Split shares must add up to 100%.",
  "no-channel": "Pick at least one channel.",
  unmastered: "Not mastered.",
  "master-off-target": `Master is off ${MASTER_TARGET.lufs} LUFS / ${MASTER_TARGET.truePeakDb} dBTP.`,
  "rights-nc-licence": "CC BY-NC: the generator's licence forbids commercial use.",
  "rights-unknown-licence": "Licence unknown.",
  "rights-unknown-vendor": "Generator unknown.",
  "rights-unknown-tier": "Plan tier at generation unknown; a paid plan's grant is not retroactive.",
};

const FEAT = /\b(feat\.?|ft\.|featuring)(\s|$)/i;
const VERSION_IN_TITLE = /[([-]\s*(live|remix|acoustic|radio edit|remaster(ed)?|instrumental|extended|edit|demo|version)\b/i;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
const UPC = /^\d{12,13}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
/** Vendors whose commercial grant depends on the plan tier the take was made on. */
const TIERED_VENDORS = new Set(["suno", "elevenlabs", "udio"]);
/** A master within this many LU and dB of the target reads as on target. */
const LUFS_SLACK = 0.5;

function titleProblems(title: string): ProblemCode[] {
  const t = title.trim();
  if (t === "") return ["title-missing"];
  const out: ProblemCode[] = [];
  if (FEAT.test(t)) out.push("title-has-feat");
  if (VERSION_IN_TITLE.test(t)) out.push("title-has-version");
  if (t.length > 3 && /[A-Z]/.test(t) && t === t.toUpperCase()) out.push("title-all-caps");
  return out;
}

/** The rights warnings of one track; empty when the record is complete and commercial. */
export function rightsWarnings(rights: RightsRecord): ProblemCode[] {
  const out: ProblemCode[] = [];
  if (rights.licence === "cc-by-nc") out.push("rights-nc-licence");
  if (rights.licence === "unknown") out.push("rights-unknown-licence");
  if (rights.vendor === null) out.push("rights-unknown-vendor");
  else if (TIERED_VENDORS.has(rights.vendor.toLowerCase()) && rights.planTier === null) out.push("rights-unknown-tier");
  return out;
}

const personaUnstated = (ai: AiCredits): boolean => ai.audio === "all" && ai.persona === null;

/** Every problem of a release, release-level first, then tracks in order, then sleeve, splits, channels. */
export function releaseProblems(r: Release): ReleaseProblem[] {
  const out: ReleaseProblem[] = [];
  const add = (code: ProblemCode, at: ProblemAt) => out.push({ code, severity: SEVERITY[code], at });
  if (r.tracks.length === 0) add("no-tracks", "release");
  for (const c of titleProblems(r.title)) add(c, "release");
  if (r.artist.trim() === "") add("artist-missing", "release");
  if (r.genre.primary === null) add("genre-missing", "release");
  if (r.releaseDate !== null && !DATE.test(r.releaseDate)) add("release-date-malformed", "release");
  if (r.upc !== null && !UPC.test(r.upc)) add("upc-malformed", "release");
  r.tracks.forEach((t, i) => {
    const at = `track:${i + 1}` as const;
    for (const c of titleProblems(t.title)) add(c, at);
    if (t.isrc !== null && !ISRC.test(t.isrc.replace(/-/g, "").toUpperCase())) add("isrc-malformed", at);
    const writers = t.songwriters.filter((w) => w.trim() !== "");
    if (writers.length === 0) add("songwriter-missing", at);
    else if (writers.some((w) => !/\S\s+\S/.test(w.trim()))) add("songwriter-not-full-name", at);
    if (personaUnstated(t.ai)) add("persona-unstated", at);
    if (t.master.state !== "done" || t.master.after === null) add("unmastered", at);
    else if (Math.abs(t.master.after.lufs - MASTER_TARGET.lufs) > LUFS_SLACK || t.master.after.truePeakDb > MASTER_TARGET.truePeakDb) add("master-off-target", at);
    for (const c of rightsWarnings(t.rights)) add(c, at);
  });
  if (r.sleeve === null) add("sleeve-missing", "sleeve");
  else {
    if (r.sleeve.widthPx !== r.sleeve.heightPx) add("sleeve-not-square", "sleeve");
    if (Math.min(r.sleeve.widthPx, r.sleeve.heightPx) < SLEEVE_PX) add("sleeve-too-small", "sleeve");
    if (!r.sleeve.rgb) add("sleeve-not-rgb", "sleeve");
  }
  if (r.splits.length > 0 && Math.abs(r.splits.reduce((s, x) => s + x.share, 0) - 100) > 0.001) add("splits-not-100", "splits");
  if (r.channels.length === 0) add("no-channel", "channels");
  return out;
}

/** True when nothing blocks: warnings are shown, never enforced. */
export const releaseReady = (problems: readonly ReleaseProblem[]): boolean => problems.every((p) => p.severity !== "block");
