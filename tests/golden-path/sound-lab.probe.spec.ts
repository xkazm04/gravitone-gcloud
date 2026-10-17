// LANE — THE SOUND LAB FILES WHAT IT MAKES WHERE THE LIBRARY JUDGES IT (dynamic).
//
// The music playground's renders were session-only blob URLs: paid for, never
// judged, gone on reload. The Sound lab (app/playground, 2026-10-05) files
// every render as a take in the Library's audio store. Five things can quietly
// break that, and each is a test here, run against fake-indexeddb so the
// store is the real code:
//
//   1. THE ENGINE SEAM. The registry (lib/sound/engines.ts since Phase 6) is the
//      only place that knows Suno composes through its browser job and takes a
//      round trip, ElevenLabs is copy-only on the desk and Local is declared-not-
//      installed — and a withheld operation keeps its reason, verbatim.
//   2. THE MAPPING. What a render handed back plus what the lab asked for
//      becomes AudioMeta with nothing written as undefined. (Its round trip
//      through v1's IndexedDB shelf retired with that shelf in Phase 5; the lab
//      files into the sound store, lib/sound/client.ts.)
//   3. THE EDIT. Kept sections are references at the source's measured ranges;
//      regenerated ones carry the conditioning the mode asked for; only the
//      regenerated seconds are counted as spend.
//   4. THE FAN-OUT. A hunt is the control plus the book's one-change
//      variations — and `variationsOfSeed`, lifted out of `variations` for it,
//      returns exactly what `variations` returned before the lift, for every
//      track in the fixture.
//   5. THE HUNT, READ BACK. Knockouts are rejections, the crown is a keep, the
//      lanes are found again from the takes alone.

import { test, expect } from "@playwright/test";

import { compose, seedOf, type Seed } from "@/lib/sound/audio/prompts";
import type { Take } from "@/lib/sound/audio/take";
import { variations, variationsOfSeed, type Variation } from "@/lib/sound/audio/variations";
import { vocabulary, type Facet, type TermEntry } from "@/lib/sound/audio/vocabulary";
import { can, engineById, engineRegistry, engineState, makersOf, NO_DESK_PRODUCER } from "@/lib/sound/engines";
// The v1 lab's registry, which labModel's hunt pricing still reads; it moves with Hunt (wave B).
import { engineRegistry as labRegistry } from "@/app/playground/engines";
import {
  buildEditPlan,
  editSeconds,
  fanOut,
  fanOutSeconds,
  hunts,
  isEditable,
  labTitle,
  laneOf,
  renderMeta,
  seams,
  sunoDraftText,
  sunoFields,
} from "@/app/playground/labModel";
import { ABSENCE_REASON } from "@/lib/capabilities";
import type { V1Asset as Asset } from "@/lib/fixtures/browserBundle";
import type { WireAudioRefChunk, WireGenerationChunk, WirePlan } from "@/lib/music/types";

import { seedAudioAssets } from "./_v1audio/audioSeed";
import { takeFromAsset } from "./_v1audio/takeFromAsset";

const UID = "uid-sound-lab-probe";

const PLAN: WirePlan = {
  chunks: [
    { text: "Low strings intro", duration_ms: 6000, positive_styles: ["strings"], negative_styles: [] },
    { text: "Pulse build", duration_ms: 8000, positive_styles: ["arp"], negative_styles: [] },
    { text: "Full drop", duration_ms: 10000, positive_styles: ["kick"], negative_styles: ["vocals"] },
    { text: "Release", duration_ms: 6000, positive_styles: [], negative_styles: [] },
  ],
};

const SEED: Seed = {
  genres: ["synthwave"],
  moods: ["nocturnal"],
  instruments: ["synth plucks", "808 kick"],
  bpm: 118,
  key: "A minor",
  avoid: [],
};

/* ── 1 · the engine seam ─────────────────────────────────────────────── */

