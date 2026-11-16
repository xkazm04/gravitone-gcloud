// THE FIXTURE'S FIELD (spark yue2-song-lab S2): the takes the song-lab contest was staged on
// (.contest/arena/song-lab-agent/data/songlab.js, the yue2-lab boom-bap sheet), as the lab's facts
// and newest scores. Figures are the staged ones, rounded as staged: the 18 lyric-gate passers the
// winner seeded, two takes that failed the gate, one render not scored yet, and the two raw takes
// whose post variants make the post draws. Ids are fixture ids (`fx-...`); none is a store's.
import { YUE2_RIGHTS, type SongScores, type Yue2Cot, type Yue2PostStage, type Yue2TakeFacts } from "@gt/domain/audio.yue2";

import type { LabEntry } from "./words.ts";

const STYLE = "Boom-bap hip hop, 90 BPM, confident male rap vocal, punchy kick and crisp snare, dusty vinyl piano loop, deep sub bass, turntable scratches";
const LYRICS = "[Verse]\nEarly morning, city humming under concrete skies\n\n[Chorus]\nWe keep it moving, moving, never slowing down";
const R8 = "hiphop_v2_distilled_rank8";
const OLD = "sv_oldschoolhiphop";

/** id, title, cot, cfg, seed, adapter, strength, SongEval mean, wer, diction, naturalness, buzz dB, length s. */
type Row = readonly [string, string, Yue2Cot, number | null, number, string | null, number | null, number | null, number | null, number | null, number | null, number | null, number];

const RENDERS: readonly Row[] = [
  ["fx-r8-s8", "slider05_cotoff_cfg1.5_s8", "off", 1.5, 8, R8, 0.5, 4.062, 0.0192, 0.0192, 3.88, 1.86, 48.2],
  ["fx-off15-s1", "hh_cotoff_cfg1.5_s1", "off", 1.5, 1, null, null, 4.039, 0, 0, 3.72, 4.85, 44.9],
  ["fx-r8def-s2", "hiphop_v2_distilled_rank8_str0.5_cotoff_cfgdef_s2", "off", null, 2, R8, 0.5, 3.96, 0, 0, 3.83, 5.47, 62.3],
  ["fx-full15-s1", "hh_cotfull_cfg1.5_s1", "full", 1.5, 1, null, null, 3.921, 0.0192, 0.0192, 3.78, 7.48, 66],
  ["fx-off15-s4", "hh_cotoff_cfg1.5_s4", "off", 1.5, 4, null, null, 3.904, 0.0192, 0.0192, 3.8, 6.11, 35],
  ["fx-full10-s1", "hh_cotfull_cfg1.0_s1", "full", 1, 1, null, null, 3.892, 0.0385, 0.0385, 3.77, 6.77, 66],
  ["fx-fulldef-s1", "hiphop_s1_cotfull", "full", null, 1, null, null, 3.891, 0.0385, 0.0385, 3.77, 6.77, 66],
  ["fx-full20-s1", "hh_cotfull_cfg2.0_s1", "full", 2, 1, null, null, 3.856, 0.0962, 0, 3.69, 6.41, 66.4],
  ["fx-off15-s7", "hh_cotoff_cfg1.5_s7", "off", 1.5, 7, null, null, 3.793, 0, 0, 3.61, 3.88, 44.4],
  ["fx-full20-s3", "hh_cotfull_cfg2.0_s3", "full", 2, 3, null, null, 3.792, 0.0769, 0.0385, 3.68, 7.06, 55.7],
  ["fx-off15-s8", "hh_cotoff_cfg1.5_s8", "off", 1.5, 8, null, null, 3.763, 0, 0, 3.63, 5.98, 45],
  ["fx-r8def-s1", "hiphop_v2_distilled_rank8_str0.5_cotoff_cfgdef_s1", "off", null, 1, R8, 0.5, 3.743, 0, 0, 3.55, 5.76, 34.4],
  ["fx-r8-s4", "slider05_cotoff_cfg1.5_s4", "off", 1.5, 4, R8, 0.5, 3.734, 0.0769, 0.0577, 3.52, 6.6, 43.8],
  ["fx-off10-s1", "hh_cotoff_cfg1.0_s1", "off", 1, 1, null, null, 3.661, 0.0769, 0.0769, 3.54, 6.64, 34.7],
  ["fx-off15-s3", "hh_cotoff_cfg1.5_s3", "off", 1.5, 3, null, null, 3.576, 0, 0, 3.41, 7.48, 44.8],
  ["fx-r8-s7", "slider05_cotoff_cfg1.5_s7", "off", 1.5, 7, R8, 0.5, 3.499, 0.0385, 0.0192, 3.33, 4.04, 44.3],
  ["fx-r8-s3", "slider05_cotoff_cfg1.5_s3", "off", 1.5, 3, R8, 0.5, 3.308, 0.0385, 0.0385, 3.09, 6.12, 31.7],
  ["fx-old10-s1", "sv_oldschoolhiphop_str1.0_cotoff_cfg1.0_s1", "off", 1, 1, OLD, 1, 3.246, 0.0192, 0.0192, 3.05, 8.08, 49],
  ["fx-off20-s1", "hh_cotoff_cfg2.0_s1", "off", 2, 1, null, null, 3.61, 0.2308, 0.0385, 3.4, 6.9, 131.2],
  ["fx-r8-s1", "slider05_cotoff_cfg1.5_s1", "off", 1.5, 1, R8, 0.5, 3.853, 0.2115, 0, 3.67, 5.72, 42.5],
  ["fx-off15-s9", "hh_cotoff_cfg1.5_s9", "off", 1.5, 9, null, null, null, null, null, null, null, 46.1],
  ["fx-raw-s1", "hiphop_s1_cotoff", "off", null, 1, null, null, 3.976, 0.9231, 0.0577, 3.85, 4.85, 64],
  ["fx-raw-s3", "hiphop_s3_cotfull", "full", null, 3, null, null, 3.703, 0.4423, 0, 3.67, 2.62, 56.4],
];

