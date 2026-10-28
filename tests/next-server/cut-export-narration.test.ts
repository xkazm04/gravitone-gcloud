// NARRATION IN THE EXPORTED MP4, MUSIC DUCKED UNDER IT (spark audio-postproduction-research
// WP4). The explainer's derived cut (lib/cut/explainer.ts) compiles each active take that has
// bytes to a VOICE segment naming its blob (lib/cut/cutDocument.ts); the export reads those
// blobs from the kernel blob store, keys a side-chain duck on the music, loudnorms the mix and
// measures the file (lib/cutExport.ts, lib/cut/narrationMix.ts). Measured, not listened to:
//
//   1. both lines are in the soundtrack at their offsets (silencedetect on the voice stem, and
//      on the delivered mp4 with the music filtered out), within 50 ms;
//   2. the music under a line is >= 6 dB lower than the same music outside one (mean_volume
//      on the ducked-music stem);
//   3. the delivered file is -15..-13 LUFS, true peak <= -1 dBTP (ebur128, parseEbur128);
//   4. narration with no music still exports, and a cut with neither renders the graph it
//      always did, unmeasured;
//   and a take whose blob is gone, or is silence (a dry stand-in), is a named unreachable row.
//
// Every signal is made here with ffmpeg lavfi (a 1 kHz tone for a voice line - lavfi's sine is
// 1/8 full scale, ~-21 dBFS RMS, inside the voice-take profile; a 150 Hz tone at 0.5 for the
// bed), into a temp sound store and a temp blob store beside a temp kernel store path. Nothing
// in the operator's stores is opened. No ffmpeg on PATH: skipped locally, a failure under CI.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { blobStore } from "@gt/kernel/blob";

import { compileCut, type CutDocument } from "../../lib/cut/cutDocument.ts";
import type { CutClip, DerivedCut } from "../../lib/cut/deriveTimeline.ts";
import { explainerCut, type ExplainerTake } from "../../lib/cut/explainer.ts";
import { cutAudioArgs, cutAudioGraph, DUCK } from "../../lib/cut/narrationMix.ts";
import { parseEbur128 } from "../../lib/adRender.ts";
import { cutExportArgs, runCutExport } from "../../lib/cutExport.ts";
import { createTake } from "../../lib/sound/takes.ts";

const ENV = ["PUBLISH_EXPORTS_DIR", "SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_STORE_PATH", "LOCAL_BINARIES", "AD_EXPORT_DIR"] as const;
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg");
if (!HAVE_FFMPEG && process.env["CI"]) throw new Error("CI is set and ffmpeg is not on PATH: the narration export may not skip here");

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const stderrOf = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" }).stderr;

/** Where the signal starts after a stretch of silence (silencedetect's silence_end), in seconds.
 *  A silence still open at the end of the file is closed there; that end is not an onset. */
