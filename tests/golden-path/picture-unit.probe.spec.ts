// LANE — ONE PICTURE UNIT: an explainer beat and a trailer shot are the same
// noun, with an identity that is not a position (dynamic, card frames-phase-A,
// stage 1).
//
// THE DEFECTS THIS GUARDS:
//
//   · A FRAME'S IDENTITY WAS ITS INDEX. `framesFromRender` named every frame
//     `fr-${i}`, and alternatives (`frames-alts`) are keyed by frame id. So a
//     project that switched its adopted render showed the NEW render's `fr-3`
//     the kept plates of the OLD render's `fr-3` — paid pictures of a different
//     beat, offered as alternatives for this one.
//   · A TRAILER CUT HAD NO PICTURE AT ALL. `framesFor` answers `[]` for every
//     origin but the explainer fixture, so nothing downstream of a trailer's
//     shot list had a clock to read. A unit per shot, with its own start and
//     hold, is what Score and Cut will read in the next stage.
//   · THE STORED SHAPE HAD NO MIGRATION SEAM. `withClips` was a hand migration
//     run inline at the read; the frames record now has a def, a version, and a
//     v1 → v2 step that runs at the read seam and writes NOTHING until somebody
//     edits — the record is money (plates), and a rewrite on open is a rewrite
//     nobody asked for.
//
// Cases 1, 2 and 3 import the new module DYNAMICALLY, so a missing module fails
// those cases rather than the whole file.
//
// RETIRED WITH THE v1 STUDIO (Phase 4 wave D): the hook cases (useFrames over a
// v1 record, the switched render's alternatives, the stage 2 cases that opened
// Frames, Score and Cut on a trailer) drove app/_phases hooks that are gone. The
// frames part's successors: a frames record walks v2 -> v3 at its kernel door
// (packages/kernel/test/parts.test.ts), Frames derives the adopted chain's units
// (tests/next-server/parts-frames.test.ts), and Score/Cut lay the trailer's shots
// on one clock (tests/next-server/parts-finish.test.ts).
//
import { test, expect } from "@playwright/test";

import {
  durationOf,
  emptyClip,
  explainerRender,
  framesFromRender,
  type FramesRender,
} from "@/lib/frames/frames";
import { shotsFromBeats, type ShotSourceBeat } from "@/lib/frames/shots";
import { stageStep } from "@/lib/import/steps";
import type { Sink } from "@/lib/import/bytes";
import { STEP_RECORDS } from "@gt/domain/steps/registry";
import { pictureFromFrames } from "@/lib/score/picture";
import { RENDERS } from "@/lib/script/renders";

/* ──────────────────────────────── fixtures ────────────────────────────────── */

/** Strip the one field the card allows to differ. */
const STEP_KINDS = [...new Set(Object.values(STEP_RECORDS).map((d) => d.owner))];

const sansId = <T extends { id: string }>(x: T): Omit<T, "id"> => {
  const { id: _drop, ...rest } = x;
  void _drop;
  return rest;
};


/** Three beats, seven shots, thirty seconds — with a peak whose span (5 s over
 *  3 shots) does not divide evenly, so a unit clock built from the shot layer's
 *  ROUNDED holds (1.7 × 3 = 5.1) drifts off the film and this case says so. */
const TRAILER_BEATS: ShotSourceBeat[] = [
  { id: "b-rung-1", at: "0:00", kind: "rung", label: "the threat has a direction", text: "It moves.", role: "rung" },
  { id: "b-peak", at: "0:10", kind: "peak", label: "climax montage", text: "Everything at once.", role: "peak" },
  { id: "b-rung-2", at: "0:15", kind: "rung", label: "and it is closer", text: "Closer.", role: "rung" },
];
const TRAILER_SOURCE: FramesRender = {
  id: "cut-probe",
  title: "probe trailer",
  engineLabel: "probe",
  template: "trailer",
  durationS: 30,
  beats: TRAILER_BEATS,
  origin: "trailer-cut",
};

/* ── 1 · an explainer unit IS today's frame, apart from its id ─────────────── */

