// THE SONG LAB'S PORT (spark yue2-song-lab S2, the contest winner "Knockout"): the one seam the
// /audio?s=songlab desk reads through. Two sides: the ledger (./ledger.ts - the draw, its knockout
// pairs and votes, the agent's relay, the GPU lane's jobs, presence) and the fixture (./fixture.ts -
// the contest's staged field with a scripted agent, labelled `scripted`). Types only, so the client
// island names them without loading a server module.
//
// THE BLIND HOLDS HERE. A read is what the browser receives, and before a match is voted it carries
// neither take id of that match nor which take plays as which arm: entrants are seeds and words,
// the waiting match is a pair id and two opaque arm sources (/api/sound/ab/<pairId>/<arm>), and a
// reveal exists only for a decided match. No field of this read holds a take id at all
// (tests/next-server/songlab-blind.test.ts serializes both sides and looks).
//
// ABSENCE IS SAID: a lib module that answers `unavailable` (a draw not built yet, a relay not
// built yet) lands in `unavailable` with its sentence verbatim, and the desk draws it as an
// ErrorLine, never as an empty bracket that looks like a quiet lab.
import type {
  BlindMatchView,
  BracketView,
  DirectorView,
  DrawHeadView,
  DrawTabView,
  FieldTakeView,
  JobRowView,
  NextRowView,
  RevealView,
} from "@gt/ui/components/songlab/songlab.ts";

export type SongLabSource = "fixture" | "live";

/** The desk's URL: the open draw, the match open in the booth, the field sheet. */
export type SongLabUrl = {
  readonly source: SongLabSource;
  readonly draw?: string;
  readonly match?: string;
  readonly field: boolean;
  /** Fixture only: the scripted agent drawn as not listening. */
  readonly away?: boolean;
};

/** A part of the read a lib module could not answer, in its own words. */
export type Unavailable = { readonly part: string; readonly message: string };

export type SongLabRead = {
  readonly source: SongLabSource;
  readonly unavailable: readonly Unavailable[];
  readonly director: DirectorView;
  /** Every draw, newest first; empty = no draw yet. */
  readonly draws: readonly DrawTabView[];
  /** The draw open on the desk. */
  readonly drawId?: string;
  readonly head?: DrawHeadView;
  readonly bracket?: BracketView;
  /** The match the ear judges now (glows). */
  readonly glow?: string;
  /** The match open in the booth, by the URL. */
  readonly selected?: string;
  readonly match?: BlindMatchView;
  readonly reveal?: RevealView;
  readonly next: readonly NextRowView[];
  readonly jobs: readonly JobRowView[];
  /** The field sheet's rows, read only when the sheet is open. */
  readonly field?: { readonly takes: readonly FieldTakeView[]; readonly references: readonly string[] };
  /** The defect taxonomy a `neither` vote names one of. */
  readonly defects: readonly string[];
  /** Matches waiting for the ear across the open draw (the rail's tally). */
  readonly open: number;
};

export type SongLabPort = { readonly read: (url: SongLabUrl) => Promise<SongLabRead> };
