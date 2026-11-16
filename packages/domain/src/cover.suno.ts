import type { SunoDownloadQuote, SunoRead } from "./audio.suno.ts";
import type { Receipt } from "./produce.ts";

// A COVER'S SUNO ROUND TRIP (spark suno-covers): a picked cover's winner sent to Suno through its official
// API - uploaded once, covered twice with the owner's style, read for free - and ONE of the two bought back
// (a download credit) as the cover's remix. Two confirms: the send (song credits) and the file (a download
// credit), each priced before it spends. An absent value is an omitted key, never null (./cover.ts).

/** The Suno models a send may name (the owner's plan, 2026-11-10); the first is the default. */
export const SUNO_COVER_MODELS = ["v6", "v6-wild", "v6-mini"] as const;
export type SunoCoverModel = (typeof SUNO_COVER_MODELS)[number];
export const SUNO_COVER_MODEL_DEFAULT: SunoCoverModel = "v6";

/** Covers per send: always two (the owner, wave 2), one POST each - Suno's REST makes one song per call. */
export const SUNO_COVER_TAKES = 2;
export type SunoCoverTakeN = 1 | 2;

/** Suno's target length bounds for a cover, seconds. */
export const SUNO_COVER_DURATION_MIN_S = 15;
export const SUNO_COVER_DURATION_MAX_S = 360;
/** Suno's caps on a cover's text fields. */
export const SUNO_COVER_STYLE_MAX = 1000;
export const SUNO_COVER_NEGATIVE_MAX = 1000;
export const SUNO_COVER_LYRICS_MAX = 5000;
/** Variety is a whole step: 0 Off, 1 Normal, 2 High, 3 Extra, 4 Max. */
export const SUNO_COVER_VARIETY = [0, 1, 2, 3, 4] as const;
export type SunoCoverVariety = (typeof SUNO_COVER_VARIETY)[number];

/** Suno's generation sliders, each 0-1 but variety. Omitted: the model's own default (0 is a real setting). */
export type SunoCoverControls = {
  readonly audioInfluence?: number;
  readonly styleInfluence?: number;
  readonly weirdness?: number;
  readonly variety?: SunoCoverVariety;
};

/** What the owner asks Suno for. `lyrics` empty: an instrumental cover. */
export type CoverSunoPlan = {
  readonly id: string;
  readonly style: string;
  readonly lyrics: string;
  readonly model: SunoCoverModel;
  readonly negativeStyle?: string;
  readonly durationS?: number;
  readonly controls?: SunoCoverControls;
};

export const COVER_SUNO_TAKE_STATES = ["pending", "streaming", "complete", "failed"] as const;
export type CoverSunoTakeState = (typeof COVER_SUNO_TAKE_STATES)[number];

export type CoverSunoTake = {
  readonly take: SunoCoverTakeN;
  readonly state: CoverSunoTakeState;
  readonly clipId?: string;
  readonly title?: string;
  readonly durationS?: number;
  /** suno.com's page for the song: where the owner hears it, free. */
  readonly songUrl?: string;
  /** Suno's free analysis and listen of this take (lib/sound/suno/sunoRead.ts foldRead). */
  readonly read?: SunoRead;
  /** Suno's refusal of the read, verbatim; the take stands. */
  readonly readRefused?: string;
  /** Suno's refusal of the cover, verbatim. */
  readonly error?: string;
};

export const COVER_SUNO_SEND_STATES = ["queued", "running", "done", "failed"] as const;
export type CoverSunoSendState = (typeof COVER_SUNO_SEND_STATES)[number];

export type CoverSunoSend = {
  /** 1..: the send's place on this cover, and in its job id `job:cover-suno:<cover>:<n>`. */
  readonly n: number;
  readonly at: string;
  readonly jobId: string;
  readonly state: CoverSunoSendState;
  readonly plan: Omit<CoverSunoPlan, "id">;
  readonly takes: readonly CoverSunoTake[];
  /** Song credits the send spent, read off the account before and after; absent when either read failed. */
  readonly creditsSpent?: number;
  /** The refusal that failed the send, verbatim. */
  readonly error?: string;
};

export type CoverSunoFiledRef = { readonly send: number; readonly take: SunoCoverTakeN; readonly clipId: string };

export type CoverSuno = {
  /** The winner as uploaded to Suno: one upload per cover, every send covers it. */
  readonly uploadClipId?: string;
  readonly sends: readonly CoverSunoSend[];
  /** The take bought back and filed as the cover's remix. */
  readonly filed?: CoverSunoFiledRef;
};

export type CoverSunoLaunch =
  | { readonly kind: "receipt"; readonly receipt: Receipt }
  | { readonly kind: "stale"; readonly fresh: Receipt }
  | { readonly kind: "launched"; readonly jobId: string }
  | { readonly kind: "existing"; readonly jobId: string };

/** Keeping a take: unconfirmed, Suno's price for its file; confirmed (or free), the take filed as the remix. */
export type CoverSunoFiled = { readonly quote: SunoDownloadQuote } | { readonly filed: CoverSunoFiledRef };

/** The job of a cover's n-th send. */
export const coverSunoJobId = (coverId: string, n: number): string => `job:cover-suno:${coverId}:${n}`;

/** A send is in flight: the desk re-reads its view while one is. */
export const sunoSendInFlight = (s: CoverSuno | undefined): boolean => (s?.sends ?? []).some((x) => x.state === "queued" || x.state === "running");