test("registry: Suno composes through the browser job, ElevenLabs is copy-only with its reasons, Local declared", () => {
  // The desk's registry (lib/sound/engines.ts, Phase 6 L60). Suno's row flipped when its automation
  // landed (a seed is a box.chrome job); ElevenLabs renders nothing from the desk, and each render
  // op keeps its place in `withheld` with the reason.
  const on = engineRegistry({ musicSectionEdit: true, musicSfx: true });
  console.log(`[lab] engines ${on.map((e) => `${e.id}:${e.transport}:${engineState(e)}:${e.ops.join("+")}`).join(" ")}`);
  const suno = engineById(on, "suno");
  const el = engineById(on, "elevenlabs");
  const local = engineById(on, "local");
  expect(suno?.transport).toBe("browser");
  expect(can(suno, "compose")).toBe(true);
  expect(can(suno, "file-return")).toBe(true);
  expect(can(suno, "sfx")).toBe(false);
  expect(el?.transport).toBe("api");
  expect(el?.ops).toEqual(["prompt-copy", "sfx"]);
  expect(el === undefined ? null : engineState(el)).toBe("live");
  expect(el?.withheld).toEqual(["compose", "plan", "section-edit"].map((op) => ({ op, reason: NO_DESK_PRODUCER })));
  expect(local?.transport).toBe("none");
  expect(local === undefined ? null : engineState(local)).toBe("not-installed");
  expect(local?.ops).toEqual([]);
  expect(local?.needs?.length).toBeGreaterThan(0);
  // Who makes what on the desk: Suno songs; ElevenLabs effects, as the sfx producer's batch (L66).
  expect(makersOf(on, "music").map((e) => e.id)).toEqual(["suno"]);
  expect(makersOf(on, "sfx").map((e) => e.id)).toEqual(["elevenlabs"]);

  // A capability switched off: the op keeps its place, now with the deployment's reason verbatim.
  const noSfx = engineById(engineRegistry({ musicSectionEdit: true, musicSfx: false }), "elevenlabs");
  expect(noSfx?.withheld.find((w) => w.op === "sfx")).toEqual({ op: "sfx", reason: ABSENCE_REASON.musicSfx });
  const off = engineById(engineRegistry({ musicSectionEdit: false, musicSfx: false }), "elevenlabs");
  expect(off?.withheld.find((w) => w.op === "compose")).toEqual({ op: "compose", reason: ABSENCE_REASON.musicSectionEdit });
});

/* ── 2 · the mapping ─────────────────────────────────────────────────── */

test("mapping: a render's meta names what the lab asked for, and writes nothing undefined", () => {
  const parent = takeFromAsset(seedAudioAssets(UID)[0]);
  const meta = renderMeta(
    { songId: "song_x1", plan: PLAN },
    { op: "plan", seed: SEED, prompt: compose(SEED, "elevenlabs", {}), parent, variation: { axis: "tempo", diff: ["+6 BPM"] }, huntId: "hunt-abc" },
  );
  for (const [k, v] of Object.entries(meta)) expect(v, `${k} written as undefined`).not.toBeUndefined();
  expect(meta).toMatchObject({ vendor: "elevenlabs", lab_op: "plan", song_id: "song_x1", plan: PLAN, parent_id: parent.id, genre_tags: SEED.genres, instrumentation: SEED.instruments, tempo_bpm: 118, variation: { axis: "tempo", diff: ["+6 BPM"] }, hunt_id: "hunt-abc" });
  expect(labTitle(SEED, "plan", 4)).toBe("Synthwave plan take 4");

  // An effect carries its category and no recipe terms; a fixture row has no lab fields at all.
  const fx = renderMeta({ songId: null, plan: null }, { op: "sfx", seed: SEED, prompt: "hit", sfx: { category: "impact", loop: false } });
  expect(fx.sfx_category).toBe("impact");
  expect(fx.genre_tags).toEqual([]);
  expect("song_id" in fx).toBe(false);
  expect("tempo_bpm" in fx).toBe(false);
  const fixture = takeFromAsset(seedAudioAssets(UID)[1]);
  expect([fixture.lab_op, fixture.song_id, fixture.plan, fixture.peaks, fixture.hunt_id]).toEqual([null, null, null, null, null]);
  expect(isEditable({ ...fixture, kind: "track", song_id: "song_x1", plan: PLAN })).toBe(true);
});

/* ── 3 · the edit ────────────────────────────────────────────────────── */

test("edit: kept sections reference the source's ranges; regenerated ones carry the mode", () => {
  const plan = buildEditPlan(PLAN, "song_src", ["keep", "medium", "free", "keep"], ["a", "pulse, harder", "drop, wider", "d"]);
  const [k1, g2, g3, k4] = plan.chunks;
  console.log(`[lab] edit plan ${JSON.stringify(plan.chunks.map((c) => ("song_id" in c && !("text" in c) ? "ref" : "gen")))}`);
  expect(k1).toEqual({ song_id: "song_src", range: { start_ms: 0, end_ms: 6000 } });
  expect((g2 as WireGenerationChunk).text).toBe("pulse, harder");
  expect((g2 as WireGenerationChunk).conditioning_ref).toEqual({ song_id: "song_src", range: { start_ms: 6000, end_ms: 14000 } });
  expect((g2 as WireGenerationChunk).condition_strength).toBe("medium");
  expect((g3 as WireGenerationChunk).conditioning_ref).toBeUndefined();
  expect((g3 as WireGenerationChunk).duration_ms).toBe(10000);
  expect(k4 as WireAudioRefChunk).toEqual({ song_id: "song_src", range: { start_ms: 24000, end_ms: 30000 } });
  // Only the regenerated seconds are new audio.
  expect(editSeconds(PLAN, ["keep", "medium", "free", "keep"])).toBe(18);
  expect(editSeconds(PLAN, ["keep", "keep", "keep", "keep"])).toBe(0);
  expect(seams(PLAN.chunks)).toEqual([0.2, 14 / 30, 0.8]);
});