test("case 1: explainer → one unit per beat, byte-identical to framesFromRender apart from id", async () => {
  const { unitsFromRender, framesFromUnits } = await import("@/lib/frames/picture/unit");
  let n = 0;
  for (const r of RENDERS) {
    const seeds = framesFromRender(r);
    const units = unitsFromRender(explainerRender(r), r);
    expect(units.length, `${r.id} count`).toBe(seeds.length);

    const frames = framesFromUnits(units);
    expect(frames.map(sansId), `${r.id}: the projection is today's frames, field for field`).toEqual(
      seeds.map(sansId),
    );
    for (const [i, u] of units.entries()) {
      const f = seeds[i];
      expect(u.kind).toBe("beat");
      expect(u.beatRef.at).toBe(f.at);
      expect(u.line).toBe(f.line);
      expect(u.elements).toEqual(f.elements);
      expect(u.texts).toEqual(f.texts);
      // On the clock, explicitly — the same numbers the readers derive today.
      expect(u.startS, `${r.id} ${f.at} start`).toBe(f.atS);
      expect(u.holdS, `${r.id} ${f.at} hold`).toBe(durationOf(seeds, i, r.durationS));
      // THE ONE DIFFERENCE: derived from the beat, never from the index.
      expect(u.id).toBe(`${r.id}:${f.at}:${u.ordinal}`);
      expect(u.id).not.toMatch(/^fr-\d+$/);
      n++;
    }
    expect(new Set(units.map((u) => u.id)).size, `${r.id} ids are unique`).toBe(units.length);
  }
  expect(n, "the walk read every shipped render's beats").toBeGreaterThan(20);
  console.log(`[case 1] ${RENDERS.map((r) => `${r.id}:${r.beats.length}`).join(" ")} units, byte-identical apart from id`);
});

test("case 1: the frames the step derives carry unit ids — two renders share none", async () => {
  const { unitsFromRender, framesFromUnits } = await import("@/lib/frames/picture/unit");
  const [a, b] = RENDERS;
  const idsA = new Set(framesFromUnits(unitsFromRender(explainerRender(a), a)).map((f) => f.id));
  const idsB = framesFromUnits(unitsFromRender(explainerRender(b), b)).map((f) => f.id);
  // The premise, stated: positional ids collide across every pair of renders.
  expect(framesFromRender(b).some((f) => framesFromRender(a).some((g) => g.id === f.id))).toBe(true);
  expect(idsB.filter((id) => idsA.has(id)), "a unit id names one beat of one render").toEqual([]);
});

/* ── 2 · a trailer shot is a unit, on one clock ────────────────────────────── */

test("case 2: trailer (3 beats → 7 shots, 30s) → 7 units, start strictly increasing, holds sum to the film", async () => {
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  const shots = shotsFromBeats(TRAILER_BEATS, TRAILER_SOURCE.durationS);
  expect(shots, "the fixture decomposes as designed").toHaveLength(7);

  const units = unitsFromRender(TRAILER_SOURCE, RENDERS[0]);
  expect(units).toHaveLength(7);
  expect(units.every((u) => u.kind === "shot")).toBe(true);

  const starts = units.map((u) => u.startS);
  for (let i = 1; i < starts.length; i++)
    expect(starts[i]!, `unit ${i} starts after unit ${i - 1}`).toBeGreaterThan(starts[i - 1]!);
  const sum = units.reduce((s, u) => s + (u.holdS ?? NaN), 0);
  expect(Math.abs(sum - 30), `Σ holdS = ${sum}`).toBeLessThanOrEqual(0.01);
  // Each unit ends where the next begins — one clock, not seven estimates.
  for (let i = 1; i < units.length; i++)
    expect(Math.abs(units[i - 1].startS! + units[i - 1].holdS! - units[i].startS!)).toBeLessThanOrEqual(0.001);

  // Identity from the beat, not the position: three shots under one beat have
  // three ids, and every one names its beat.
  expect(units.map((u) => u.id)).toEqual(
    shots.map((s) => `${TRAILER_SOURCE.id}:${s.beatId}:${s.ordinal}`),
  );
  expect(units.filter((u) => u.beatRef.beatId === "b-peak").map((u) => [u.ordinal, u.ofBeat])).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  // The shot's staging travels on the unit; its picture starts empty.
  expect(units[0].staging?.role).toBe("rung");
  expect(units.every((u) => u.plate.state === "empty" && u.clip.motion === "")).toBe(true);
  console.log(`[case 2] ${units.length} units · Σhold ${sum.toFixed(3)}s · starts ${starts.map((s) => s?.toFixed(2)).join(" ")}`);
});