/** raw id, variant, stages, SongEval mean, wer, diction, naturalness, buzz dB. */
type Variant = readonly [string, string, readonly Yue2PostStage[], number, number, number, number, number];
const VARIANTS: readonly Variant[] = [
  ["fx-raw-s1", "v0_master", ["master"], 3.976, 1.0577, 0.0577, 3.85, 4.53],
  ["fx-raw-s1", "v1_debuzz_mix_master", ["debuzz", "master"], 3.982, 1.0, 0.0577, 3.86, 16.37],
  ["fx-raw-s1", "v1s_debuzzS_mix_master", ["debuzz", "master"], 3.981, 0.9808, 0.0577, 3.86, 0.1],
  ["fx-raw-s1", "v2_stems_master", ["stems", "master"], 4.075, 1.0769, 0.0962, 3.95, 6.72],
  ["fx-raw-s1", "v3_stems_debuzz_master", ["stems", "debuzz", "master"], 4.073, 1.1154, 0.0962, 3.95, 10.99],
  ["fx-raw-s1", "v3s_stems_debuzzS_master", ["stems", "debuzz", "master"], 4.074, 1.0962, 0.0962, 3.95, 5.49],
  ["fx-raw-s3", "v0_master", ["master"], 3.702, 0.4423, 0, 3.67, 2.62],
  ["fx-raw-s3", "v1_debuzz_mix_master", ["debuzz", "master"], 3.707, 0.4423, 0, 3.67, 18.5],
  ["fx-raw-s3", "v1s_debuzzS_mix_master", ["debuzz", "master"], 3.704, 0.4423, 0, 3.67, -2.4],
  ["fx-raw-s3", "v2_stems_master", ["stems", "master"], 3.738, 0.4615, 0.0577, 3.68, 3.4],
  ["fx-raw-s3", "v3_stems_debuzz_master", ["stems", "debuzz", "master"], 3.737, 0.4615, 0, 3.68, 5.94],
  ["fx-raw-s3", "v3s_stems_debuzzS_master", ["stems", "debuzz", "master"], 3.739, 0.4615, 0.0577, 3.68, 3.13],
];

/** SongEval's five dimensions around a staged mean and naturalness (the other four share the rest). */
function scoresOf(id: string, se: number | null, wer: number | null, werSd: number | null, nat: number | null, buzz: number | null): SongScores | undefined {
  if (se === null || nat === null) return undefined;
  const rest = (se * 5 - nat) / 4;
  return {
    sha: `fixture-${id}`,
    scorerVersion: 1,
    ...(wer === null ? {} : { wer }),
    ...(werSd === null ? {} : { werSd }),
    songEval: { coherence: rest, musicality: rest, memorability: rest, clarity: rest, naturalness: nat },
    ...(buzz === null ? {} : { buzzIdx: buzz }),
    scoredAt: "2026-11-04T09:00:00.000Z",
  };
}

const factsOf = (cot: Yue2Cot, cfg: number | null, seed: number, adapter: string | null, strength: number | null, durationS: number, lineage: Yue2TakeFacts["lineage"]): Yue2TakeFacts => ({
  engine: "yue2",
  condition: { cot, seed, ...(cfg === null ? {} : { cfg }), ...(adapter === null ? {} : { adapter }), ...(strength === null ? {} : { adapterStrength: strength }) },
  style: STYLE,
  lyrics: LYRICS,
  lyricsDigest: "f1c0ffee5eed0001",
  durationS,
  rights: YUE2_RIGHTS,
  lineage,
});

function entry(takeId: string, title: string, facts: Yue2TakeFacts, scores: SongScores | undefined): LabEntry {
  return { takeId, title, facts, ...(scores === undefined ? {} : { scores }), durationS: facts.durationS };
}

export function fixtureTakes(): LabEntry[] {
  const renders = RENDERS.map(([id, title, cot, cfg, seed, ad, st, se, wer, sd, nat, buzz, dur]) => entry(id, title, factsOf(cot, cfg, seed, ad, st, dur, { postStages: [] }), scoresOf(id, se, wer, sd, nat, buzz)));
  const raws = new Map(renders.map((r) => [r.takeId, r]));
  const variants = VARIANTS.map(([raw, v, stages, se, wer, sd, nat, buzz]) => {
    const src = raws.get(raw)!;
    const id = `${raw}-${v.split("_")[0]}`;
    const c = src.facts.condition;
    return entry(id, `${src.title} / ${v}`, factsOf(c.cot, c.cfg ?? null, c.seed, null, null, src.facts.durationS, { sourceTakeId: raw, postStages: stages }), scoresOf(id, se, wer, sd, nat, buzz));
  });
  return [...renders, ...variants];
}

/** The main draw's 16 seeds and the two the 16-entry size cut (rank 17 and 18 by SongEval). */
export const MAIN_SEEDS = RENDERS.slice(0, 16).map((r) => r[0]);
export const MAIN_CUT = ["fx-r8-s3", "fx-old10-s1"];
