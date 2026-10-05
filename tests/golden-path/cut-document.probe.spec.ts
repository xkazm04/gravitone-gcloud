// LANE — THE CUT COMPILES TO A DOCUMENT (dynamic). Card frames-score-cut-B.
//
// The derived cut (deriveTimeline) is what the Cut step DRAWS. `compileCut`
// turns it into what a render READS: a deterministic JSON edit decision list —
// picture segments holding a layer snapshot or a gap with its reason, audio
// segments naming a sound-store take at its dialled offset or a gap, and the
// finish line's verdicts travelling inside the document, so the gate record
// outlives the media (media-generation/video-assembly#gap-and-refusal-honesty,
// review-iteration-loops#gate-record-outlives-the-media).
//
// Held here on synthetic step data, no browser, no ffmpeg: the render itself
// is a live-lane case (an exported MP4's ffprobe duration), never this lane's.
import { test, expect } from "@playwright/test";

import { compileCut, cutDocumentHash, cutDocumentJson } from "@/app/_phases/cut/cutDocument";
import { deriveTimeline } from "@/app/_phases/cut/deriveTimeline";
import { finishLine } from "@/app/_phases/cut/finishLine";
import { emptyClip, type Frame } from "@/app/_phases/frames/frames";
import type { ScoreSpot } from "@/app/_phases/score/spots";

/* ── synthetic step data ─────────────────────────────────────────────────── */

const frame = (id: string, at: string, atS: number, over: Partial<Frame> = {}): Frame => ({
  id,
  at,
  atS,
  kind: "movement",
  title: `shot ${id}`,
  line: `the line over ${id}`,
  plate: { state: "ready", src: `/clips/presets/${id}.jpg` },
  clip: emptyClip(),
  elements: [{ id: `${id}-e1`, kind: "arrow", label: "up", x: 10, y: 20, w: 30, h: 10 }],
  texts: [{ id: `${id}-t1`, role: "figure", value: "$69,000", x: 50, y: 40 }],
  ...over,
});

/** Three scenes over a 20s target: 0-6, 6-14, 14-20. The middle plate refused. */
const FRAMES: Frame[] = [
  frame("f1", "0:00", 0),
  frame("f2", "0:06", 6, { plate: { state: "refused" } }),
  frame("f3", "0:14", 14),
];
const PROJECT = { title: "Synthetic", logline: "a cut nobody typed", targetS: 20 };

/** Spot `a` holds a take the store answers for; spot `b` points at nothing. */
const SPOTS: ScoreSpot[] = [
  { id: "a", title: "open", sceneIds: ["f1", "f2"], note: "hold", takeIds: ["st_x"], activeTakeId: "st_x" },
  { id: "b", title: "close", sceneIds: ["f3"], note: "" },
];

const derive = () =>
  deriveTimeline({ projectId: "p-doc", project: PROJECT, frames: FRAMES, spots: SPOTS, storeTakeIds: new Set(["st_x"]) });
const POINTERS = { a: "st_x" };

/* ── case 1: offsets land on the audio, the picture sums to the cut ──────── */

test("case 1 · a dialled offset moves its audio segment; the picture sums to cut.totalS", () => {
  const cut = derive();
  const doc = compileCut(cut, { "mus-a": 250 }, POINTERS);

  expect(doc.v).toBe(1);
  expect(doc.picture.map((p) => p.unitRef)).toEqual(["f1", "f2", "f3"]);
  const sum = doc.picture.reduce((s, p) => s + p.durS, 0);
  expect(sum).toBeCloseTo(cut.totalS, 6);
  expect(cut.totalS).toBe(20);

  const mus = cut.clips.find((c) => c.id === "mus-a")!;
  const seg = doc.audio.find((a) => a.clipId === "mus-a")!;
  expect(seg.startS).toBeCloseTo(mus.startS + 0.25, 6);
  expect(seg.offsetMs).toBe(250);
  expect(seg).toMatchObject({ kind: "take", takeId: "st_x", lane: "music" });

  // An undialled cue sits on its mark.
  const b = doc.audio.find((a) => a.clipId === "mus-b")!;
  expect(b.startS).toBe(cut.clips.find((c) => c.id === "mus-b")!.startS);

  // The finish line travels with the document, computed against the same offsets.
  expect(doc.finish).toEqual(finishLine(cut, { "mus-a": 250 }));
});

