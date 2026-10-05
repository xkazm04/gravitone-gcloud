// LANE — THE SOUND LAB FILES WHAT IT MAKES WHERE THE LIBRARY JUDGES IT (dynamic).
//
// The music playground's renders were session-only blob URLs: paid for, never
// judged, gone on reload. The Sound lab (app/playground, 2026-10-05) files
// every render as a take in the Library's audio store. Five things can quietly
// break that, and each is a test here, run against fake-indexeddb so the
// store is the real code:
//
//   1. THE ENGINE SEAM. The registry is the only place that knows ElevenLabs is
//      live, Suno is a manual round trip and Local is declared-not-installed —
//      and a withheld capability keeps its reason, verbatim.
//   2. THE MAPPING. What a render handed back plus what the lab asked for
//      becomes AudioMeta that `takeFromAsset` reads back field for field —
//      through a real write and a fresh list, which is what a reload does.
//   3. THE EDIT. Kept sections are references at the source's measured ranges;
//      regenerated ones carry the conditioning the mode asked for; only the
//      regenerated seconds are counted as spend.
//   4. THE FAN-OUT. A hunt is the control plus the book's one-change
//      variations — and `variationsOfSeed`, lifted out of `variations` for it,
//      returns exactly what `variations` returned before the lift, for every
//      track in the fixture.
//   5. THE HUNT, READ BACK. Knockouts are rejections, the crown is a keep, the
//      lanes are found again from the takes alone.

import "fake-indexeddb/auto";

import { test, expect } from "@playwright/test";

import { seedAudioAssets } from "@/app/library/audio/audioSeed";
import {
  compose,
  newDraft,
  peaksOf,
  returnMeta,
  seedOf,
  takeFromAsset,
  variations,
  variationsOfSeed,
  vocabulary,
  type Facet,
  type Seed,
  type Take,
  type TermEntry,
  type Variation,
} from "@/app/library/audio/book";
import { can, engineRegistry } from "@/app/playground/engines";
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
import { assetFromUpload, listAssets, putUploads, type Asset } from "@/lib/assets";
import { ABSENCE_REASON } from "@/lib/capabilities";
import type { WireAudioRefChunk, WireGenerationChunk, WirePlan } from "@/lib/music/types";

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

test("registry: ElevenLabs api, Suno manual, Local declared — and a withheld op keeps its reason", () => {
  const on = engineRegistry({ musicSectionEdit: true, musicSfx: true });
  console.log(`[lab] engines ${on.map((e) => `${e.id}:${e.transport}:${e.status.state}:${e.ops.join("+")}`).join(" ")}`);
  const [el, suno, local] = on;
  expect(el.id).toBe("elevenlabs");
  expect(el.transport).toBe("api");
  expect(el.status.state).toBe("live");
  expect(el.ops).toEqual(["compose", "plan", "section-edit", "sfx"]);
  expect(suno.transport).toBe("manual");
  expect(suno.ops).toEqual(["prompt-copy", "file-return"]);
  // Suno renders nothing over an API today: the seam a future automation flips.
  expect(can(suno, "compose")).toBe(false);
  expect(local.transport).toBe("none");
  expect(local.status.state).toBe("not-installed");
  expect(local.ops).toEqual([]);
  expect(local.needs?.length).toBeGreaterThan(0);

  // SFX off: the op moves to `withheld` WITH the capability's reason, verbatim.
  const noSfx = engineRegistry({ musicSectionEdit: true, musicSfx: false })[0];
  expect(can(noSfx, "sfx")).toBe(false);
  expect(noSfx.withheld).toEqual([{ op: "sfx", reason: ABSENCE_REASON.musicSfx }]);
  expect(noSfx.status.state).toBe("live");

  // Everything off: ElevenLabs is off here, and says why.
  const off = engineRegistry({ musicSectionEdit: false, musicSfx: false })[0];
  expect(off.ops).toEqual([]);
  expect(off.status).toEqual({ state: "off", reason: ABSENCE_REASON.musicSectionEdit });
  expect(off.withheld.map((w) => w.op)).toEqual(["compose", "plan", "section-edit", "sfx"]);
});

/* ── 2 · the mapping, through a real write ───────────────────────────── */

