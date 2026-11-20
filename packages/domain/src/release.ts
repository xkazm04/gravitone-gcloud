// THE RELEASE (spark audio-distribution, S1): finished takes gathered into a single, an EP or an
// album with the metadata a distributor's upload asks for (DistroKid's form, researched 2026-11-16 -
// docs/concepts/distribution/distrokid-research.md), a provenance record per track, a sleeve, a
// master and the channels it goes to. S1 persists nothing: the type is the contract three layout
// variants are built against, and `releaseProblems` is the one validator every one of them draws.
//
// Two owner rulings shape it. Rights WARN, never block (wave 2): a CC BY-NC take or a Suno take of
// unknown plan tier carries a warning to the review and still publishes. And the master is ONE
// universal recipe with no parameters (wave 2, "one click"): a track's master names the recipe,
// never a setting. Spotify, Apple, Amazon, Tidal and Deezer cannot be reached without a licensed
// distributor; they are rows with the state `not-reachable`, never a pretend channel.
//
// The absent-value convention: an unknown or unset field is `null`, never omitted; lists are empty.

/** Channels a release reaches directly, each over its own public upload API (none needs a distributor). */
export const RELEASE_CHANNELS = ["youtube", "soundcloud", "audius", "mixcloud", "archive"] as const;
export type ReleaseChannelId = (typeof RELEASE_CHANNELS)[number];

/** Stores that ingest only from a licensed delivery partner (DDEX ERN); a later spark researches one. */
export const DSPS = ["spotify", "apple", "amazon", "tidal", "deezer"] as const;
export type DspId = (typeof DSPS)[number];

/** `ready` armed for a real upload; `dry` wired but PUBLISH_MODE unarmed; `not-wired` credentials or
 *  adapter missing; `not-reachable` a DSP - no route exists from this studio today. */
export const CHANNEL_STATES = ["ready", "dry", "not-wired", "not-reachable"] as const;
export type ChannelState = (typeof CHANNEL_STATES)[number];

export const CHANNEL_NAMES: Readonly<Record<ReleaseChannelId | DspId, string>> = {
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  audius: "Audius",
  mixcloud: "Mixcloud",
  archive: "Internet Archive",
  spotify: "Spotify",
  apple: "Apple Music",
  amazon: "Amazon Music",
  tidal: "TIDAL",
  deezer: "Deezer",
};

/** One row of the channel list: the server's readiness, its sentence verbatim (`detail`). */
export interface ChannelRow {
  readonly id: ReleaseChannelId | DspId;
  readonly kind: "direct" | "dsp";
  readonly state: ChannelState;
  /** The reason for the state in the adapter's own words (missing credential names, the quota), or null. */
  readonly detail: string | null;
}

/** A primary genre list in the shape stores accept; an approximation of DistroKid's (its form was not fetchable). */
export const GENRES = [
  "Alternative", "Ambient", "Blues", "Children's Music", "Classical", "Country", "Dance", "Electronic", "Folk",
  "Hip Hop/Rap", "Jazz", "Latin", "Lo-Fi", "Metal", "New Age", "Pop", "R&B/Soul", "Reggae", "Rock",
  "Singer/Songwriter", "Soundtrack", "Spoken Word", "World",
] as const;
export type Genre = (typeof GENRES)[number];

export const CREDIT_ROLES = ["performer", "producer", "featured", "remixer", "mixer", "mastering"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];
export interface Credit {
  readonly name: string;
  readonly role: CreditRole;
}

/** DistroKid's AI Credits step: which parts were generated, and - when all the audio was - whether
 *  the artist is a human or an AI persona. */
export const AI_AUDIO = ["none", "part", "all"] as const;
export type AiAudio = (typeof AI_AUDIO)[number];
export interface AiCredits {
  readonly lyrics: boolean;
  readonly music: boolean;
  readonly audio: AiAudio;
  readonly persona: "human" | "ai" | null;
}

/** The licence the generation circumstances grant, as far as the record knows it. */
export const LICENCES = ["commercial", "cc-by-nc", "unknown"] as const;
export type Licence = (typeof LICENCES)[number];

/** Provenance, written when the take was accepted (registry: rights-and-provenance-record). The
 *  commercial grant is the plan tier's AT GENERATION TIME and is not retroactive. */
export interface RightsRecord {
  readonly vendor: string | null;
  readonly model: string | null;
  readonly planTier: string | null;
  readonly generatedAt: string | null;
  readonly briefDigest: string | null;
  readonly reference: string | null;
  readonly licence: Licence;
}