function onsets(file: string, pre: string): number[] {
  const err = stderrOf(["-i", file, "-vn", "-af", `${pre}silencedetect=noise=-45dB:d=0.3`, "-f", "null", "-"]);
  return [...err.matchAll(/silence_end:\s*(-?[\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t < TOTAL - 0.1);
}
/** Where the signal stops (silence_start), in seconds. */
function offsets(file: string, pre: string): number[] {
  const err = stderrOf(["-i", file, "-vn", "-af", `${pre}silencedetect=noise=-45dB:d=0.3`, "-f", "null", "-"]);
  return [...err.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
}
/** Mean (RMS) level in dB over [fromS, fromS + durS]. */
function meanDb(file: string, fromS: number, durS: number, pre = ""): number {
  const err = stderrOf(["-ss", String(fromS), "-t", String(durS), "-i", file, "-vn", "-af", `${pre}volumedetect`, "-f", "null", "-"]);
  const m = /mean_volume:\s*(-?inf|-?[\d.]+) dB/.exec(err);
  if (!m) throw new Error(`volumedetect said nothing:\n${err}`);
  return m[1].endsWith("inf") ? -Infinity : Number(m[1]);
}

// The voice heard alone: a 1 kHz line over a 150 Hz bed, the bed filtered ~70 dB down.
const VOICE_ONLY = "highpass=f=600:poles=2,highpass=f=600:poles=2,highpass=f=600:poles=2,";
// The bed heard alone: the 1 kHz line filtered ~70 dB down.
const MUSIC_ONLY = "lowpass=f=300:poles=2,lowpass=f=300:poles=2,lowpass=f=300:poles=2,";

let dir: string;
let shaA: string;
let shaB: string;
let shaSilent: string;
let shaPeaky: string;
let shaSpeech: string;
let musicTakeId: string;

/* Five cards, 2 s + 2 s + 2 s + 1.5 s + 2 s = 9.5 s. Lines on c2 (at 2.0 s, a 2 s take) and c4
   (at 6.0 s, a 1.5 s take); c1, c3, c5 have no take and hold their caption's spoken length
   (five words at 2.5 words a second = 2 s). */
const CAPTION = "five words in this caption";
const cards = ["c1", "c2", "c3", "c4", "c5"].map((id) => ({ id, section: "s", title: id, caption: CAPTION, state: "drawn" as const }));
const LINE_AT = { c2: 2, c4: 6 };
const LINE_END = { c2: 4, c4: 7.5 };
const TOTAL = 9.5;

/** The explainer's compiled cut; `bed` = the sound-store take a music bed points at, or none. */
function explainer(takes: Partial<Record<string, ExplainerTake>>, bed: string | null): CutDocument {
  const t: Record<string, ExplainerTake> = {};
  const byLine: Record<string, { active: string | null }> = {};
  for (const [card, take] of Object.entries(takes)) {
    if (take === undefined) continue;
    t[`take-${card}`] = take;
    byLine[`line-${card}`] = { active: `take-${card}` };
  }
  const cut: DerivedCut = explainerCut({ cards, voice: { text: {}, takes: t, byLine }, targetS: null });
  if (bed === null) return compileCut(cut, {}, {});
  // An explainer plans no score; a bed is laid in by hand, the way a film's spot points at its take.
  const clip: CutClip = { id: "mus-bed", track: "music", label: "bed", startS: 0, durS: TOTAL, status: "ok", ref: "bed", owner: "score", src: "/api/sound/takes/bed/file" };
  return compileCut({ ...cut, clips: [...cut.clips, clip] }, {}, { bed });
}
const take = (sha256: string, seconds: number): ExplainerTake => ({ seconds, blob: { sha256 }, engine: { provider: "elevenlabs", model: "m", mode: "live" } });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-cut-narration-"));
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "sound-ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store.sqlite");
  process.env["LOCAL_BINARIES"] = "on";
  delete process.env["AD_EXPORT_DIR"];
  if (!HAVE_FFMPEG) return;

  const wav = (name: string, src: string) => {
    const file = path.join(dir, `${name}.wav`);
    ff(["-f", "lavfi", "-i", src, "-ac", "1", "-ar", "44100", file]);
    return readFileSync(file);
  };
  // The default blob root: beside GRAVITONE_STORE_PATH, as the kernel puts it.
  const blobs = blobStore(path.join(dir, "blobs"));
  const put = async (bytes: Uint8Array) => {
    const r = await blobs.put(bytes, "audio/wav");
    if (!r.ok) throw r.error;
    return r.value.sha256;
  };
  shaA = await put(wav("line-a", "sine=frequency=1000:duration=2"));
  shaB = await put(wav("line-b", "sine=frequency=1000:duration=1.5"));
  shaSilent = await put(wav("stand-in", "anullsrc=r=8000:cl=mono:d=2"));
  // A line whose crest is extreme: a quiet 1 kHz bed with 4 ms bursts at 0.95 every 200 ms. Raising
  // it to -14 LUFS puts its peaks far past full scale, so the ceiling is the limiter's to hold.
  // Speech-shaped: pink noise opened and closed at a syllable rate (4 Hz), crest ~15-20 dB.
  shaSpeech = await put(wav("line-speech", "anoisesrc=c=pink:a=0.25:d=2:s=44100:seed=7,volume='max(0\,sin(2*PI*4*t))':eval=frame"));
  shaPeaky = await put(wav("line-peaky", "aevalsrc=exprs='if(lt(mod(t\,0.2)\,0.004)\,0.95*sin(2*PI*2000*t)\,0.02*sin(2*PI*1000*t))':d=2:s=44100"));
  const bed = path.join(dir, "bed.wav");
  ff(["-f", "lavfi", "-i", `sine=frequency=150:duration=${TOTAL}`, "-af", "volume=4", "-ar", "48000", bed]);
  const { take: t } = await createTake({ origin: "import", title: "bed" }, { bytes: readFileSync(bed), mime: "audio/wav", name: "bed.wav" });
  musicTakeId = t.id;
});

afterAll(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

describe("the explainer's cut names its narration", () => {
  it("an active take with bytes is a voice segment at its line's offset; a line without one stays a gap", () => {
    const doc = explainer({ c2: take("a".repeat(64), 2), c4: take("b".repeat(64), 1.5) }, null);
    const voice = doc.audio.filter((a) => a.lane === "voice");
    expect(voice.filter((a) => a.kind === "voice").map((a) => [a.clipId, a.startS, a.kind === "voice" ? a.sha256 : ""])).toEqual([
      ["vo-c2", 2, "a".repeat(64)],
      ["vo-c4", 6, "b".repeat(64)],
    ]);
    expect(voice.filter((a) => a.kind === "gap").map((a) => [a.clipId, a.kind === "gap" ? a.why : ""])).toEqual([
      ["vo-c1", "written, not recorded"],
      ["vo-c3", "written, not recorded"],
      ["vo-c5", "written, not recorded"],
    ]);
  });
  it("a music clip with a sha256 src is still a sound-store pointer, never a voice blob", () => {
    const cut = explainerCut({ cards, voice: { text: {}, takes: {}, byLine: {} }, targetS: null });
    const doc = compileCut({ ...cut, clips: [...cut.clips, { id: "mus-x", track: "music", label: "x", startS: 0, durS: 1, status: "ok", ref: "x", owner: "score", src: `sha256:${"c".repeat(64)}` }] }, {}, {});
    expect(doc.audio.find((a) => a.clipId === "mus-x")).toMatchObject({ kind: "gap" });
  });
  it("no narration: the soundtrack is the graph the export always ran - no loudnorm, no compressor", () => {
    const silent = cutAudioGraph(explainer({}, null), { takes: {}, voices: {} }, 5);
    expect(silent).toMatchObject({ narrated: 0, ducked: false, graph: ["[5:a]anull[a]"] });
    const doc = explainer({}, "st_bed");
    const music = cutAudioGraph(doc, { takes: { st_bed: "/s/bed.wav" }, voices: {} }, 5);
    // No take on any line: five captions of 2 s, and the bed laid at TOTAL.
    expect(music.graph).toEqual([`[5:a]atrim=start=0:duration=${TOTAL},asetpts=PTS-STARTPTS,aresample=48000,adelay=0:all=1[a0]`, `[a0]apad,atrim=duration=${doc.totalS}[a]`]);
    expect(cutExportArgs(doc, { stills: {}, takes: { st_bed: "/s/bed.wav" } }, "/o.mp4", "libx264").join(" ")).not.toMatch(/loudnorm|sidechaincompress/);
  });
});

describe.skipIf(!HAVE_FFMPEG)("the export, measured", { timeout: 120_000 }, () => {
  it("1+2+3: music + two lines: lines at their offsets, the bed ducked >= 6 dB under them, -14 LUFS / -1 dBTP", async () => {
    const doc = explainer({ c2: take(shaA, 2), c4: take(shaB, 1.5) }, musicTakeId);
    const r = await runCutExport({ document: doc, projectId: "p-narration" });
    expect(r.unreachable).toEqual([]);
    expect(r.narration).toEqual({ lines: 2, ducked: true });
    const mp4 = path.join(dir, "exports", `${r.id}.mp4`);

    // (1) the voice stem, rendered by the export's own graph, then the delivered file with the bed filtered out.
    const files = { takes: { [musicTakeId]: path.join(dir, "bed.wav") }, voices: { [shaA]: "", [shaB]: "" } };
    for (const [sha, name] of [[shaA, "line-a"], [shaB, "line-b"]] as const) files.voices[sha] = path.join(dir, `${name}.wav`);
    const stem = path.join(dir, "voice-stem.wav");
    ff(cutAudioArgs(doc, files, stem, "voice").slice(4));
    const near = (got: number[], want: number[]) => {
      expect(got).toHaveLength(want.length);
      got.forEach((g, i) => expect(Math.abs(g - want[i]!)).toBeLessThanOrEqual(0.05));
    };
    near(onsets(stem, ""), [LINE_AT.c2, LINE_AT.c4]);
    near(offsets(stem, ""), [0, LINE_END.c2, LINE_END.c4]);
    near(onsets(mp4, VOICE_ONLY), [LINE_AT.c2, LINE_AT.c4]);

    // (2) the ducked bed alone (before loudnorm), inside a line (past the attack) vs outside (past the release).
    const duckedStem = path.join(dir, "music-stem.wav");
    ff(cutAudioArgs(doc, files, duckedStem, "music").slice(4));
    const outside = Math.min(meanDb(duckedStem, 0.5, 1.3), meanDb(duckedStem, 8.2, 1.2));
    const under = Math.max(meanDb(duckedStem, 2.3, 1.5), meanDb(duckedStem, 6.3, 1.0));
    console.log(`[narration] DUCK ${JSON.stringify(DUCK)}: bed outside ${outside} dB, under a line ${under} dB, ducked ${(outside - under).toFixed(1)} dB`);
    expect(outside - under).toBeGreaterThanOrEqual(6);
    // The same, read off the delivered file (loudnorm's slow gain included): reported, and held to the same line.
    const mixOutside = meanDb(mp4, 0.5, 1.3, MUSIC_ONLY);
    const mixUnder = meanDb(mp4, 2.3, 1.5, MUSIC_ONLY);
    console.log(`[narration] delivered bed outside ${mixOutside} dB, under a line ${mixUnder} dB`);
    expect(mixOutside - mixUnder).toBeGreaterThanOrEqual(6);

    // (3) the delivered file, measured independently of the export's own measurement - and that one agrees.
    const m = parseEbur128(stderrOf(["-i", mp4, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]));
    console.log(`[narration] delivered ${JSON.stringify(m)}; export said ${JSON.stringify(r.loudness)}`);
    expect(m).not.toBeNull();
    expect(m!.integratedLufs).toBeGreaterThanOrEqual(-15);
    expect(m!.integratedLufs).toBeLessThanOrEqual(-13);
    expect(m!.truePeakDb).not.toBeNull();
    expect(m!.truePeakDb!).toBeLessThanOrEqual(-1);
    expect(r.loudness).toMatchObject({ integratedLufs: m!.integratedLufs, truePeakDb: m!.truePeakDb, acceptance: { profile: "youtube", verdict: "pass", reasons: [] } });
    expect(r.sidecar.loudness).toEqual(r.loudness);
  });

  it("3b: speech-shaped lines over the bed, and alone, land in -15..-13 LUFS and under -1 dBTP", async () => {
    for (const bed of [musicTakeId, null]) {
      const doc = explainer({ c2: take(shaSpeech, 2), c4: take(shaSpeech, 1.5) }, bed);
      const r = await runCutExport({ document: doc, projectId: "p-narration" });
      const m = parseEbur128(stderrOf(["-i", path.join(dir, "exports", `${r.id}.mp4`), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]));
      console.log(`[narration] speech-shaped, ${bed === null ? "no bed" : "bed"}: delivered ${JSON.stringify(m)}`);
      expect(m!.truePeakDb!).toBeLessThanOrEqual(-1);
      expect(m!.integratedLufs).toBeGreaterThanOrEqual(-15);
      expect(m!.integratedLufs).toBeLessThanOrEqual(-13);
      expect(r.loudness?.acceptance.verdict).toBe("pass");
    }
  });

  it("3c: a line whose crest single-pass loudnorm cannot bring in is judged on what the file measures - never a quiet pass", async () => {
    const doc = explainer({ c2: take(shaPeaky, 2), c4: take(shaPeaky, 1.5) }, null);
    const r = await runCutExport({ document: doc, projectId: "p-narration" });
    const m = parseEbur128(stderrOf(["-i", path.join(dir, "exports", `${r.id}.mp4`), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"]));
    console.log(`[narration] extreme crest: delivered ${JSON.stringify(m)}; export said ${JSON.stringify(r.loudness)}`);
    expect(r.loudness).toMatchObject({ integratedLufs: m!.integratedLufs, truePeakDb: m!.truePeakDb });
    expect(r.loudness?.acceptance.verdict).toBe("fail");
    expect(r.loudness?.acceptance.reasons).toContain(`loudness ${m!.integratedLufs.toFixed(1)} LUFS outside -15..-13`);
  });

  it("4a: narration with no music exports the narration, normalised and measured", async () => {
    const doc = explainer({ c2: take(shaA, 2), c4: take(shaB, 1.5) }, null);
    const r = await runCutExport({ document: doc, projectId: "p-narration" });
    expect(r.narration).toEqual({ lines: 2, ducked: false });
    const mp4 = path.join(dir, "exports", `${r.id}.mp4`);
    const at = onsets(mp4, "");
    expect(at).toHaveLength(2);
    expect(Math.abs(at[0]! - LINE_AT.c2)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(at[1]! - LINE_AT.c4)).toBeLessThanOrEqual(0.05);
    console.log(`[narration] voice only: ${JSON.stringify(r.loudness)}`);
    expect(r.loudness?.acceptance.verdict).toBe("pass");
  });

  it("4b: neither narration nor music renders as before: silence, unmeasured, no loudness on the sidecar", async () => {
    const r = await runCutExport({ document: explainer({}, null), projectId: "p-narration" });
    expect(r.narration).toEqual({ lines: 0, ducked: false });
    expect(r.loudness).toBeNull();
    expect("loudness" in r.sidecar).toBe(false);
    expect(meanDb(path.join(dir, "exports", `${r.id}.mp4`), 0, TOTAL)).toBeLessThan(-80);
  });

  it("a take whose blob is gone, or is silence, is a named unreachable row and is not mixed", async () => {
    const gone = "d".repeat(64);
    const doc = explainer({ c2: take(shaSilent, 2), c4: take(gone, 1.5) }, musicTakeId);
    const r = await runCutExport({ document: doc, projectId: "p-narration" });
    expect(r.narration).toEqual({ lines: 0, ducked: false });
    expect(r.loudness).toBeNull();
    expect(r.unreachable).toEqual([
      { clipId: "vo-c2", sha256: shaSilent, why: "take is silence: a stand-in, not narration" },
      { clipId: "vo-c4", sha256: gone, why: expect.stringContaining(`blob: ${gone} is not in`) },
    ]);
  });
});
