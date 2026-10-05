// THE THREE REFERENCE TRACKS AND WHAT WAS MEASURED ON THEM — the contest
// entry's refdata.js (data/reference-track-analysis-examples.json), trimmed to
// the fields its References tab reads (core.js#references). Measurements, not
// fixture: the tempo and key per method are what librosa and an FFT
// autocorrelation actually returned, and `truth` is the published tunebat
// value they are graded against.
//
// The cloud read (`retired`) is kept as the example the owner retired it for
// (2026-10-03): rich, and wrong about tempo and key. It renders struck through.

export type RefMethodId = "librosa" | "fft_autocorr";

export interface RefMeasure {
  tempo_bpm: number;
  key: string;
}

export interface ReferenceTrack {
  id: string;
  artist: string;
  title: string;
  measured: Record<RefMethodId, RefMeasure>;
  truth: RefMeasure;
  retired: { genres: string[]; tempo_bpm: number; key: string };
}

export const REFERENCES: readonly ReferenceTrack[] = [
  {
    id: "ref-french79-4807",
    artist: "French 79",
    title: "4807",
    measured: {
      fft_autocorr: { tempo_bpm: 117.5, key: "G minor" },
      librosa: { tempo_bpm: 112.3, key: "G minor" },
    },
    truth: { tempo_bpm: 115, key: "F major" },
    retired: {
      genres: ["deep house", "melodic house", "ambient house", "downtempo", "indie electronic"],
      tempo_bpm: 120,
      key: "F minor",
    },
  },
  {
    id: "ref-ratatat-breaking-away",
    artist: "Ratatat",
    title: "Breaking Away",
    measured: {
      fft_autocorr: { tempo_bpm: 69.8, key: "D minor" },
      librosa: { tempo_bpm: 89.1, key: "D minor" },
    },
    truth: { tempo_bpm: 88, key: "F major" },
    retired: {
      genres: ["Boom Bap", "East Coast Hip Hop", "Jazz Rap", "Golden Age Hip Hop"],
      tempo_bpm: 92,
      key: "D minor",
    },
  },
  {
    id: "ref-sappheiros-falling",
    artist: "Sappheiros",
    title: "Falling",
    measured: {
      fft_autocorr: { tempo_bpm: 83.4, key: "A minor" },
      librosa: { tempo_bpm: 123, key: "F major" },
    },
    truth: { tempo_bpm: 125, key: "A minor" },
    retired: {
      genres: ["Melodic House", "Progressive House", "Deep House", "Organic House", "Melodic Techno"],
      tempo_bpm: 123,
      key: "G# minor",
    },
  },
];

export const refById = (id: string | null | undefined): ReferenceTrack | undefined =>
  id ? REFERENCES.find((r) => r.id === id) : undefined;
