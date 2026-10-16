// THE THREE REFERENCE TRACKS AND WHAT WAS MEASURED ON THEM - moved with the composer from v1
// app/library/audio/audioRefs.ts (the contest entry's refdata.js), which retires with v1's
// Library. Measurements, not fixture: tempo and key per method are what librosa and an FFT
// autocorrelation returned, and `truth` is the published tunebat value they are graded against.
// v1 also carried the retired cloud read (genres, tempo, key) struck through as the example the
// owner retired it for (2026-10-03); that read was wrong about tempo and key on all three and is
// not carried - it seeds nothing and the reason it was kept lives in v1's history.
import type { ReferenceMethod, ReferenceRow } from "@gt/ui/components/audio/ReferenceList.tsx";

type Ref = Omit<ReferenceRow, "kept" | "rejected">;

const m = (librosa: [number, string], fft: [number, string]): readonly ReferenceMethod[] => [
  { id: "librosa", label: "librosa", tempo: librosa[0], key: librosa[1] },
  { id: "fft_autocorr", label: "fft autocorr", tempo: fft[0], key: fft[1] },
];

export const REFERENCES: readonly Ref[] = [
  { id: "ref-french79-4807", artist: "French 79", title: "4807", truth: { tempo: 115, key: "F major" }, methods: m([112.3, "G minor"], [117.5, "G minor"]) },
  { id: "ref-ratatat-breaking-away", artist: "Ratatat", title: "Breaking Away", truth: { tempo: 88, key: "F major" }, methods: m([89.1, "D minor"], [69.8, "D minor"]) },
  { id: "ref-sappheiros-falling", artist: "Sappheiros", title: "Falling", truth: { tempo: 125, key: "A minor" }, methods: m([123, "F major"], [83.4, "A minor"]) },
];
