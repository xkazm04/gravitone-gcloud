// A COVER, as vocabulary, zod-free so a client island can import it (spark track-mirror-studio). An uploaded
// song, a time section of it, one style: the section transcribed by SheetSage2 and rendered as five YuE2 takes
// on this box's card. The owner picks a winner by ear, and brings a remix back from Suno by hand. The schemas
// are ./cover.schema.ts.
//
// A cover carries the source's melody whatever its new style (registry: reference-track-anchoring), and YuE2's
// weights are CC BY-NC. So the rights are declared at upload and held on the record, and no cover ever computes
// as publishable (lib/sound/cover/rights.ts). The section picks which music to cover. Nothing here aims at a
// vendor's upload screening, and a vendor saying nothing about an upload is not a clearance.
//
// Absent-value convention: an optional field is OMITTED, never null.

/** The owner's declaration at upload. There is no default: an upload without one is refused. */
export const COVER_RIGHTS = ["own", "licensed", "third-party-uncleared"] as const;
export type CoverRights = (typeof COVER_RIGHTS)[number];

/** draft: uploaded, nothing queued. queued/rendering: the job. judging: takes ready, no winner.
 *  picked: a winner chosen. failed: the job ended without all five takes. */
export const COVER_STATES = ["draft", "queued", "rendering", "judging", "picked", "failed"] as const;
export type CoverState = (typeof COVER_STATES)[number];

export const COVER_TAKE_STATES = ["pending", "done", "failed"] as const;
export type CoverTakeState = (typeof COVER_TAKE_STATES)[number];

export const COVER_TAKE_COUNT = 5;
/** YuE2 reads a longer score than this past the 360 s ceiling docs/concepts/yue2-audio-experiments-2026-11-06.md keeps fixed. */
export const COVER_SECTION_MAX_S = 360;
export const COVER_SECTION_MIN_S = 10;
/** The same caps as a Suno prompt card (./audio.suno.ts SUNO_LIMITS), because this text goes there. */
export const COVER_STYLE_MAX = 1000;
export const COVER_LYRICS_MAX = 5000;
export const COVER_TITLE_MAX = 120;
export const COVER_NOTE_MAX = 500;

export type CoverId = `cov-${string}`;

export type CoverTake = {
  /** 1..5: its place in the batch, and in the job's step name `render-<n>`. */
  readonly n: number;
  /** Both of YuE2's seeds. With the score and max_duration, a take reproduces from this. */
  readonly seed: number;
  readonly state: CoverTakeState;
  /** Relative to the cover's folder, e.g. takes/s1234.flac. */
  readonly file?: string;
  readonly renderS?: number;
  /** ComfyUI's own sentence, verbatim. */
  readonly error?: string;
};

export type CoverRecord = {
  readonly id: CoverId;
  readonly createdAt: string;
  readonly title: string;
  readonly rights: CoverRights;
  readonly holder?: string;
  readonly note?: string;
  readonly state: CoverState;
  readonly source: { readonly file: string; readonly mime: string; readonly name: string; readonly durationS: number };
  readonly section: { readonly startS: number; readonly endS: number };
  /** The style prompt the owner back-fills for the uploaded song. */
  readonly sourceStyle?: string;
  /** The style the five takes are rendered with. */
  readonly style: string;
  /** Empty: tags derived from the score's own section labels. */
  readonly lyrics: string;
  /** Relative: score.abc, once transcribed. */
  readonly score?: string;
  readonly takes: readonly CoverTake[];
  readonly winnerSeed?: number;
  /** Relative: winner.mp3, once picked. */
  readonly exportFile?: string;
  readonly remix?: { readonly file: string; readonly mime: string; readonly name: string; readonly style: string };
  readonly jobId?: string;
};

/** The screen's copy of a cover: the record plus the addresses its audio plays from. */
export type CoverCard = {
  readonly record: CoverRecord;
  readonly sourceUrl: string;
  readonly takeUrls: Readonly<Record<number, string>>;
  readonly winnerUrl?: string;
  readonly remixUrl?: string;
};

export type CoverDeskView = {
  readonly covers: readonly CoverCard[];
  readonly current?: CoverCard;
};