/** The master recipes (owner, wave 2: one click, no parameters). Append-only. uni-1/2/3 are RETIRED: the owner heard
 *  all three as degrading a track on another device (2026-11-16); they stay so an old master names a real recipe. */
export const MASTER_RECIPES = ["uni-1", "uni-2", "uni-3", "tone-1"] as const;
export type MasterRecipe = (typeof MASTER_RECIPES)[number];
/** The recipe a one-click master runs: a linear-phase tonal EQ toward the album's average, then one static gain - no
 *  compressor, no limiter (owner's pick of five techniques, 2026-11-17; docs/concepts/distribution/mastering-research.md). */
export const MASTER_DEFAULT: MasterRecipe = "tone-1";
export const MASTER_STATES = ["none", "running", "done", "failed"] as const;
export type MasterState = (typeof MASTER_STATES)[number];
/** Integrated loudness (LUFS), true peak (dBTP) and loudness range (LU) of one file. */
export interface MasterMeasure {
  readonly lufs: number;
  readonly truePeakDb: number;
  readonly lra: number;
}
export interface MasterRef {
  readonly state: MasterState;
  readonly recipe: MasterRecipe | null;
  /** The master's own take (a child of the source take) once one exists. */
  readonly takeId: string | null;
  readonly audioHref: string | null;
  readonly before: MasterMeasure | null;
  readonly after: MasterMeasure | null;
  readonly error: string | null;
}
/** The destination the universal recipe masters to: streaming normalisation (Spotify's published -14). */
export const MASTER_TARGET = { lufs: -14, truePeakDb: -1 } as const;

export interface ReleaseTrack {
  readonly takeId: string;
  readonly title: string;
  readonly version: string | null;
  readonly isrc: string | null;
  readonly explicit: boolean;
  readonly lyrics: string | null;
  readonly durationS: number;
  readonly audioHref: string | null;
  readonly songwriters: readonly string[];
  readonly credits: readonly Credit[];
  readonly ai: AiCredits;
  readonly rights: RightsRecord;
  readonly master: MasterRef;
}

export const SLEEVE_SOURCES = ["generated", "upload", "mv-look"] as const;
export type SleeveSource = (typeof SLEEVE_SOURCES)[number];
export interface Sleeve {
  readonly source: SleeveSource;
  readonly href: string | null;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rgb: boolean;
}
/** The sleeve stores ask for: square, RGB, 3000 px (DistroKid's recommendation; 1000 px its floor). */
export const SLEEVE_PX = 3000;

export interface Split {
  readonly name: string;
  /** Percent of earnings, 0-100; a sheet's shares sum to 100. */
  readonly share: number;
}

export const RELEASE_STATUSES = ["draft", "ready", "scheduled", "published"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export interface Release {
  /** `rel-` + 12 hex. */
  readonly id: string;
  readonly title: string;
  readonly version: string | null;
  readonly artist: string;
  readonly label: string | null;
  /** `YYYY-MM-DD`, or null for "as soon as stores process it". */
  readonly releaseDate: string | null;
  /** BCP-47 primary language tag, e.g. `en`. */
  readonly language: string;
  readonly genre: { readonly primary: Genre | null; readonly secondary: Genre | null };
  readonly upc: string | null;
  readonly tracks: readonly ReleaseTrack[];
  readonly sleeve: Sleeve | null;
  /** What the sleeve's takes are generated from; null until someone writes or accepts one. */
  readonly sleevePrompt: string | null;
  readonly channels: readonly ReleaseChannelId[];
  readonly splits: readonly Split[];
  readonly status: ReleaseStatus;
}

/** A finished take a release can be built from: the shelf. */
export interface ShelfTake {
  readonly takeId: string;
  readonly title: string;
  readonly durationS: number;
  readonly audioHref: string | null;
  readonly provider: string;
  readonly label: string | null;
  readonly lufs: number | null;
  readonly truePeakDb: number | null;
}

export type ReleaseKind = "single" | "ep" | "album";
/** Spotify's rule, which DistroKid follows: up to 3 tracks under 30 minutes is a single, up to 6 an
 *  EP, anything longer or larger an album. */
export function releaseKind(tracks: readonly Pick<ReleaseTrack, "durationS">[]): ReleaseKind {
  const total = tracks.reduce((s, t) => s + t.durationS, 0);
  if (total >= 30 * 60) return "album";
  if (tracks.length <= 3) return "single";
  if (tracks.length <= 6) return "ep";
  return "album";
}