/* ── case 2: a missing plate is a gap with the clip's reason, no src ─────── */

test("case 2 · a missing plate is a gap carrying the clip's why, with no picture in it", () => {
  const cut = derive();
  const doc = compileCut(cut, {}, POINTERS);

  const gap = doc.picture.find((p) => p.unitRef === "f2")!;
  const clip = cut.clips.find((c) => c.id === "pic-f2")!;
  expect(clip.status).toBe("missing");
  expect(gap).toMatchObject({ kind: "gap", why: clip.why });
  expect(clip.why).toBe("plate refused");
  expect("layers" in gap).toBe(false);
  expect(JSON.stringify(gap)).not.toContain("/clips/presets/");

  // A held plate is a still with the layers it composites, hidden ones out.
  const still = doc.picture.find((p) => p.unitRef === "f1")!;
  expect(still.kind).toBe("still");
  if (still.kind !== "still") throw new Error("unreachable");
  expect(still.layers.plate).toBe("/clips/presets/f1.jpg");
  expect(still.layers.elements.map((e) => e.id)).toEqual(["f1-e1"]);
  expect(still.layers.texts.map((t) => t.value)).toEqual(["$69,000"]);

  // A cue with no take is a gap with its own reason; a spoken line nobody
  // recorded is a gap on the voice lane — never silence passed off as sound.
  expect(doc.audio.find((a) => a.clipId === "mus-b")).toMatchObject({ kind: "gap", why: "no take in hand" });
  expect(doc.audio.filter((a) => a.lane === "voice").every((a) => a.kind === "gap" && a.why === "written, not recorded")).toBe(true);
  expect(doc.audio.some((a) => a.lane === "voice")).toBe(true);
});

test("case 2b · a take playing from this session's drop is a gap: the server cannot read a blob", () => {
  const cut = deriveTimeline({
    projectId: "p-doc",
    project: PROJECT,
    frames: FRAMES,
    spots: SPOTS,
    storeTakeIds: new Set(["st_x"]),
    takes: { a: "blob:http://localhost/drop" },
  });
  const seg = compileCut(cut, {}, POINTERS).audio.find((a) => a.clipId === "mus-a")!;
  expect(seg.kind).toBe("gap");
  expect(JSON.stringify(seg)).not.toContain("blob:");
});

/* ── case 3: deterministic, stable key order, equal hash ─────────────────── */

test("case 3 · same inputs twice give identical JSON and an equal hash, whatever order keys arrived in", () => {
  const a = compileCut(derive(), { "mus-a": 250, "mus-b": -40 }, { a: "st_x", zz: "st_unused" });
  const b = compileCut(derive(), { "mus-b": -40, "mus-a": 250 }, { zz: "st_unused", a: "st_x" });
  expect(cutDocumentJson(a)).toBe(cutDocumentJson(b));
  expect(cutDocumentHash(a)).toBe(cutDocumentHash(b));
  expect(cutDocumentHash(a)).toMatch(/^[0-9a-f]{16}$/);

  // Stable key order: the canonical form is sorted at every depth, so a
  // snapshot built with its keys in another order serialises the same.
  const reordered = JSON.parse(cutDocumentJson(a), (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).reverse()) : v,
  );
  expect(cutDocumentJson(reordered)).toBe(cutDocumentJson(a));

  // And it is a real identity: one millisecond of offset is a different cut.
  const c = compileCut(derive(), { "mus-a": 251, "mus-b": -40 }, { a: "st_x" });
  expect(cutDocumentHash(c)).not.toBe(cutDocumentHash(a));
});
