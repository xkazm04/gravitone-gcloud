// LANE — THE ANIMATIC EXPORTS OFFLINE, AND THE FILE PROVES IT (node). Card
// frames-score-cut-B stage 2a.
//
// cut-document.probe checks the ffmpeg ARGUMENT plan and a hand-landed file;
// nothing had ever run `runCutExport` and looked at what it landed. This does:
// the real kernel on this machine, no route, no browser, no Chromium, then
// ffprobe / a decoded frame / volumedetect over the MP4 itself.
//
// Fixtures are ffmpeg lavfi: two solid-colour PNG plates (as data: URLs) and a
// 2 s sine WAV filed into a temp sound store with createTake. Every test makes
// its own mkdtemp directory under os.tmpdir() and removes it.
//
// No ffmpeg/ffprobe on PATH: skip locally, FAIL when CI is set (case 6), so a
// runner that lost its binaries cannot turn this probe into a green no-op.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { compileCut, cutDocumentHash, type CutDocument } from "@/app/_phases/cut/cutDocument";
import type { CutClip, CutScene, DerivedCut } from "@/app/_phases/cut/deriveTimeline";
import { emptyClip, type Frame } from "@/app/_phases/frames/frames";
import { CUT_FPS, runCutExport } from "@/lib/cutExport";
import { createTake } from "@/lib/sound/takes";

keepEnv(["PUBLISH_EXPORTS_DIR", "SOUND_STORE_DIR", "LOCAL_BINARIES", "AD_EXPORT_DIR"]);

/* ── is ffmpeg here ──────────────────────────────────────────────────────── */

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg") && onPath("ffprobe");

/** Skip off-CI; in CI the missing binary is a failure, never a pass. */
function needFfmpeg(): void {
  if (HAVE_FFMPEG) return;
  if (process.env.CI) throw new Error("CI is set and ffmpeg/ffprobe are not on PATH: this probe may not skip here");
  test.skip(true, "ffmpeg/ffprobe are not on PATH on this machine: the real export cannot run here");
}

/* ── ffmpeg helpers ──────────────────────────────────────────────────────── */

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);

interface Probed {
  streams: { codec_type: string; codec_name: string; width?: number; height?: number; sample_rate?: string }[];
  format: { duration: string };
}
function ffprobe(file: string): Probed {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,sample_rate:format=duration", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
}

/** Mean luma, 0..255, of the frame at `atS` of `file` (a PNG when `atS` is null). */
function luma(file: string, atS: number | null, scratch: string): number {
  let src = file;
  if (atS !== null) {
    src = join(scratch, `frame-${atS}.png`);
    ff(["-ss", atS.toFixed(3), "-i", file, "-frames:v", "1", src]);
  }
  const raw = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", src, "-vf", "scale=64:64,format=gray", "-f", "rawvideo", "-"]);
  let sum = 0;
  for (const b of raw) sum += b;
  return sum / raw.length;
}

/** `max_volume` in dB over `[fromS, toS]` of the file's audio; -Infinity for pure silence. */
function maxVolume(file: string, fromS: number, toS: number): number {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-nostats", "-ss", String(fromS), "-t", String(toS - fromS), "-i", file, "-vn", "-af", "volumedetect", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const m = /max_volume:\s*(-?inf|-?[\d.]+) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect said nothing over [${fromS}, ${toS}]:\n${r.stderr}`);
  return m[1].endsWith("inf") ? -Infinity : Number(m[1]);
}

/* ── the fixture: a scratch dir, two plates, one take, one document ──────── */

const tmp = () => mkdtempSync(join(tmpdir(), "cut-export-render-"));

const PLATE_A = "0x909090";
const PLATE_B = "0xe0e0e0";

function frame(id: string, plate: string): Frame {
  return {
    id,
    at: "0:00",
    atS: 0,
    kind: "movement",
    title: `shot ${id}`,
    line: `the line over ${id}`,
    plate: { state: "ready", src: plate },
    clip: emptyClip(),
    elements: [],
    texts: [],
  };
}

