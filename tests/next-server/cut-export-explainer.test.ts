// AN EXPLAINER EXPORTS AS A NARRATED MP4 (spark audio-postproduction-research WP5). An explainer
// (recipe `article · strips · voice · cut`) has no frames record, so the cut producer planned from
// frames refused it "no picture to cut" before ffmpeg ran (WP4's measured finding). Now a project
// whose plan HAS a strips part cuts from `explainerCut` over its strips and VOICE records - the
// call the cut gate's verdict makes - each card's rendered image is a still read from the kernel
// blob store by digest, and each active take is WP4's voice segment at its line's offset.
// Measured, not looked at:
//
//   1. the export-animatic job is not refused, dry or live; the live job (ffmpeg on this box, $0,
//      no vendor) lands an mp4 whose duration is the cut's total, whose frame at each card's
//      midpoint carries THAT card's luma (mean luma > 16 - lib/producers/media-facts.ts `luma`),
//      and whose narration starts and stops at the lines' offsets (silencedetect / volumedetect,
//      the measurement tests/next-server/cut-export-narration.test.ts made for WP4);
//   2. a card with no image is a named picture gap (black on the file), a card whose blob is gone
//      an unreachable row, and a line with no active take is silence there - no crash;
//   3. an explainer with no strip cards still refuses "no picture to cut".
//
// Every image and line is generated here with ffmpeg lavfi into a temp kernel store's blob root.
// No ffmpeg on PATH: the measured cases skip locally and fail under CI.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cut-explainer-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "k.sqlite");
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["LOCAL_BINARIES"] = "on";
  process.env["GRAVITONE_DRY_ONLY"] = "1";
  return dir;
});

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import { ok, type Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { readPart, writePart } from "@gt/kernel/parts/driver";
import { compose } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import { compileCut } from "../../lib/cut/cutDocument.ts";
import type { DerivedCut } from "../../lib/cut/deriveTimeline.ts";
import { explainerCut } from "../../lib/cut/explainer.ts";
import { cutProducer, cutUnits } from "../../lib/producers/cut.ts";
import { blobRootOf, driveStep, launchPartAct, partActReceipt } from "../../lib/producers/research.ts";

const OP = { kind: "operator", id: "op" } as const;
const NOW = Date.parse("2026-10-24T09:00:00Z");

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg");
if (!HAVE_FFMPEG && process.env["CI"]) throw new Error("CI is set and ffmpeg is not on PATH: the explainer export may not skip here");

let kernel: Kernel | undefined;
afterAll(() => {
  kernel?.close();
  rmSync(ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
function store(): Store {
  if (kernel === undefined) {
    const k = openKernel(path.join(ROOT, "k.sqlite"));
    if (!k.ok) throw k.error;
    kernel = k.value;
  }
  return kernel.store;
}
function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const blobs = () => blobStore(blobRootOf(store()));
async function put(bytes: Uint8Array, mime: string): Promise<BlobRef> {
  return must(await blobs().put(bytes, mime));
}

/* ── measurement (WP4's, cut-export-narration.test.ts, over this file's clock) ── */

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const stderrOf = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" }).stderr;
const silences = (file: string, key: "silence_start" | "silence_end") =>
  [...stderrOf(["-i", file, "-vn", "-af", "silencedetect=noise=-45dB:d=0.3", "-f", "null", "-"]).matchAll(new RegExp(`${key}:\\s*(-?[\\d.]+)`, "g"))].map((m) => Number(m[1]));
/** Mean (RMS) level in dB over [fromS, fromS + durS]. */
function meanDb(file: string, fromS: number, durS: number): number {
  const m = /mean_volume:\s*(-?inf|-?[\d.]+) dB/.exec(stderrOf(["-ss", String(fromS), "-t", String(durS), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"]));
  if (!m) throw new Error("volumedetect said nothing");
  return m[1]!.endsWith("inf") ? -Infinity : Number(m[1]);
}
/** The frame at `atS`, averaged to one grey pixel (media-facts.ts `luma`: area scaling is the mean). */
const lumaAt = (file: string, atS: number): number =>
  execFileSync("ffmpeg", ["-v", "error", "-ss", String(atS), "-i", file, "-vf", "scale=1:1:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "pipe:1"])[0] ?? -1;
const durationOf = (file: string): number =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" }).trim());

/* ── the explainer, real-shaped ─────────────────────────────────────────── */

// Three cards: c1 spoken (a 2.0 s take), c2 written but not recorded (five words at 2.5 words a
// second = 2.0 s, silent), c3 spoken (a 1.5 s take). The clock is 2 + 2 + 1.5 = 5.5 s; the lines
// sit at 0.0 and 4.0. Each card is a flat grey of its own level, so a frame names its card.
const CAPTION = "five words in this caption";
const GREY = { c1: 200, c2: 120, c3: 60 } as const;
const MID = { c1: 1.0, c2: 3.0, c3: 4.75 } as const;
const TOTAL = 5.5;

const IMG: Partial<Record<keyof typeof GREY, BlobRef>> = {};
let lineA: BlobRef;
let lineB: BlobRef;
let standIn: BlobRef;

/** The part's own record, landed through the step door (which refuses a malformed one). */
function land(projectId: string, part: "strips" | "voice", record: Record<string, unknown>): void {
  must(writePart(store(), { projectId, partId: `${projectId}/${part}`, baseRev: "current", act: "land", op: { seed: part }, label: "seed", by: { kind: "machine", id: "seed" }, next: () => ok({ [part]: record }) }));
}
const card = (id: keyof typeof GREY, over: Record<string, unknown> = {}) => ({ id, section: "s1", title: id, caption: CAPTION, state: "drawn", ...(IMG[id] === undefined ? {} : { blob: IMG[id] }), ...over });
const take = (id: string, seconds: number, blob: BlobRef) => ({ id, label: "take 1", at: NOW, seconds, mark: null, blob, engine: { provider: "elevenlabs", model: "eleven_v3", mode: "live" }, sections: [] });
/** VOICE with an active take on c1 and c3; c2's line has none. */
const voice = () => ({
  text: {},
  takes: { "t-c1": take("t-c1", 2, lineA), "t-c3": take("t-c3", 1.5, lineB) },
  byLine: { "line-c1": { takeIds: ["t-c1"], active: "t-c1" }, "line-c3": { takeIds: ["t-c3"], active: "t-c3" } },
});

const ref = (projectId: string) => ({ projectId, partId: `${projectId}/cut`, act: "export-animatic" });
async function exportAnimatic(projectId: string, live: boolean) {
  const mode = live ? "live" : "dry";
  const r = must(partActReceipt(store(), ref(projectId), cutUnits, { mode, now: NOW }));
  const l = must(launchPartAct(store(), ref(projectId), cutUnits, { mode, now: NOW, token: r.token, actor: OP, dryOnly: false }));
  if (l.kind !== "launched") throw new Error("stale");
  // No engines handed in: the LIVE one, lib/cutExport.ts runCutExport, the route's own render.
  return must(await driveStep((lane, h) => cutProducer(lane, h), store(), l.jobId, { dryOnly: !live }));
}
type Landed = { blob: BlobRef; document: string; totalS: number; mode: string; exportId: string; unreachable: { unitRef?: string; clipId?: string; why: string }[] };
const exportsOf = (projectId: string): Landed[] => (must(readPart(store(), { projectId, partId: `${projectId}/cut` })).records.get("cut")?.["exports"] ?? []) as Landed[];
async function mp4Of(e: Landed, name: string): Promise<string> {
  const file = path.join(ROOT, `${name}.mp4`);
  writeFileSync(file, must(await blobs().read(e.blob)));
  return file;
}

beforeAll(async () => {
  if (!HAVE_FFMPEG) return;
  for (const [id, g] of Object.entries(GREY)) {
    const png = path.join(ROOT, `${id}.png`);
    const hex = g.toString(16).padStart(2, "0");
    ff(["-f", "lavfi", "-i", `color=c=0x${hex}${hex}${hex}:s=640x360`, "-frames:v", "1", png]);
    IMG[id as keyof typeof GREY] = await put(readFileSync(png), "image/png");
  }
  // Speech-shaped: pink noise opened and closed at a syllable rate (WP4's `line-speech`).
  const speech = async (name: string, d: number) => {
    const wav = path.join(ROOT, `${name}.wav`);
    ff(["-f", "lavfi", "-i", `anoisesrc=c=pink:a=0.25:d=${d}:s=44100:seed=7,volume='max(0\\,sin(2*PI*4*t))':eval=frame`, "-ac", "1", wav]);
    return put(readFileSync(wav), "audio/wav");
  };
  lineA = await speech("line-a", 2);
  lineB = await speech("line-b", 1.5);
  // A dry stand-in's take: a silent WAV (what the Voice part lands with no vendor called).
  const silent = path.join(ROOT, "stand-in.wav");
  ff(["-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono:d=2", silent]);
  standIn = await put(readFileSync(silent), "audio/wav");
});

/* ── the document, pure ─────────────────────────────────────────────────── */

describe("an explainer's cut compiles its cards as stills", () => {
  const cut = (cards: object[]): DerivedCut => explainerCut({ cards: cards as never, voice: { text: {}, takes: {}, byLine: {} }, targetS: null });
  const sha = "e".repeat(64);
  it("a drawn card with an image is a still naming its blob, with nothing composited over it", () => {
    const doc = compileCut(cut([{ id: "c1", section: "s", title: "c1", caption: CAPTION, state: "drawn", blob: { sha256: sha } }]), {}, {});
    expect(doc.picture).toEqual([{ unitRef: "c1", label: "c1", startS: 0, durS: 2, kind: "still", layers: { plate: `sha256:${sha}`, elements: [], texts: [] } }]);
  });
  it("a card without an image is a gap in the card's terms; one not drawn keeps its own reason", () => {
    const doc = compileCut(cut([{ id: "c1", section: "s", title: "c1", caption: CAPTION, state: "drawn" }, { id: "c2", section: "s", title: "c2", caption: CAPTION, state: "refused", why: "the asset step refused" }]), {}, {});
    expect(doc.picture.map((p) => [p.unitRef, p.kind, p.kind === "gap" ? p.why : ""])).toEqual([
      ["c1", "gap", "card has no rendered image"],
      ["c2", "gap", "the asset step refused"],
    ]);
  });
  it("a frameless clip with a src that is not a content address stays a gap (the fixture's shape)", () => {
    const c = cut([{ id: "c1", section: "s", title: "c1", caption: CAPTION, state: "drawn" }]);
    const doc = compileCut({ ...c, clips: c.clips.map((x) => (x.track === "video" ? { ...x, src: "/clips/presets/c1.jpg" } : x)) }, {}, {});
    expect(doc.picture[0]).toMatchObject({ kind: "gap", why: "card has no rendered image" });
    expect(compileCut({ ...c, origin: "fixture" }, {}, {}).picture[0]).toMatchObject({ kind: "gap", why: "no frame behind this scene" });
  });
});

/* ── the job ────────────────────────────────────────────────────────────── */

describe("an explainer's export-animatic job", () => {
  it("an explainer with no strip cards is refused on its receipt: no picture to cut", () => {
    must(compose(store(), { recipe: "explainer" }, OP, { id: "e0" }));
    const r = partActReceipt(store(), ref("e0"), cutUnits, { mode: "dry", now: NOW });
    expect(r.ok ? "" : r.error.message).toBe("no picture to cut");
    land("e0", "strips", { cards: [] });
    const again = partActReceipt(store(), ref("e0"), cutUnits, { mode: "dry", now: NOW });
    expect(again.ok ? "" : again.error.message).toBe("no picture to cut");
  });

  it("dry, an explainer with cards is planned from its cards and takes: one scene per card, the takes' clock, ffmpeg declared not spawned", async () => {
    must(compose(store(), { recipe: "explainer" }, OP, { id: "e3" }));
    // Opaque PNG-typed bytes: a dry job reads no card, it only plans and declares the render.
    const png = await put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 3, 1, 4]), "image/png");
    const wav = await put(new Uint8Array([0x52, 0x49, 0x46, 0x46, 2, 7]), "audio/wav");
    land("e3", "strips", { cards: (["c1", "c2", "c3"] as const).map((id) => card(id, { blob: png })) });
    land("e3", "voice", { text: {}, takes: { "t-c1": take("t-c1", 2, wav), "t-c3": take("t-c3", 1.5, wav) }, byLine: { "line-c1": { takeIds: ["t-c1"], active: "t-c1" }, "line-c3": { takeIds: ["t-c3"], active: "t-c3" } } });
    const r = await exportAnimatic("e3", false);
    expect(r.outcome).toBe("done");
    expect(r.wouldCalls?.map((w) => `${w.provider}/${w.model}`)).toEqual(["ffmpeg/cut-export"]);
    expect(exportsOf("e3")).toMatchObject([{ mode: "dry", totalS: TOTAL, blob: { mime: "video/mp4" } }]);
  });
});

describe.skipIf(!HAVE_FFMPEG)("an explainer exports, measured", { timeout: 180_000 }, () => {
  it("1: dry is not refused; live lands an mp4 of the cut's length, each card at its span, each line at its offset", async () => {
    must(compose(store(), { recipe: "explainer", title: "Why bitcoin" }, OP, { id: "e1" }));
    land("e1", "strips", { cards: [card("c1"), card("c2"), card("c3")] });
    land("e1", "voice", voice());

    const dry = await exportAnimatic("e1", false);
    expect(dry.outcome).toBe("done");
    expect(dry.wouldCalls?.map((w) => `${w.provider}/${w.model}`)).toEqual(["ffmpeg/cut-export"]);
    const live = await exportAnimatic("e1", true);
    expect(live.job?.error?.message).toBeUndefined();
    expect(live.outcome).toBe("done");

    const [d, l] = exportsOf("e1");
    expect([d?.mode, l?.mode]).toEqual(["dry", "live"]);
    // One document either way: the dry would-call names exactly what the live job rendered.
    expect(d?.document).toBe(l?.document);
    expect(l).toMatchObject({ totalS: TOTAL, unreachable: [], blob: { mime: "video/mp4" } });
    const mp4 = await mp4Of(l!, "e1");

    const dur = durationOf(mp4);
    console.log(`[explainer] mp4 ${dur} s for a ${TOTAL} s cut`);
    expect(Math.abs(dur - TOTAL)).toBeLessThanOrEqual(0.05);

    const cards = Object.keys(GREY) as (keyof typeof GREY)[];
    const lumas = Object.fromEntries(cards.map((c) => [c, lumaAt(mp4, MID[c])]));
    const own = Object.fromEntries(cards.map((c) => [c, lumaAt(path.join(ROOT, `${c}.png`), 0)]));
    console.log(`[explainer] luma at card midpoints ${JSON.stringify(lumas)}; the cards' own images ${JSON.stringify(own)}`);
    for (const c of cards) {
      expect(lumas[c]).toBeGreaterThan(16);
      // Within 20 of its own image (the encode's range conversion moves a flat grey ~15), and the
      // greys are >= 60 apart: the frame is this card, not a neighbour.
      expect(Math.abs(lumas[c]! - own[c]!)).toBeLessThanOrEqual(20);
    }

    // The narration: c1's line from 0.0, silence under c2 (no take), c3's line from 4.0. A line's
    // syllables are open on [k/4, k/4 + 1/8] s, so c1's 2 s take last sounds at 1.875 s.
    const starts = silences(mp4, "silence_start");
    const ends = silences(mp4, "silence_end").filter((t) => t < TOTAL - 0.1);
    console.log(`[explainer] silence starts ${JSON.stringify(starts)}, ends ${JSON.stringify(ends)}`);
    expect(starts).toHaveLength(1);
    expect(Math.abs(starts[0]! - 1.875)).toBeLessThanOrEqual(0.05);
    expect(ends).toHaveLength(1);
    expect(Math.abs(ends[0]! - 4)).toBeLessThanOrEqual(0.05);
    expect(meanDb(mp4, 0.2, 1.6)).toBeGreaterThan(-40);
    expect(meanDb(mp4, 2.3, 1.4)).toBeLessThan(-60);
    expect(meanDb(mp4, 4.2, 1.0)).toBeGreaterThan(-40);
  });

  it("2: a card with no image is a named gap, a card whose blob is gone or a stand-in take an unreachable row, a line with no take silence - and the job lands", async () => {
    must(compose(store(), { recipe: "explainer" }, OP, { id: "e2" }));
    const gone = { sha256: "f".repeat(64), bytes: 9, mime: "image/png" };
    land("e2", "strips", { cards: [card("c1", { blob: gone }), card("c2", { blob: undefined }), card("c3")] });
    // c1's line is written, not recorded; c2's take is a dry stand-in (silence); c3's is spoken.
    const dryTake = { ...take("t-c2", 2, standIn), engine: { provider: "elevenlabs", model: "eleven_v3", mode: "dry" } };
    land("e2", "voice", {
      text: {},
      takes: { "t-c2": dryTake, "t-c3": take("t-c3", 1.5, lineB) },
      byLine: { "line-c2": { takeIds: ["t-c2"], active: "t-c2" }, "line-c3": { takeIds: ["t-c3"], active: "t-c3" } },
    });

    const r = await exportAnimatic("e2", true);
    expect(r.job?.error?.message).toBeUndefined();
    expect(r.outcome).toBe("done");
    const [l] = exportsOf("e2");
    expect(l?.unreachable).toEqual([
      { unitRef: "c1", why: expect.stringContaining(`blob: ${gone.sha256} is not in`) },
      { clipId: "vo-c2", sha256: standIn.sha256, why: "take is silence: a stand-in, not narration" },
    ]);
    // The sidecar's gate record: one picture gap (c2; c1 is a still the server could not reach), and
    // the explainer's finish line - no music rows, it plans no score.
    const side = JSON.parse(readFileSync(path.join(ROOT, "exports", `${l!.exportId}.json`), "utf8")) as { gaps: { picture: number }; finish: { id: string }[] };
    expect(side.gaps.picture).toBe(1);
    expect(side.finish.map((x) => x.id).filter((id) => id === "coverage" || id === "takes")).toEqual([]);
    const mp4 = await mp4Of(l!, "e2");
    expect(Math.abs(durationOf(mp4) - TOTAL)).toBeLessThanOrEqual(0.05);
    // Both gaps are black on the file; the drawn card is its own grey.
    expect(lumaAt(mp4, MID.c1)).toBeLessThanOrEqual(16);
    expect(lumaAt(mp4, MID.c2)).toBeLessThanOrEqual(16);
    expect(lumaAt(mp4, MID.c3)).toBeGreaterThan(16);
    expect(meanDb(mp4, 0.2, 3.6)).toBeLessThan(-60);
    expect(meanDb(mp4, 4.2, 1.0)).toBeGreaterThan(-40);
  });

  it("2b: a card whose blob is not an image is an unreachable row naming that, not a failed render", async () => {
    must(compose(store(), { recipe: "explainer" }, OP, { id: "e4" }));
    land("e4", "strips", { cards: [card("c1", { blob: lineA }), card("c3")] });
    land("e4", "voice", { text: {}, takes: {}, byLine: {} });
    const r = await exportAnimatic("e4", true);
    expect(r.job?.error?.message).toBeUndefined();
    expect(r.outcome).toBe("done");
    const [l] = exportsOf("e4");
    expect(l?.unreachable).toEqual([{ unitRef: "c1", why: "plate blob is not a PNG, JPEG or WebP image" }]);
    const mp4 = await mp4Of(l!, "e4");
    expect(lumaAt(mp4, MID.c1)).toBeLessThanOrEqual(16);
    expect(lumaAt(mp4, 2 + 0.75)).toBeGreaterThan(16);
  });
});
