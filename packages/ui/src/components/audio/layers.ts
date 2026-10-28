// THE LAYERS OF A TRACK (D4, the four-band half) - a reference split at three crossovers into the
// four registers an ear can follow: what sits under 150 Hz, what carries the harmony, what
// gives it attack, what gives it air. Not stems: a band holds every instrument that sounds in it,
// so its words say what USUALLY lives there. Each layer is levelled to one loudness so a quiet
// band can be heard at all; how much of the track it carries is `share`, measured before that.
// Pure: lib/audio/layers.ts cuts them with ffmpeg, TrackDrop plays them.

export type LayerId = "low" | "body" | "bite" | "air";

export type LayerBand = {
  readonly id: LayerId;
  /** Hz; null is an open edge. */
  readonly lo: number | null;
  readonly hi: number | null;
  /** What usually sounds in this band, in plain words. */
  readonly words: string;
};

export const LAYER_BANDS: readonly LayerBand[] = [
  { id: "low", lo: null, hi: 150, words: "bass · kick" },
  { id: "body", lo: 150, hi: 2000, words: "chords · voice · melody" },
  { id: "bite", lo: 2000, hi: 6000, words: "attack · snare · presence" },
  { id: "air", lo: 6000, hi: null, words: "cymbals · shimmer · breath" },
];

export type Layer = {
  readonly id: LayerId;
  /** 0-1: the band's part of the window's energy, before levelling. */
  readonly share: number;
  /** A playable source (a data: URI - nothing of the upload is kept on the server). */
  readonly href: string;
};

/** The ffmpeg filter chain for a band: each edge two 12 dB/oct stages, 24 dB/oct. */
export function bandChain(b: LayerBand): string {
  const edges = [b.lo === null ? null : `highpass=f=${b.lo}`, b.hi === null ? null : `lowpass=f=${b.hi}`].filter((x): x is string => x !== null);
  return edges.flatMap((e) => [e, e]).join(",");
}

/** Shares as whole percents that add to 100 (largest remainder), for a row that reads as one track. */
export function percents(shares: readonly number[]): number[] {
  const total = shares.reduce((a, b) => a + b, 0);
  if (total <= 0) return shares.map(() => 0);
  const raw = shares.map((v) => (100 * v) / total);
  const out = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < 100 - out.reduce((a, b) => a + b, 0); k++) {
    const i = order[k % order.length]?.[1];
    if (i !== undefined) out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}