interface Fixture {
  dir: string;
  exportsDir: string;
  doc: CutDocument;
  takeId: string;
  /** Luma of each plate's own PNG, measured the way the MP4's frames are. */
  plateLuma: { a: number; b: number };
}

/** Picture [plate 2.0, gap 1.5, plate 1.5], one music take at +250 ms, totalS 5.0. */
async function fixture(opts: { takeGone?: boolean } = {}): Promise<Fixture> {
  const dir = tmp();
  const exportsDir = join(dir, "exports");
  process.env.PUBLISH_EXPORTS_DIR = exportsDir;
  process.env.SOUND_STORE_DIR = join(dir, "sound");
  process.env.LOCAL_BINARIES = "on";
  delete process.env.AD_EXPORT_DIR;

  const png = (name: string, colour: string) => {
    const file = join(dir, `${name}.png`);
    ff(["-f", "lavfi", "-i", `color=c=${colour}:s=640x360`, "-frames:v", "1", file]);
    return file;
  };
  const pngA = png("plate-a", PLATE_A);
  const pngB = png("plate-b", PLATE_B);
  const dataUrl = (file: string) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;

  const wav = join(dir, "tone.wav");
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-ar", "48000", wav]);
  const { take } = await createTake({ origin: "import", title: "probe tone" }, { bytes: readFileSync(wav), mime: "audio/wav", name: "tone.wav" });
  const takeId = opts.takeGone ? "st_gone_from_store" : take.id;

  const scenes: CutScene[] = [
    { id: "p1", index: 0, label: "plate one", mood: "open", startS: 0, durS: 2 },
    { id: "p2", index: 1, label: "the gap", mood: "hold", startS: 2, durS: 1.5 },
    { id: "p3", index: 2, label: "plate two", mood: "close", startS: 3.5, durS: 1.5 },
  ];
  const clips: CutClip[] = [
    { id: "pic-p1", track: "video", label: "p1", startS: 0, durS: 2, status: "ok", ref: "p1", owner: "frames", src: dataUrl(pngA) },
    { id: "pic-p2", track: "video", label: "p2", startS: 2, durS: 1.5, status: "missing", ref: "p2", owner: "frames", why: "plate refused" },
    { id: "pic-p3", track: "video", label: "p3", startS: 3.5, durS: 1.5, status: "ok", ref: "p3", owner: "frames", src: dataUrl(pngB) },
    { id: "mus-a", track: "music", label: "open cue", startS: 0, durS: 2, status: "ok", ref: "a", owner: "score", src: "/api/sound/takes/tone/file" },
  ];
  const cut: DerivedCut = {
    origin: "project",
    totalS: 5,
    targetS: null,
    scenes,
    clips,
    unplaced: [],
    frames: { p1: frame("p1", dataUrl(pngA)), p3: frame("p3", dataUrl(pngB)) },
  };
  const doc = compileCut(cut, { "mus-a": 250 }, { a: takeId });
  return { dir, exportsDir, doc, takeId, plateLuma: { a: luma(pngA, null, dir), b: luma(pngB, null, dir) } };
}

const cleanup = (f: Fixture) => rmSync(f.dir, { recursive: true, force: true });

/* ── cases ───────────────────────────────────────────────────────────────── */

test("case 1 · the file: one h264 1920x1080 video, one aac 48000 audio, duration = totalS", async () => {
  needFfmpeg();
  const f = await fixture();
  try {
    const r = await runCutExport({ document: f.doc, projectId: "p-render" });
    const p = ffprobe(join(f.exportsDir, `${r.id}.mp4`));
    const video = p.streams.filter((s) => s.codec_type === "video");
    const audio = p.streams.filter((s) => s.codec_type === "audio");
    expect(video).toHaveLength(1);
    expect(video[0]).toMatchObject({ codec_name: "h264", width: 1920, height: 1080 });
    expect(audio).toHaveLength(1);
    expect(audio[0]).toMatchObject({ codec_name: "aac", sample_rate: "48000" });
    expect(Math.abs(Number(p.format.duration) - f.doc.totalS)).toBeLessThanOrEqual(1 / CUT_FPS);
  } finally {
    cleanup(f);
  }
});

