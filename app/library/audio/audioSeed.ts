// THE AUDIO SHELF'S DEMO ROWS — same seeded-once contract as
// `lib/useProjects.ts`'s `seedProjects` (a fresh account gets a shelf to look
// at instead of the gap found in Scout B's report: `/library/audio` renders
// zero create affordance, and with no asset ever written, Ledger/VocabSpine/
// Inspector have never been exercised against real data in this app).
//
// The rows are adapted from the `/contest` library-audio-workbench arena's own
// fixture (`.contest/.../library-audio-workbench/judging/entries/B/data/
// audio-items.json`, `"generated": "fixture, not real"` by its own header) —
// a track's `genre_tags`/`mood_tags`/`instrumentation`/`tempo_bpm`/`key`/
// `vendor`/`reference_track_id`/`prompt_round`/`ratings` map straight onto
// `AudioMeta`; an effect is the same shape minus the music fields, plus
// `sfx_category`/`loopable` — exactly the field `Ledger.tsx#isSfx` already
// keys off (no `kind: "track"|"sfx"` field exists; presence of `sfx_category`
// IS the distinction, so this seed never invents one).

import type { Asset, AudioMeta } from "@/lib/assets";

const track = (
  id: string,
  title: string,
  meta: Omit<AudioMeta, "duration_s"> & { duration_s: number },
  createdAt: number,
): Asset => ({
  id,
  uid: "", // overwritten per-account by seedAudioAssets
  path: ["audio"],
  name: title,
  src: "",
  kind: "audio",
  meta: meta as Record<string, unknown>,
  createdAt,
});

/** Builds the demo shelf for one account. `uid` is stamped onto every row at
 *  call time (not baked into the literals below) so the same fixture serves
 *  any account that lands here first. */
export function seedAudioAssets(uid: string): Asset[] {
  const base = Date.now() - 1000 * 60 * 60 * 24 * 10; // ten days of backdated takes
  const rows: Asset[] = [
    track(
      "seed-au-trk-0001",
      "Future Bass sketch — held chord open",
      {
        verdict: "kept",
        vendor: "suno",
        genre_tags: ["future bass", "melodic dubstep"],
        mood_tags: ["euphoric", "uplifting"],
        instrumentation: ["walking bassline", "jazzy sampled keys", "vinyl crackle texture"],
        tempo_bpm: 142,
        key: "A minor",
        duration_s: 153,
        prompt_round: "round2-librosa",
        ratings: { melody: 7, instrument_choice: 9, instrument_quality: 8 },
      },
      base + 1000 * 60 * 10,
    ),
    track(
      "seed-au-trk-0002",
      "Nu-Disco sketch — reference-anchored",
      {
        verdict: "unjudged",
        vendor: "elevenlabs",
        genre_tags: ["nu-disco", "synthwave", "80s french touch"],
        mood_tags: ["serene", "dreamy"],
        instrumentation: ["jazzy sampled keys", "808 kick", "sub bass synth", "soft piano"],
        tempo_bpm: 108,
        key: "F minor",
        duration_s: 131,
        reference_track_id: "ref-ratatat-breaking-away",
        prompt_round: "round1-fft",
      },
      base + 1000 * 60 * 25,
    ),
    track(
      "seed-au-trk-0003",
      "Drum And Bass sketch — warm pass",
      {
        verdict: "rejected",
        reject_reason: "tempo drifted past the half/double band on the back half",
        vendor: "suno",
        genre_tags: ["drum and bass", "liquid dnb"],
        mood_tags: ["nostalgic", "warm"],
        instrumentation: ["electric piano", "808 kick", "glitch percussion", "ambient pads"],
        tempo_bpm: 150,
        key: "A minor",
        duration_s: 176,
        prompt_round: "round2-librosa",
        ratings: { melody: 3, instrument_choice: 5, instrument_quality: 6 },
      },
      base + 1000 * 60 * 40,
    ),
    track(
      "seed-au-trk-0004",
      "Synthwave sketch — proven for cut 2",
      {
        verdict: "proven",
        vendor: "suno",
        genre_tags: ["synthwave", "retrowave"],
        mood_tags: ["driving", "nocturnal"],
        instrumentation: ["arpeggiated synth", "gated reverb snare", "analog bass"],
        tempo_bpm: 118,
        key: "D minor",
        duration_s: 164,
        prompt_round: "round3-flavor",
        prompt_text: "driving synthwave, gated reverb snare, analog bass, nocturnal highway mood",
        ratings: { melody: 8, instrument_choice: 8, instrument_quality: 9 },
      },
      base + 1000 * 60 * 55,
    ),
    track(
      "seed-au-trk-0005",
      "Lo-fi sketch — unrated take",
      {
        verdict: "unjudged",
        vendor: "elevenlabs",
        genre_tags: ["lo-fi hip hop"],
        mood_tags: ["cozy", "rainy"],
        instrumentation: ["dusty piano loop", "tape hiss", "boom-bap drums"],
        tempo_bpm: 84,
        key: "C major",
        duration_s: 142,
        prompt_round: "round1-fft",
      },
      base + 1000 * 60 * 70,
    ),
    track(
      "seed-au-sfx-0001",
      "Weapon fire — single shot",
      {
        verdict: "kept",
        sfx_category: "weapon-fire",
        loopable: false,
        duration_s: 1.1,
      },
      base + 1000 * 60 * 85,
    ),
    track(
      "seed-au-sfx-0002",
      "Footsteps — gravel loop",
      {
        verdict: "kept",
        sfx_category: "footsteps",
        loopable: true,
        duration_s: 2.4,
      },
      base + 1000 * 60 * 90,
    ),
    track(
      "seed-au-sfx-0003",
      "UI confirm chime",
      {
        verdict: "unjudged",
        sfx_category: "ui",
        loopable: false,
        duration_s: 0.6,
      },
      base + 1000 * 60 * 95,
    ),
  ];
  return rows.map((r) => ({ ...r, uid }));
}
