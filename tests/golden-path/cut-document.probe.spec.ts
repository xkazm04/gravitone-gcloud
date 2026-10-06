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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { POST as cutExportPOST } from "@/app/api/cut/export/route";
import { compileCut, cutDocumentHash, cutDocumentJson } from "@/app/_phases/cut/cutDocument";
import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";
import { cutExportArgs, cutSidecar, runCutExport, CUT_FPS } from "@/lib/cutExport";
import { describePosture } from "@/lib/deployment";
import { ExportError, landExport, partialPath } from "@/lib/export/headless";
import { listExports } from "@/lib/publish/exports";
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

/* ── the export: posture, sidecar, the ffmpeg plan (no ffmpeg runs here) ─── */

keepEnv([ACCESS_SECRET_VAR, "NEXT_PUBLIC_DEV_AUTH", "LOCAL_BINARIES", "PUBLISH_EXPORTS_DIR"]);

const SECRET = "cut-export-probe-secret";
let shelf = "";

test.beforeEach(() => {
  shelf = mkdtempSync(join(tmpdir(), "cut-export-probe-"));
  // A shelf directory that does not exist yet: "no file lands" then also
  // means the export never so much as created its directory.
  process.env.PUBLISH_EXPORTS_DIR = join(shelf, "exports");
  process.env[ACCESS_SECRET_VAR] = SECRET;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
});
test.afterEach(() => {
  rmSync(shelf, { recursive: true, force: true });
});

const post = (body: unknown, ip: string) =>
  cutExportPOST(
    new Request("http://localhost/api/cut/export", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}`, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );

// 503, not the 403 this route answered until 2026-10-06: the three exports
// behind `localRender` refuse with one status and one code (the route's header).
test("case 4 · a posture that forbids local binaries refuses with 503 naming it, and no file lands", async () => {
  process.env.LOCAL_BINARIES = "off";
  const document = compileCut(derive(), { "mus-a": 250 }, POINTERS);

  const res = await post({ document, projectId: "p-doc" }, "10.9.0.1");
  expect(res.status).toBe(503);
  const body = (await res.json()) as { detail: string; code: string };
  expect(body.code).toBe("local-binaries-forbidden");
  expect(body.detail).toContain(describePosture("policy-forbidden"));
  expect(existsSync(process.env.PUBLISH_EXPORTS_DIR!)).toBe(false);

  // The module refuses on its own too, before it touches the disk: the route's
  // gate is defence in depth, not the only door.
  await expect(runCutExport({ document, projectId: "p-doc" })).rejects.toMatchObject({
    code: "local-binaries-forbidden",
  });
  expect(existsSync(process.env.PUBLISH_EXPORTS_DIR!)).toBe(false);
});

test("the route refuses a body that is not a compiled cut, before anything spawns", async () => {
  process.env.LOCAL_BINARIES = "on";
  const empty = { ...compileCut(derive(), {}, POINTERS), totalS: 0, picture: [] };
  const bodies: unknown[] = [{}, { document: { v: 2 } }, { document: empty }];
  for (const [i, body] of bodies.entries()) {
    const res = await post(body, `10.9.1.${i}`);
    expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
  }
  expect(existsSync(process.env.PUBLISH_EXPORTS_DIR!)).toBe(false);
});

test("case 6 · the sidecar carries the projectId and the finish-line verdicts, and the shelf reads it", async () => {
  const document = compileCut(derive(), { "mus-a": 250 }, POINTERS);
  const sidecar = cutSidecar(document, "p-doc");
  expect(sidecar.projectId).toBe("p-doc");
  expect(sidecar.finish).toEqual(document.finish);
  expect(sidecar.finish.map((f) => f.verdict)).toContain("fail");
  expect(sidecar.document).toBe(cutDocumentHash(document));
  expect(sidecar.gaps).toEqual({
    picture: document.picture.filter((p) => p.kind === "gap").length,
    audio: document.audio.filter((a) => a.kind === "gap").length,
  });

  // Landed through the kernel's own landing, the publish shelf names the
  // project — the same reader the calendar uses.
  const root = process.env.PUBLISH_EXPORTS_DIR!;
  mkdirSync(root, { recursive: true });
  const id = "0f0f0f0f-0000-4000-8000-000000000001";
  writeFileSync(partialPath(root, id), "not really an mp4");
  await landExport({ root, id, finalPath: join(root, `${id}.mp4`), sidecar });
  expect(readdirSync(root).sort()).toEqual([`${id}.json`, `${id}.mp4`]);
  expect((await listExports()).map((e) => [e.id, e.projectId])).toEqual([[id, "p-doc"]]);
});

test("the ffmpeg plan: one input per picture segment for its hold, a gap is black, a take plays at its offset", () => {
  const document = compileCut(derive(), { "mus-a": 250 }, POINTERS);
  const args = cutExportArgs(
    document,
    { stills: { f1: "/w/f1.jpg", f3: "/w/f3.jpg" }, takes: { st_x: "/s/st_x.mp3" } },
    "/out/x.partial.mp4",
    "libx264",
  );
  const inputs: string[][] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === "-i") inputs.push(args.slice(Math.max(0, i - 6), i + 2));
  const black = `color=c=black:s=1920x1080:r=${CUT_FPS}`;

  // Picture first, in order, each held for its own duration.
  expect(inputs[0].slice(-4)).toEqual(["-t", "6", "-i", "/w/f1.jpg"]);
  expect(inputs[1].slice(-4)).toEqual(["-t", "8", "-i", black]);
  expect(inputs[2].slice(-4)).toEqual(["-t", "6", "-i", "/w/f3.jpg"]);
  // Then the one take the store answers for; the voice gaps add no input.
  expect(inputs[3].slice(-2)).toEqual(["-i", "/s/st_x.mp3"]);
  expect(inputs).toHaveLength(4);

  const graph = args[args.indexOf("-filter_complex") + 1];
  expect(graph).toContain("concat=n=3:v=1:a=0");
  expect(graph).toContain("adelay=250:all=1");
  // The output is held to the ruler, not to whichever stream runs longest.
  expect(args.slice(args.lastIndexOf("-t"), args.lastIndexOf("-t") + 2)).toEqual(["-t", "20"]);
  expect(args[args.length - 1]).toBe("/out/x.partial.mp4");

  // A plate the server could not resolve renders black, and with no take in
  // hand the soundtrack is silence for the whole cut, never a shorter file.
  const bare = cutExportArgs(document, { stills: {}, takes: {} }, "/out/y.partial.mp4", "libx264");
  expect(bare.filter((a) => a === black)).toHaveLength(3);
  expect(bare).toContain("anullsrc=r=48000:cl=stereo");
  expect(bare.join(" ")).not.toContain("adelay");
});

test("ExportError stays one class across the music-video export and the kernel", async () => {
  const mv = await import("@/lib/musicVideoExport");
  expect(mv.ExportError).toBe(ExportError);
});
