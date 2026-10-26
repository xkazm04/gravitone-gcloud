// A CHANNEL AND ITS EPISODES (spark project-baseline, 2026-10-26).
//
// The scout stopped spreading across genres and started serving channels the operator designed in session: a card
// (who it is for, what it promises, the gap in existing media it beats, its edge) and its episodes. An episode is
// decided in session as a premise, then an outline (five beats and a spec), and only an ACCEPTED outline reaches a
// night, where it becomes a storyboard (Flux frames) or, on a data channel, a real-data reel. A night never invents an
// episode; the operator's keep of the night's candidate marks the episode kept, a reject throws it.
//
// The ids are the session's: a channel `D1`, `F2`, `K1` (a letter and one or two digits), an episode `<channel>-NN`
// (`F1-03`), unique across channels.

export const CHANNEL_ID_RE = /^[A-Z][0-9]{1,2}$/;
export const EPISODE_ID_RE = /^[A-Z][0-9]{1,2}-[0-9]{2}$/;

/** The channel an episode id belongs to: `F1-03` -> `F1`. */
export const channelOfEpisode = (episodeId: string): string => episodeId.slice(0, episodeId.lastIndexOf("-"));

/** How a channel's episode is made at night: Flux storyboard frames, or a real-data reel (data channels). */
export const CHANNEL_MEDIA = ["storyboard", "reel"] as const;
export type ChannelMedium = (typeof CHANNEL_MEDIA)[number];

export type Channel = {
  readonly id: string;
  /** The family it sits in, as the session named it: `Data explainer`, `Documentary`, `Ads`, `Kids animation`. */
  readonly group: string;
  readonly name: string;
  readonly audience: string;
  readonly promise: string;
  /** The gap in existing content the research found, in words (its sources live in the vault). */
  readonly gap: string;
  readonly edge: string;
  readonly medium: ChannelMedium;
};

/** An episode's life. `outline-kept` is where an import lands; a night moves it on; the operator's verdict ends it. */
export const EPISODE_STATES = ["outline-kept", "in-production", "made", "kept", "thrown"] as const;
export type EpisodeState = (typeof EPISODE_STATES)[number];

export type Episode = {
  readonly id: string;
  readonly channel: string;
  readonly title: string;
  readonly logline: string;
  /** Exactly five, in order: what happens. */
  readonly beats: readonly string[];
  /** What the night needs that the beats don't say: a data source and dated events, an impossible view and its grade,
   *  a fictional brand and mechanism, a look. */
  readonly spec: string;
  readonly state: EpisodeState;
  /** ISO time of the last state change. */
  readonly at: string;
  /** `<night>/<c-id>` of the candidate that made it, once a night took it. */
  readonly candidate?: string;
  /** The operator's note from the outline triage, verbatim, when one was given. */
  readonly note?: string;
};
