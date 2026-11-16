// THE BOARD'S PURE HALF (layout variant "board", spark audio-distribution S1): which column a release
// sits in, which section of the open sheet fixes a problem, and the figures the cards print.
// Column: a draft whose blocks are all cleared sits under "ready" and drops back when one returns;
// the release's own status decides only scheduled and published (the reducer writes status only on
// create and schedule, so "ready" is otherwise never reached by editing).
import type { Dispatch } from "react";

import type { Release, ReleaseChannelId, ReleaseStatus } from "@gt/domain/release";
import { releaseProblems, releaseReady, type ProblemCode, type ReleaseProblem } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../../_port/port.ts";
import type { DraftEvent } from "../../draft.ts";

export const COLUMNS: readonly ReleaseStatus[] = ["draft", "ready", "scheduled", "published"];

export function columnOf(r: Release, problems: readonly ReleaseProblem[]): ReleaseStatus {
  if (r.status === "scheduled" || r.status === "published") return r.status;
  return releaseReady(problems) ? "ready" : "draft";
}

export const SECTIONS = ["tracks", "rights", "sleeve", "master", "channels", "extras", "review"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Readonly<Record<Section, string>> = {
  tracks: "tracks",
  rights: "AI & rights",
  sleeve: "sleeve",
  master: "master",
  channels: "channels",
  extras: "extras",
  review: "review",
};

/** 1-based track number of a problem, or null when it sits elsewhere. */
export function trackNo(p: ReleaseProblem): number | null {
  return p.at.startsWith("track:") ? Number(p.at.slice("track:".length)) : null;
}

const RIGHTS_CODES: ReadonlySet<ProblemCode> = new Set(["persona-unstated", "rights-nc-licence", "rights-unknown-licence", "rights-unknown-vendor", "rights-unknown-tier"]);
const MASTER_CODES: ReadonlySet<ProblemCode> = new Set(["unmastered", "master-off-target"]);

/** Where a problem is fixed: a section of the sheet, or its head (the release's own fields). */
export function sectionOf(p: ReleaseProblem): Section | "head" {
  if (p.at === "sleeve") return "sleeve";
  if (p.at === "splits") return "extras";
  if (p.at === "channels") return "channels";
  if (p.at === "release") return p.code === "no-tracks" ? "tracks" : "head";
  if (RIGHTS_CODES.has(p.code)) return "rights";
  if (MASTER_CODES.has(p.code)) return "master";
  return "tracks";
}

/** The `data-jump` key of the element a problem is fixed in (Sheet focuses the first control inside). */
export function jumpKey(p: ReleaseProblem): string {
  const n = trackNo(p);
  switch (p.code) {
    case "artist-missing":
      return "head:artist";
    case "genre-missing":
      return "head:genre";
    case "release-date-malformed":
      return "head:date";
    case "upc-malformed":
      return "head:upc";
    case "no-tracks":
      return "tracks";
    case "isrc-malformed":
      return `isrc:${n}`;
    case "songwriter-missing":
    case "songwriter-not-full-name":
      return `writers:${n}`;
    case "sleeve-missing":
    case "sleeve-not-square":
    case "sleeve-too-small":
    case "sleeve-not-rgb":
      return "sleeve";
    case "splits-not-100":
      return "splits";
    case "no-channel":
      return "channels";
    default:
      if (n === null) return "head:title";
      if (RIGHTS_CODES.has(p.code)) return `rights:${n}`;
      if (MASTER_CODES.has(p.code)) return `master:${n}`;
      return `title:${n}`;
  }
}

export interface Severity {
  readonly block: number;
  readonly warn: number;
}

export const severityOf = (ps: readonly ReleaseProblem[]): Severity => ({
  block: ps.filter((p) => p.severity === "block").length,
  warn: ps.filter((p) => p.severity === "warn").length,
});

/** Each section's own problems; the review carries them all. */
export function bySection(ps: readonly ReleaseProblem[]): Readonly<Record<Section | "head", Severity>> {
  const of = (k: Section | "head") => severityOf(ps.filter((p) => sectionOf(p) === k));
  return { tracks: of("tracks"), rights: of("rights"), sleeve: of("sleeve"), master: of("master"), channels: of("channels"), extras: of("extras"), review: severityOf(ps), head: of("head") };
}

export const problemsOf = (r: Release): ReleaseProblem[] => releaseProblems(r);

/** `4:43`; an hour-long album `1:02:10`. */
export function clock(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** A loudness figure with its sign: `-8.9`, `+0.4`. */
export const signed = (v: number): string => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `2026-12-05` -> `Dec 5`; anything not a date is returned as typed. */
export function shortDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  const mon = m === null ? undefined : MONTHS[Number(m[2]) - 1];
  return m === null || mon === undefined ? d : `${mon} ${Number(m[3])}`;
}

export const CHANNEL_MARK: Readonly<Record<ReleaseChannelId, string>> = { youtube: "YT", soundcloud: "SC", audius: "AU", mixcloud: "MX", archive: "IA" };

export const kindLabel = (k: "single" | "ep" | "album"): string => (k === "ep" ? "EP" : k);

/** What every section of the open sheet receives. */
export interface SectionProps {
  readonly release: Release;
  readonly problems: readonly ReleaseProblem[];
  readonly read: ReleaseRead;
  readonly dispatch: Dispatch<DraftEvent>;
  /** Move to where a problem is fixed. */
  readonly jump: (p: ReleaseProblem) => void;
}

/** An emptied field is an unset one (the contract's absent-value convention). */
export const orNull = (v: string): string | null => (v.trim() === "" ? null : v);
