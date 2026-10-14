// THE MUSIC-VIDEO SOURCE RECORD (phase key `music-video-source`), and the two
// helpers that read and replace the fields keyed to its attached track.
//
// Split out of the stepStore.ts door, which re-exports every name here. The helpers
// are functions, not types, but they describe only this record's fields.

/** THE MUSIC-VIDEO DISCIPLINE'S WHOLE RESEARCH OUTPUT, under phase key
 *  `"music-video-source"` — a sibling of `research`/`research-beats`/etc.,
 *  not a new phase (see lib/projects.ts PHASES for the steps).
 *
 *  Written once by Research (the mp3 upload pointer, the style line, and the
 *  baked `AudioEnvelope` — `lib/audioEnvelope.ts`, computed once and never
 *  re-derived live), then GROWN by later work packages rather than replaced:
 *  `posterAssetId` is Frames' (WP3) to fill once the poster generates, `seed`
 *  and `effectParams` are the effects-studio's (also WP3) determinism inputs.
 *  All three stay `undefined` here — absence, never a placeholder — exactly
 *  the convention `Asset.meta` already uses elsewhere in this file.
 *
 *  `sourceAssetId` points at the Asset row `assetFromUpload` wrote (kind
 *  `"audio"`); the bytes themselves live in `UPLOADS_STORE` behind that
 *  asset's `upload:` pointer (lib/assets.ts) and are never duplicated here. */
export interface MusicVideoSourceStepData {
  /** The attached track's Asset id, or absent if none has been attached yet. */
  sourceAssetId?: string;
  /** The optional one-line style/direction text typed alongside the upload. */
  style?: string;
  /** The baked analysis — see `lib/audioEnvelope.ts`. Absent until a track has
   *  been attached and successfully decoded. */
  envelope?: import("@/lib/audioEnvelope").AudioEnvelope;
  /** Frames' (WP3) poster Asset id — not this package's to fill. */
  posterAssetId?: string;
  /** The effects-studio's (WP3) determinism seed — not this package's to fill. */
  seed?: number;
  /** The effects-studio's (WP3) compositor parameters — not this package's to
   *  fill. */
  effectParams?: Record<string, unknown>;
  /** The last poster turn (lib/turns/kinds/poster.ts) whose answer was taken —
   *  landed, or found failed. A poster lands at most once per turn id, across a
   *  watcher, a later mount and a reload. Keyed to the track like the poster. */
  posterTurn?: string;
  savedAt?: number;
}

/** How many of the fields keyed to the attached track Frames has filled in. A
 *  replacement clears them, so this is what a replace has to confirm. */
export function downstreamCount(data: MusicVideoSourceStepData | undefined): number {
  if (!data) return 0;
  return [data.posterAssetId, data.seed, data.effectParams].filter((v) => v !== undefined).length;
}

/** A NEW TRACK REPLACING THE ATTACHED ONE. The fields keyed to the old track
 *  (Frames' poster, the effects-studio's locked seed and compositor parameters)
 *  are dropped, not carried: a poster, a "locked once set" seed and parameters
 *  made for another song would survive against this one with nothing marking
 *  them. Frames reads their absence as "not generated yet", so it needs no
 *  change. The style line is the creator's own direction and stays; any key
 *  this build does not know stays too. The result has no `undefined` keys. */
export function withTrack(
  current: MusicVideoSourceStepData | undefined,
  track: { sourceAssetId: string; envelope: import("@/lib/audioEnvelope").AudioEnvelope },
): MusicVideoSourceStepData {
  const { posterAssetId: _poster, seed: _seed, effectParams: _params, posterTurn: _turn, ...kept } = current ?? {};
  void _poster;
  void _seed;
  void _params;
  void _turn;
  return { ...kept, ...track };
}
