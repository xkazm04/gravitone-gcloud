// THE LINER NOTES' OWN SPELLINGS (prototype dock-package, direction "sleeve"): the side each step is printed on, the
// catalogue line, the figures a sleeve prints. Pure; everything here is derived from the release on each render.
import { releaseKind, type Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";

import { clock, day, KIND_LABEL } from "../../../../../_release/wizard/fmt.ts";
import type { StepProps, StepId } from "../../../../../_release/wizard/steps.ts";

/** A step drawn as a side of the record: the music on side A, the package on side B, the review on the run-out. */
export const SIDE: Readonly<Record<StepId, string>> = {
  tracks: "A1",
  details: "A2",
  rights: "A3",
  sleeve: "B1",
  channels: "B2",
  extras: "B3",
  review: "C",
};

/** What every side of the notes receives: the wizard's step props, and whether this side is shown for the first time
 *  (its rows enter once, never again on a return). */
export interface SideProps extends StepProps {
  readonly fresh: boolean;
}

export const titleOf = (r: Release): string => (r.title.trim() === "" ? "untitled" : r.title);
export const totalS = (r: Release): number => r.tracks.reduce((a, t) => a + t.durationS, 0);
export const lengthOf = (r: Release): string => clock(totalS(r));
export const kindOf = (r: Release): string => KIND_LABEL[releaseKind(r.tracks)];

/** The catalogue line a sleeve prints on its spine: the release's number and when it is out. */
export function catalogueOf(r: Release): string {
  const out = r.releaseDate === null ? "out when processed" : `out ${day(r.releaseDate)}`;
  return `${r.id.toUpperCase()} · ${out}`;
}

/** The ℗ line: the year it is out and who holds it (the label, else the artist). */
export function phonogramOf(r: Release): string {
  const year = r.releaseDate?.slice(0, 4) ?? null;
  const holder = r.label ?? (r.artist.trim() === "" ? null : r.artist);
  return [year === null ? "℗" : `℗ ${year}`, holder].filter((x) => x !== null).join(" ");
}

/** The release field a release-level problem sits on, so the printed field can carry its mark. */
export const FIELD_OF_CODE: Partial<Record<ProblemCode, string>> = {
  "title-missing": "title",
  "title-has-feat": "title",
  "title-has-version": "title",
  "title-all-caps": "title",
  "artist-missing": "artist",
  "genre-missing": "genre.primary",
  "release-date-malformed": "releaseDate",
  "upc-malformed": "upc",
};

export const worst = (ps: readonly ReleaseProblem[]): "block" | "warn" | null => (ps.some((p) => p.severity === "block") ? "block" : ps.length > 0 ? "warn" : null);

/** Lines of a lyric sheet, blank lines not counted. */
export const linesOf = (lyrics: string | null): number => (lyrics === null ? 0 : lyrics.split("\n").filter((l) => l.trim() !== "").length);