test("case 2: a trailer with no spine, and an unplaceable beat, derive no units at the wrong time", async () => {
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  expect(unitsFromRender({ ...TRAILER_SOURCE, beats: [], origin: "no-spine" }, RENDERS[0])).toEqual([]);
  const withTbd = [TRAILER_BEATS[0], { ...TRAILER_BEATS[1], at: "tbd" }, TRAILER_BEATS[2]];
  const units = unitsFromRender({ ...TRAILER_SOURCE, beats: withTbd }, RENDERS[0]);
  expect(units.some((u) => u.beatRef.beatId === "b-peak"), "an unplaceable beat has no place on the clock").toBe(false);
  expect(units.every((u) => u.startS !== null && u.holdS !== null)).toBe(true);
});

/* ── 3 · v1 → v2 at the read seam, and no write until somebody edits ───────── */

/** A v1 record as the last build wrote it: positional ids, one paid plate, and
 *  no `clip` key anywhere (the shape before Frames inherited motion). */
function v1Record() {
  const r = RENDERS[0];
  const frames = framesFromRender(r).map((f, i) => {
    const { clip: _clip, ...rest } = f;
    void _clip;
    return i === 0 ? { ...rest, plate: { state: "ready", src: "data:image/png;base64,UEFJRA==", costUsd: 0.04, subject: "s" } } : rest;
  });
  return { frames, renderId: r.id, savedAt: 1 } as Record<string, unknown>;
}

test("case 3: a v1 record walks up to v2 units - plates kept, emptyClip filled, ids unchanged", () => {
  // Retargeted at L74: the v1 browser read seam this case drove (lib/frames/records.ts
  // FRAMES_RECORD over lib/steps/recordRegistry) retired with the v1 step store's last frames
  // reader; the walk itself is what the archive importer runs (lib/import/steps.ts calls
  // framesV1ToV2, then the v2 door), so the walk and the door are what is held here. The
  // read-is-not-a-write half went with the seam: the importer writes the kernel's record, never
  // the v1 one.
  // The importer's own path: framesV1ToV2 -> the plate bytes as a blob ref -> @gt/domain's FRAMES door.
  const sink: Sink = new Map();
  const staged = stageStep({ phase: "frames", data: v1Record() }, new Set(STEP_KINDS), sink);
  if (staged.loss !== undefined) throw new Error(`refused: ${staged.loss.reason}`);
  const record = staged.held?.record as { units: Array<{ id: string; holdS: number; plate: { blob?: unknown; src?: unknown; costUsd?: number }; clip: unknown }> } | undefined;
  if (record === undefined) throw new Error("not held");
  const { units } = record;
  expect(units).toHaveLength(RENDERS[0].beats.length);
  expect(units[0].plate.blob, "the paid plate survives the migration, as a blob ref").toBeDefined();
  expect(units[0].plate.src).toBeUndefined();
  expect(units[0].plate.costUsd).toBe(0.04);
  expect([...sink.values()].map((b) => Buffer.from(b.bytes).toString()), "the plate's bytes are staged").toEqual(["PAID"]);
  expect(units.every((u) => JSON.stringify(u.clip) === JSON.stringify(emptyClip())), "every unit has a clip").toBe(true);
  // Identity is NOT rewritten by a migration: kept alternatives, Score spots and
  // board items all point at these ids, and a v1 record is only ever reused for
  // the render it was derived from.
  expect(units.map((u) => u.id)).toEqual(RENDERS[0].beats.map((_, i) => `fr-${i}`));
  expect(units[3].holdS).toBe(durationOf(framesFromRender(RENDERS[0]), 3, RENDERS[0].durationS));
});

/* ── stage 2 · 4 · the explainer does not move ───────────────────────────────────────── */

test("stage 2 case 4: on every shipped render, pictureFromUnits gives pictureFromFrames' scenes, starts and holds", async () => {
  const { pictureFromUnits } = await import("@/lib/score/picture");
  const { unitsFromRender } = await import("@/lib/frames/picture/unit");
  for (const r of RENDERS) {
    const units = unitsFromRender(explainerRender(r), r);
    const frames = framesFromRender(r).map((f, i) => ({ ...f, id: units[i].id }));
    // Three closing lengths: the render's own, a different project target, and
    // an unread project record (0) — Score's clock closes against the project.
    for (const targetS of [r.durationS, r.durationS + 7, 0]) {
      const want = pictureFromFrames(frames, targetS);
      const got = pictureFromUnits(units, targetS);
      expect(got.scenes, `${r.id} @ ${targetS}`).toEqual(want.scenes);
      expect(got.totalS).toBe(want.totalS);
      expect(got.unplaced.map((u) => u.id)).toEqual(want.unplaced.map((f) => f.id));
    }
  }
});