test("case 2 · the picture: each plate's colour mid-segment, black mid-gap", async () => {
  needFfmpeg();
  const f = await fixture();
  try {
    const r = await runCutExport({ document: f.doc, projectId: "p-render" });
    const mp4 = join(f.exportsDir, `${r.id}.mp4`);
    expect(Math.abs(luma(mp4, 1.0, f.dir) - f.plateLuma.a)).toBeLessThanOrEqual(6);
    expect(luma(mp4, 2.75, f.dir)).toBeLessThanOrEqual(16);
    expect(Math.abs(luma(mp4, 4.25, f.dir) - f.plateLuma.b)).toBeLessThanOrEqual(6);
    // The two plates must be told apart, or "matches its own colour" proves nothing.
    expect(Math.abs(f.plateLuma.a - f.plateLuma.b)).toBeGreaterThan(30);
  } finally {
    cleanup(f);
  }
});

test("case 3 · the sound: silent before the +250 ms start, loud in the take, silent after it", async () => {
  needFfmpeg();
  const f = await fixture();
  try {
    const r = await runCutExport({ document: f.doc, projectId: "p-render" });
    const mp4 = join(f.exportsDir, `${r.id}.mp4`);
    expect(maxVolume(mp4, 0, 0.2)).toBeLessThanOrEqual(-60);
    expect(maxVolume(mp4, 0.5, 1.5)).toBeGreaterThanOrEqual(-30);
    expect(maxVolume(mp4, 3.0, 4.5)).toBeLessThanOrEqual(-60);
  } finally {
    cleanup(f);
  }
});

test("case 4 · the landing: mp4 + sidecar, no partial, drawn plates, a named encoder", async () => {
  needFfmpeg();
  const f = await fixture();
  try {
    const r = await runCutExport({ document: f.doc, projectId: "p-render" });
    expect(existsSync(join(f.exportsDir, `${r.id}.mp4`))).toBe(true);
    expect(existsSync(join(f.exportsDir, `${r.id}.json`))).toBe(true);
    expect(existsSync(join(f.exportsDir, `${r.id}.partial.mp4`))).toBe(false);

    const sidecar = JSON.parse(readFileSync(join(f.exportsDir, `${r.id}.json`), "utf8"));
    expect(sidecar).toMatchObject({ kind: "cut-animatic", projectId: "p-render", document: cutDocumentHash(f.doc) });

    expect(r.drawn).toBe("plates");
    expect(["libx264", "h264_nvenc"]).toContain(r.encoder);
    console.log(`[cut-export-render] encoder that ran: ${r.encoder} (${r.wallMs} ms, ${r.sizeBytes} bytes)`);
  } finally {
    cleanup(f);
  }
});

test("case 5 · a take the store does not hold still lands a file, named unreachable, span silent", async () => {
  needFfmpeg();
  const f = await fixture({ takeGone: true });
  try {
    expect(f.doc.audio.find((a) => a.kind === "take")).toMatchObject({ takeId: f.takeId });
    const r = await runCutExport({ document: f.doc, projectId: "p-render" });
    expect(existsSync(join(f.exportsDir, `${r.id}.mp4`))).toBe(true);
    expect(r.unreachable).toContainEqual({ takeId: f.takeId, why: "take gone from the store" });
    const mp4 = join(f.exportsDir, `${r.id}.mp4`);
    expect(maxVolume(mp4, 0.5, 1.5)).toBeLessThanOrEqual(-60);
  } finally {
    cleanup(f);
  }
});

test("case 6 · a skip is not a pass in CI: missing ffmpeg/ffprobe fails when CI is set", () => {
  expect(
    HAVE_FFMPEG || !process.env.CI,
    "CI is set and ffmpeg/ffprobe are not on PATH: the gates job installs ffmpeg before the probes run",
  ).toBe(true);
});
