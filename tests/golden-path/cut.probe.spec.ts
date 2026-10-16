// LANE — THE CUT IS DERIVED, ITS FINISH LINE COUNTS (dynamic).
//
// The Cut step drew the Glass Harbor fixture under every project until the
// sequencer round (2026-10-05). Pure seams replaced it and the two that outlived
// the v1 studio are held here on synthetic step data, with no browser:
//
//   deriveTimeline  frames + spots → lanes; honest `missing`; the fixture for
//                   seed-glass-harbor ONLY, and only while it has no frames.
//   finishLine      value / target / verdict rows, with `unmeasured` kept
//                   apart from `pass`.
//
// v1's transport (the clock, J/K/L, a take's <audio> held on the playhead, the
// waveform peaks) retired with the Cut step in Phase 4 wave D: the cut editor
// draws one ruler and plays nothing.
import { test, expect } from "@playwright/test";

import { FIXTURE_PROJECT_ID, deriveTimeline, sceneIndexAt, turnOf } from "@/lib/cut/deriveTimeline";
import { coveredS, finishLine } from "@/lib/cut/finishLine";
import { nudgeOffsets } from "@/lib/cut/offsets";
import { emptyClip, type Frame } from "@/lib/frames/frames";
import type { ScoreSpot } from "@/lib/score/spots";
import { TIMELINE } from "@/lib/studio/score";

/* ── synthetic step data ─────────────────────────────────────────────────── */

const frame = (id: string, at: string, atS: number | null, over: Partial<Frame> = {}): Frame => ({
  id,
  at,
  atS,
  kind: "movement",
  title: `shot ${id}`,
  line: `the line over ${id}`,
  plate: { state: "empty" },
  clip: emptyClip(),
  elements: [],
  texts: [],
  ...over,
});

/** Three placed beats over a 20s target, one unplaceable; one plate ready. */
const FRAMES: Frame[] = [
  frame("f1", "0:00", 0, { kind: "hook", plate: { state: "ready", src: "/clips/presets/blueprint.jpg" } }),
  frame("f2", "0:06", 6, { kind: "turn", line: "" }),
  frame("fx", "tbd", null),
  frame("f3", "0:14", 14, { plate: { state: "refused" } }),
];
const PROJECT = { title: "Synthetic", logline: "a cut nobody typed", targetS: 20 };

const SPOTS: ScoreSpot[] = [
  { id: "spot-a", title: "open", sceneIds: ["f1", "f2"], note: "hold" },
  { id: "spot-gone", title: "ghost", sceneIds: ["nope"], note: "" },
];

/* ── deriveTimeline ──────────────────────────────────────────────────────── */

test("a project's cut is derived from ITS frames, not the fixture", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: SPOTS });
  expect(cut.origin).toBe("project");
  // 6 + 8 + 6 (the last beat closes on the 20s target) — the holds, summed.
  expect(cut.scenes.map((s) => [s.id, s.startS, s.durS])).toEqual([
    ["f1", 0, 6],
    ["f2", 6, 8],
    ["f3", 14, 6],
  ]);
  expect(cut.totalS).toBe(20);
  // No fixture clip id leaks in.
  expect(cut.clips.some((c) => TIMELINE.some((t) => t.id === c.id))).toBe(false);
});

test("picture: a ready plate is placed with its src; anything else is missing with its reason", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: null });
  const pic = cut.clips.filter((c) => c.track === "video");
  expect(pic.map((c) => [c.ref, c.status, c.src ?? c.why])).toEqual([
    ["f1", "ok", "/clips/presets/blueprint.jpg"],
    ["f2", "missing", "no plate"],
    ["f3", "missing", "plate refused"],
  ]);
});

test("voice: every spoken line is a MISSING block — written, never recorded", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: null });
  const vo = cut.clips.filter((c) => c.track === "vo");
  // f2 says nothing, so it has no voice block at all — absence, not a gap.
  expect(vo.map((c) => c.ref)).toEqual(["f1", "f3"]);
  expect(vo.every((c) => c.status === "missing")).toBe(true);
});

test("music: spots become cues over the scenes they cover; no take means missing, a session take means placed", () => {
  const bare = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: SPOTS });
  const mus = bare.clips.filter((c) => c.track === "music");
  expect(mus.map((c) => [c.ref, c.startS, c.durS, c.status])).toEqual([["spot-a", 0, 14, "missing"]]);
  // The spot naming a scene this project lacks is not given a span.
  expect(bare.unplaced.map((u) => u.label)).toEqual(["shot fx", "ghost"]);

  const held = deriveTimeline({
    projectId: "p-real",
    project: PROJECT,
    frames: FRAMES,
    spots: SPOTS,
    takes: { "spot-a": "blob:take-a" },
  });
  const m = held.clips.find((c) => c.track === "music")!;
  expect([m.status, m.src]).toEqual(["ok", "blob:take-a"]);
});