/* ── Suno, by hand ───────────────────────────────────────────────────── */

// The return-against-a-draft half retired with v1's Library drafts (Phase 5); the Audio lane's
// composer (app/(studio)/audio) owns drafts now.
test("suno: the style line is the book's, and the tags follow the plan", () => {
  const f = sunoFields({ ...SEED, avoid: ["vocals"] }, {}, PLAN);
  const book = compose({ ...SEED, avoid: ["vocals"] }, "suno", {}).split("\n")[0];
  expect(`Style: ${f.style}`).toBe(book);
  expect(f.exclude).toBe("vocals");
  expect(f.lyrics.split("\n")).toEqual(["[Instrumental]", "[Low Strings Intro]", "[Pulse Build]", "[Full Drop]", "[Release]"]);
  const noPlan = sunoFields(SEED, {}, null);
  expect(noPlan.lyrics.split("\n")[1]).toBe("[Intro]");

  expect(sunoDraftText(f).startsWith("Style: ")).toBe(true);
});

/* ── 4 · the fan-out, and the lift it rests on ───────────────────────── */

/** `variations` as it stood before `variationsOfSeed` was lifted out of it
 *  (app/library/audio/book.ts at c9df028), verbatim — the oracle the lift is
 *  held to. */
function variationsBefore(t: Take, voc: readonly TermEntry[]): Variation[] {
  if (t.kind !== "track") return [];
  const REL: Record<string, string> = {
    "A minor": "C major", "C major": "A minor", "F minor": "Ab major", "D minor": "F major", "F major": "D minor",
    "E minor": "G major", "G minor": "Bb major", "C minor": "Eb major", "B minor": "D major", "G major": "E minor",
  };
  const pctKept = (e: TermEntry) => (e.keepRate != null ? `${Math.round(e.keepRate * 100)}% kept` : "");
  const best = (facet: Facet, not: string[]) =>
    voc
      .filter((v) => v.facet === facet && !not.includes(v.term) && v.stance !== "avoid" && v.judged >= 2)
      .sort((a, b) => Number(b.stance === "prefer") - Number(a.stance === "prefer") || (b.keepRate ?? 0) - (a.keepRate ?? 0) || (b.avg ?? 0) - (a.avg ?? 0))[0];
  const worst = (facet: Facet, among: string[]) =>
    voc.filter((v) => v.facet === facet && among.includes(v.term)).sort((a, b) => (a.stance === "avoid" ? -1 : 0) || (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  const base = seedOf(t);
  const out: Variation[] = [];
  const wi = worst("instrumentation", base.instruments);
  const bi = best("instrumentation", base.instruments);
  if (wi && bi) {
    const s = seedOf(t);
    s.instruments = s.instruments.map((x) => (x === wi.term ? bi.term : x));
    out.push({ axis: "swap", diff: [`−${wi.term}`, `+${bi.term}`], seed: s, why: pctKept(bi) });
  }
  const wm = worst("mood_tags", base.moods);
  const bm = best("mood_tags", base.moods);
  if (wm && bm) {
    const s = seedOf(t);
    s.moods = s.moods.map((x) => (x === wm.term ? bm.term : x));
    out.push({ axis: "mood", diff: [`−${wm.term}`, `+${bm.term}`], seed: s, why: pctKept(bm) });
  }
  const bpm = t.tempo_bpm || 100;
  for (const d of [-6, 6]) {
    const s = seedOf(t);
    s.bpm = bpm + d;
    out.push({ axis: "tempo", diff: [`${d > 0 ? "+" : ""}${d} BPM`], seed: s, why: `${Math.round(bpm + d)} BPM` });
  }
  if (t.key && REL[t.key]) {
    const s = seedOf(t);
    s.key = REL[t.key];
    out.push({ axis: "key", diff: [`${t.key} → ${REL[t.key]}`], seed: s, why: "relative" });
  }
  const fence =
    voc.find((v) => v.stance === "avoid" && v.facet === "instrumentation" && !base.instruments.includes(v.term)) ??
    voc.filter((v) => v.facet === "instrumentation" && v.judged >= 4 && !base.instruments.includes(v.term)).sort((a, b) => (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  if (fence) {
    const s = seedOf(t);
    s.avoid = [fence.term];
    out.push({ axis: "fence", diff: [`no ${fence.term}`], seed: s, why: pctKept(fence) });
  }
  return out;
}

test("lift: variationsOfSeed reproduces the old variations for every fixture track, with and without a hand", () => {
  const takes = seedAudioAssets(UID).map(takeFromAsset);
  const hands = { "instrumentation:808 kick": { stance: "avoid" as const }, "mood_tags:dreamy": { stance: "prefer" as const } };
  let compared = 0;
  for (const h of [{}, hands]) {
    const voc = vocabulary(takes, h);
    for (const t of takes) {
      expect(variations(t, voc), `${t.id} drifted`).toEqual(variationsBefore(t, voc));
      compared++;
    }
  }
  console.log(`[lab] variations compared on ${compared} take×hand pairs`);
  expect(compared).toBe(320);
});

test("fan-out: the control first, then one lane per change, priced per rendering engine", () => {
  const takes = seedAudioAssets(UID).map(takeFromAsset);
  const voc = vocabulary(takes, {});
  const lanes = fanOut(SEED, voc);
  console.log(`[lab] lanes ${lanes.map((l) => `${l.axis}(${l.diff.join(" ")})`).join(" | ")}`);
  expect(lanes[0]).toMatchObject({ id: "control", axis: "control", diff: [] });
  expect(lanes[0].seed).toEqual(SEED);
  expect(lanes.slice(1).map((l) => l.axis)).toEqual(variationsOfSeed(SEED, voc).map((v) => v.axis));
  // Every non-control lane changes exactly one axis of the seed.
  for (const l of lanes.slice(1)) {
    const changed = (["genres", "moods", "instruments", "bpm", "key", "avoid"] as const).filter(
      (k) => JSON.stringify(l.seed[k]) !== JSON.stringify(SEED[k]),
    );
    expect(changed, `${l.id} changed ${changed.join(",")}`).toHaveLength(1);
  }
  const reg = labRegistry({ musicSectionEdit: true, musicSfx: true });
  // Only ElevenLabs renders over an API: Suno drafts and the declared lane cost nothing here.
  expect(fanOutSeconds(lanes, reg, 20)).toBe(lanes.length * 20);
  expect(fanOutSeconds(lanes, labRegistry({ musicSectionEdit: false, musicSfx: false }), 20)).toBe(0);
});

/* ── 5 · the hunt, read back ─────────────────────────────────────────── */

test("hunt: lanes found again from the takes; knockouts are rejections, the crown a keep", () => {
  const voc = vocabulary(seedAudioAssets(UID).map(takeFromAsset), {});
  const lanes = fanOut(SEED, voc);
  const base = seedAudioAssets(UID)[0];
  const mk = (id: string, lane: (typeof lanes)[number], verdict: string, at: number, ratings?: Record<string, number>): Take =>
    takeFromAsset({
      ...base,
      id,
      createdAt: at,
      meta: {
        verdict,
        vendor: "elevenlabs",
        lab_op: "compose",
        hunt_id: "hunt-1",
        ...(lane.axis === "control" ? {} : { variation: { axis: lane.axis, diff: lane.diff } }),
        ...(ratings ? { ratings } : {}),
      },
    } as Asset);
  const takes = [
    mk("h-control", lanes[0], "kept", 3, { melody: 8, instrument_choice: 9, instrument_quality: 7 }),
    mk("h-1", lanes[1], "rejected", 2),
    mk("h-2", lanes[2], "unjudged", 1),
  ];
  const [h] = hunts(takes);
  expect(h.id).toBe("hunt-1");
  expect(h.takes).toHaveLength(3);
  expect(h.out.map((t) => t.id)).toEqual(["h-1"]);
  expect(h.alive.map((t) => t.id).sort()).toEqual(["h-2", "h-control"]);
  expect(h.winner?.id).toBe("h-control");
  expect(laneOf(takes[0], lanes)?.id).toBe("control");
  expect(laneOf(takes[1], lanes)?.id).toBe(lanes[1].id);
  expect(laneOf(takes[2], lanes)?.id).toBe(lanes[2].id);
});