test("mapping: a render's meta survives a write and a fresh read as the same take", async () => {
  const parent = takeFromAsset(seedAudioAssets(UID)[0]);
  const meta = {
    ...renderMeta(
      { songId: "song_x1", plan: PLAN },
      {
        op: "plan",
        seed: SEED,
        prompt: compose(SEED, "elevenlabs", {}),
        parent,
        variation: { axis: "tempo", diff: ["+6 BPM"] },
        huntId: "hunt-abc",
      },
    ),
    peaks: [0.1, 0.5, 1, 0.4],
    measured: { tempo_bpm: 117.5, key: "A minor", energy: "high" as const, method: "onset autocorr · goertzel chroma" },
    duration_s: 30,
    verdict: "unjudged" as const,
  };
  // Nothing undefined is written: an absent field stays absent.
  for (const [k, v] of Object.entries(meta)) expect(v, `${k} written as undefined`).not.toBeUndefined();

  const title = labTitle(SEED, "plan", 4);
  expect(title).toBe("Synthwave plan take 4");
  const file = new File([new Uint8Array([1, 2, 3, 4])], `${title}.mp3`, { type: "audio/mpeg" });
  const pair = assetFromUpload(UID, file, ["audio"], "audio");
  pair.asset.meta = { ...(pair.asset.meta ?? {}), ...meta };
  await putUploads([pair]);

  const back = (await listAssets(UID)).find((a) => a.id === pair.asset.id)!;
  const t = takeFromAsset(back);
  console.log(`[lab] filed ${t.title} op=${t.lab_op} song=${t.song_id} sections=${t.plan?.chunks.length} parent=${t.parent_id}`);
  expect(t.title).toBe(title);
  expect(t.kind).toBe("track");
  expect(t.vendor).toBe("elevenlabs");
  expect(t.lab_op).toBe("plan");
  expect(t.song_id).toBe("song_x1");
  expect(t.plan).toEqual(PLAN);
  expect(t.parent_id).toBe(parent.id);
  expect(t.genre_tags).toEqual(SEED.genres);
  expect(t.instrumentation).toEqual(SEED.instruments);
  expect(t.tempo_bpm).toBe(118);
  expect(t.measured?.tempo_bpm).toBe(117.5);
  expect(t.variation).toEqual({ axis: "tempo", diff: ["+6 BPM"] });
  expect(t.hunt_id).toBe("hunt-abc");
  expect(t.upload_id).toBeTruthy();
  expect(isEditable(t)).toBe(true);
  // The Library draws the MEASURED waveform for it, not the id-seeded sketch.
  expect(peaksOf(t, 4)).toEqual([0.1, 0.5, 1, 0.4]);
  expect(peaksOf(t, 2)).toEqual([0.5, 1]);

  // An effect carries its category and no recipe terms; a fixture row has no lab fields at all.
  const fx = renderMeta({ songId: null, plan: null }, { op: "sfx", seed: SEED, prompt: "hit", sfx: { category: "impact", loop: false } });
  expect(fx.sfx_category).toBe("impact");
  expect(fx.genre_tags).toEqual([]);
  expect("song_id" in fx).toBe(false);
  expect("tempo_bpm" in fx).toBe(false);
  const fixture = takeFromAsset(seedAudioAssets(UID)[1]);
  expect([fixture.lab_op, fixture.song_id, fixture.plan, fixture.peaks, fixture.hunt_id]).toEqual([null, null, null, null, null]);
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

test("suno: the style line is the book's, the tags follow the plan, and a return files against its draft", () => {
  const f = sunoFields({ ...SEED, avoid: ["vocals"] }, {}, PLAN);
  const book = compose({ ...SEED, avoid: ["vocals"] }, "suno", {}).split("\n")[0];
  expect(`Style: ${f.style}`).toBe(book);
  expect(f.exclude).toBe("vocals");
  expect(f.lyrics.split("\n")).toEqual(["[Instrumental]", "[Low Strings Intro]", "[Pulse Build]", "[Full Drop]", "[Release]"]);
  const noPlan = sunoFields(SEED, {}, null);
  expect(noPlan.lyrics.split("\n")[1]).toBe("[Intro]");

  const d = { ...newDraft(SEED, "suno", sunoDraftText(f), null, null, 1), hunt_id: "hunt-abc", variation: { axis: "mood", diff: ["−dark", "+warm"] } };
  const m = returnMeta(d, undefined);
  expect(m.vendor).toBe("suno");
  expect(m.draft_id).toBe(d.id);
  expect(m.prompt_text?.startsWith("Style: ")).toBe(true);
  expect(m.hunt_id).toBe("hunt-abc");
  expect(m.variation).toEqual({ axis: "mood", diff: ["−dark", "+warm"] });
  // A Library draft carries neither, and neither is written.
  const plain = returnMeta(newDraft(SEED, "suno", "x", null, null, 1), undefined);
  expect("hunt_id" in plain).toBe(false);
  expect("variation" in plain).toBe(false);
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
  const reg = engineRegistry({ musicSectionEdit: true, musicSfx: true });
  // Only ElevenLabs renders over an API: Suno drafts and the declared lane cost nothing here.
  expect(fanOutSeconds(lanes, reg, 20)).toBe(lanes.length * 20);
  expect(fanOutSeconds(lanes, engineRegistry({ musicSectionEdit: false, musicSfx: false }), 20)).toBe(0);
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
