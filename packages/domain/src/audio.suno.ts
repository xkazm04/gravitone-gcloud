// THE SUNO ADVISOR'S VOCABULARY, zod-free so a client island can import it (spark suno-advisor). The
// studio never drives suno.com: the outside agent writes a prompt card, the person generates by hand,
// and comes back with a verdict and - when a take is worth one of the plan's metered downloads - the
// mp3. What Gravitone then knows about that take is a StudioTakeFacts: MEASURED here (tempo, key,
// loudness) and, on a priced press, LISTENED by a model whose read is shown unconfirmed - audio models
// over-specify instruments and misread vocal presence (research 2026-10-29, vault note suno-advisor).
// The schemas are ./audio.studio.ts (the two node kinds) and ./audio.suno.schema.ts (listen + taste).
//
// Absent-value convention: an optional field is OMITTED, never null (the studio's own convention).

/** The models a Premier plan can pick on suno.com/create (v6 FAQ, 2026-09-09; older models retired). */
export const SUNO_MODELS = ["v6", "v6-wild", "v6-mini"] as const;
export type SunoModel = (typeof SUNO_MODELS)[number];

/** The fields a prompt version may change against its parent, in Suno's own form order. */
export const SUNO_FIELDS = ["title", "style", "lyrics", "exclude", "model", "settings"] as const;
export type SunoField = (typeof SUNO_FIELDS)[number];

/** Suno's three sliders, 0..100 each. `variety` above 0 lets v6 rewrite the style prompt it was given. */
export const SUNO_SETTINGS = ["weirdness", "styleInfluence", "variety"] as const;
export type SunoSetting = (typeof SUNO_SETTINGS)[number];

/** Field caps the card holds a prompt to. Suno publishes none; these are the composer's counters as
 *  read in 2026-09 (community, not vendor) - a longer field is refused at the door, not clipped. */
export const SUNO_LIMITS = { title: 80, style: 1000, lyrics: 5000, exclude: 1000 } as const;

/** One generation on suno.com returns two takes; a verdict names which it is about. */
export const VERDICT_CLIPS = ["a", "b", "both"] as const;
export type VerdictClip = (typeof VERDICT_CLIPS)[number];

/** What a verdict may say is off, as axes the next prompt can move. */
export const VERDICT_OFF = ["tempo", "energy", "vocals", "instruments", "structure", "mix", "mood", "lyrics"] as const;
export type VerdictOff = (typeof VERDICT_OFF)[number];

export const TASTE_LEANS = ["like", "dislike"] as const;
export type TasteLean = (typeof TASTE_LEANS)[number];

/** A confirmed taste line, folded from `audio.taste` events: the last keep/drop per line wins. */
export type StudioTasteLine = { readonly line: string; readonly lean: TasteLean; readonly since: string };

export const LISTEN_PROMINENCE = ["lead", "supporting", "background"] as const;
export type ListenProminence = (typeof LISTEN_PROMINENCE)[number];

/** A listener model's read of one take. A hypothesis, rendered as one: never a measured fact. */
export type StudioListen = {
  readonly model: string;
  readonly at: string;
  /** True when this read came from the dry stand-in, not a model. */
  readonly standIn?: true;
  readonly genre: readonly string[];
  readonly mood: readonly string[];
  readonly bpm?: number;
  readonly key?: string;
  readonly vocals: { readonly heard: boolean; readonly character?: string };
  readonly instruments: readonly { readonly name: string; readonly role: string; readonly prominence: ListenProminence }[];
  readonly sections: readonly { readonly name: string; readonly startS: number; readonly endS: number; readonly says: string }[];
};

/** What this server measured on a take's file. */
export type StudioMeasured = {
  readonly bpm?: number;
  /** The tempo's octave neighbours the beat tracker also found plausible (half / double time). */
  readonly bpmAlt?: readonly number[];
  readonly key?: string;
  /** 0..1, how clearly the key's profile won. */
  readonly keyStrength?: number;
  readonly lufs?: number;
  readonly truePeakDb?: number;
  readonly lra?: number;
};

/** Everything Gravitone knows about one uploaded take; the page reads it by takeId, the agent never copies it. */
export type StudioTakeFacts = {
  readonly takeId: string;
  readonly name: string;
  readonly durationS: number;
  /** The audio this server serves for the take. */
  readonly href: string;
  readonly promptId?: string;
  readonly clip?: "a" | "b";
  readonly measured: StudioMeasured;
  readonly listened?: StudioListen;
  /** The quoted price of a listen, when the pricing table can say one; omitted = unpriced (Listen refuses). */
  readonly listenUsd?: number;
};