test("no spotting saved means an empty music lane, not a proposed one", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: null });
  expect(cut.clips.filter((c) => c.track === "music")).toEqual([]);
});

test("the fixture is Glass Harbor's alone, and only while it has no frames", () => {
  const stranger = deriveTimeline({ projectId: "seed-why-bitcoin", project: PROJECT, frames: null, spots: null });
  expect(stranger.origin).toBe("empty");
  expect(stranger.clips).toEqual([]);

  const seeded = deriveTimeline({ projectId: FIXTURE_PROJECT_ID, project: { ...PROJECT, targetS: 31 }, frames: null, spots: null });
  expect(seeded.origin).toBe("fixture");
  expect(seeded.clips.map((c) => c.id)).toEqual(TIMELINE.map((c) => c.id));
  expect(seeded.totalS).toBe(31);

  const grown = deriveTimeline({ projectId: FIXTURE_PROJECT_ID, project: PROJECT, frames: FRAMES, spots: null });
  expect(grown.origin).toBe("project");
});

test("the scene under the playhead, and the turn", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: null });
  expect([0, 5.99, 6, 13.99, 14, 20, 20.01, -1].map((t) => sceneIndexAt(cut.scenes, t))).toEqual([
    0, 0, 1, 1, 2, 2, -1, -1,
  ]);
  // The turn is read off the beat's role.
  expect(turnOf(cut.scenes)).toEqual({ atS: 6, label: "shot f2" });
});

/* ── the finish line ─────────────────────────────────────────────────────── */

test("coverage is a union — two cues over the same seconds are not counted twice", () => {
  expect(coveredS([{ startS: 0, durS: 10 }, { startS: 5, durS: 10 }, { startS: 30, durS: 5 }], 32)).toBe(17);
  expect(coveredS([], 10)).toBe(0);
});

test("finish line on a derived cut: rows, values, verdicts", () => {
  const cut = deriveTimeline({ projectId: "p-real", project: PROJECT, frames: FRAMES, spots: SPOTS });
  const rows = Object.fromEntries(finishLine(cut).map((r) => [r.id, r]));
  expect([rows.picture.value, rows.picture.verdict]).toEqual(["1/3", "fail"]);
  expect([rows.voice.value, rows.voice.verdict]).toEqual(["0/2", "fail"]);
  expect([rows.coverage.value, rows.coverage.target, rows.coverage.verdict]).toEqual(["14s", "20s", "fail"]);
  expect([rows.takes.value, rows.takes.verdict]).toEqual(["0/1", "fail"]);
  expect([rows.drift.value, rows.drift.verdict]).toEqual(["0", "pass"]);
  expect(rows.runtime.verdict).toBe("pass"); // 20s against 20s
  expect([rows.unplaced.value, rows.unplaced.verdict]).toEqual(["2", "fail"]);
});

test("nothing to measure is UNMEASURED, never a pass", () => {
  const cut = deriveTimeline({ projectId: "p-empty", project: null, frames: null, spots: null });
  const rows = finishLine(cut);
  expect(rows.every((r) => r.verdict === "unmeasured")).toBe(true);
});

test("runtime against target, and a drift the bench snapped back is no longer drift", () => {
  const long = deriveTimeline({ projectId: "p-real", project: { ...PROJECT, targetS: 12 }, frames: FRAMES, spots: null });
  const rt = finishLine(long).find((r) => r.id === "runtime")!;
  // 6 + 8 + max(1, 12-14) = 15s against 12s ± 1s.
  expect([rt.value, rt.verdict]).toEqual(["15s", "fail"]);

  const fx = deriveTimeline({ projectId: FIXTURE_PROJECT_ID, project: { ...PROJECT, targetS: 31 }, frames: null, spots: null });
  const drifting = fx.clips.find((c) => c.status === "drift")!;
  expect(finishLine(fx).find((r) => r.id === "drift")!.value).toBe("1");
  const snapped = nudgeOffsets({}, drifting, -(drifting.offsetMs ?? 0));
  expect(finishLine(fx, snapped).find((r) => r.id === "drift")!.verdict).toBe("pass");
});

