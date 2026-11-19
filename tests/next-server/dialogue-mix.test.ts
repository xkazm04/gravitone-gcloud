// THE DUB LAY'S DIALOGUE MIX (lib/cut/dialogueMix.ts): arm d of the registry's shift-replica-dialogue-el-dub-r2, the
// operator's pick of 2026-11-19, as a pure graph. Held here:
//
//   1. the graph for a two-line fixture with a bed, verbatim (a stage that moves is a change someone heard);
//   2. arm d's own numbers out of the stage functions (per-line gain, pan, expected L-R);
//   3. the room impulse: deterministic, 8 ms pre-delay, peak 1;
//   and, rendered on signals ffmpeg lavfi makes here:
//   4. a panned line's L-R within 0.1 dB of 20·log10(gL/gR);
//   5. the room's wet copy within 1 dB of arm d's measured -12.25 dB under the dry on a speech-like input;
//   6. the two-pass lay lands within 0.5 LU of -14 LUFS with no native sound under it.
// No ffmpeg on PATH: the rendered cases skip locally and fail under CI.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { parseEbur128 } from "../../lib/adRender.ts";
import { dialogueGraph, dialogueLoudnessArgs, dialogueMeasureArgs, dialogueMixArgs, gainDb, gainStage, loudnormMeasured, monoIn, panGains, panOf, panStage, roomIr, roomIrWav, roomStage, toneStage } from "../../lib/cut/dialogueMix.ts";

function onPath(bin: string): boolean {
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const HAVE_FFMPEG = onPath("ffmpeg");
if (!HAVE_FFMPEG && process.env["CI"]) throw new Error("CI is set and ffmpeg is not on PATH: the dialogue mix may not skip here");

const DIR = mkdtempSync(path.join(tmpdir(), "gt-dialogue-mix-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));

const at = (f: string) => path.join(DIR, f);
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
const stderrOf = (args: readonly string[]) => spawnSync("ffmpeg", [...args], { encoding: "utf8", maxBuffer: 64 << 20 }).stderr;
const pcm = (file: string, ch: number): Float32Array => {
  const b = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", String(ch), "-ar", "48000", "-"], { maxBuffer: 256 << 20 });
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
};
const rmsDb = (x: Float32Array) => 10 * Math.log10(x.reduce((s, v) => s + v * v, 0) / x.length);
/** Speech-shaped: pink noise falling off above 3 kHz, gated at 4 Hz. Its room wet-dry measured -12.84 dB here; the
 *  replica's C1-adrian -12.46 (and -12.25 panned, arm d), A1-2-clara -12.94; plain gated pink noise -13.30. */
const speech = (file: string, seconds: number) => ff(["-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.4:d=${seconds}:seed=7`, "-af", "lowpass=f=3000,lowpass=f=3000,volume='if(lt(mod(t,0.25),0.16),1,0)':eval=frame", "-ac", "1", "-ar", "44100", file]);

describe("the graph", () => {
  it("a two-line fixture with a bed, verbatim: no native sound, each line placed, the bed ducked under the voice", () => {
    const g = dialogueGraph({
      video: "/in.mp4",
      ir: "/room.wav",
      lines: [
        { file: "/a.wav", startS: 0.98, x: 0.27, direction: "low and urgent", lufs: -15.6 },
        { file: "/b.wav", startS: 3.04, trimS: 0.119, durS: 1.5, x: 0.71, direction: "quietly", lufs: -19.7 },
      ],
      bed: { file: "/bed.mp3", gainDb: 5.8 },
      totalS: 4.4,
    });
    expect(g.inputArgs).toEqual(["-i", "/in.mp4", "-i", "/a.wav", "-i", "/b.wav", "-i", "/room.wav", "-i", "/bed.mp3"]);
    expect(g.graph).toEqual([
      "[3:a]aresample=48000,asplit=2[ir0][ir1]",
      "[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,volume=-7.40dB,highpass=f=90,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=5000:t=q:w=1:g=-2,lowpass=f=11000,pan=stereo|c0=1.102305*c0|c1=0.885959*c0[p0]",
      "[p0]asplit=2[p0d][p0w]",
      "[p0w][ir0]afir=irnorm=2:irlink=1,volume=-14dB[p0x]",
      "[p0d][p0x]amix=inputs=2:normalize=0:duration=first[r0]",
      "[r0]adelay=delays=980:all=1[l0]",
      "[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,atrim=start=0.1190,asetpts=PTS-STARTPTS,atrim=end=1.3600,afade=t=out:st=1.3300:d=0.03,volume=-6.30dB,highpass=f=90,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=5000:t=q:w=1:g=-2,lowpass=f=11000,pan=stereo|c0=0.896309*c0|c1=1.093906*c0[p1]",
      "[p1]asplit=2[p1d][p1w]",
      "[p1w][ir1]afir=irnorm=2:irlink=1,volume=-14dB[p1x]",
      "[p1d][p1x]amix=inputs=2:normalize=0:duration=first[r1]",
      "[r1]adelay=delays=3040:all=1[l1]",
      "[l0][l1]amix=inputs=2:duration=longest:normalize=0,asetpts=N/SR/TB,apad,atrim=end=4.40000[vbus]",
      "[4:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=5.80dB,apad,atrim=end=4.40000[bed]",
      "[vbus]asplit=2[vkey][vmix]",
      "[bed][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300:makeup=1[ducked]",
      "[ducked][vmix]amix=inputs=2:normalize=0:duration=first[pre]",
    ]);
    const args = dialogueMixArgs({ video: "/in.mp4", ir: "/room.wav", lines: [{ file: "/a.wav", startS: 0 }], totalS: 2, out: "/o.mp4" }).join(" ");
    expect(args).toContain("-map 0:v -map [a]");
    expect(args).not.toContain("[0:a]");
    expect(args).toContain("[vbus]anull[pre];[pre]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]");
    const m = { input_i: "-26.47", input_tp: "-10.79", input_lra: "2.90", input_thresh: "-36.9", target_offset: "0.1" };
    expect(dialogueMixArgs({ video: "/in.mp4", ir: "/room.wav", lines: [{ file: "/a.wav", startS: 0 }], totalS: 2, out: "/o.mp4" }, m).join(" ")).toContain("measured_I=-26.47:measured_TP=-10.79:measured_LRA=2.90:measured_thresh=-36.9:offset=0.1:linear=true");
  });

  it("arm d's numbers come out of the stages: gain per direction, side per speaker, L-R per side", () => {
    // mix.json lines: C1-adrian, C1-clara, A1-2-adrian, A1-2-clara, A1-3-adrian, A1-3-clara.
    const d = [
      { lufs: -15.6, dir: "low and urgent", x: 0.27, gain: -7.4, p: -0.138, lr: 1.9 },
      { lufs: -18, dir: "quietly", x: 0.25, gain: -8, p: -0.15, lr: 2.07 },
      { lufs: -15, dir: "low and tired", x: 0.28, gain: -10, p: -0.132, lr: 1.81 },
      { lufs: -19.7, dir: "quietly", x: 0.71, gain: -6.3, p: 0.126, lr: -1.73 },
      { lufs: -19.9, dir: "softly", x: 0.2, gain: -7.1, p: -0.18, lr: 2.49 },
      { lufs: -14.2, dir: "close to tears", x: 0.53, gain: -10.8, p: 0.018, lr: -0.25 },
    ];
    for (const l of d) {
      expect(gainDb(l.lufs, l.dir)).toBeCloseTo(l.gain, 5);
      expect(panOf(l.x)).toBeCloseTo(l.p, 3);
      const { gL, gR } = panGains(panOf(l.x));
      expect(20 * Math.log10(gL / gR)).toBeCloseTo(l.lr, 1);
    }
    expect(gainDb(-20, "quietly", true)).toBe(-8);
    expect(panOf(0.9, true)).toBe(0);
    expect(panOf(undefined)).toBe(0);
    const c = panGains(0);
    expect(c.gL).toBeCloseTo(1, 9);
    expect(c.gR).toBeCloseTo(1, 9);
  });

  it("the room impulse is the replica's rule: 0.40 s stereo, 8 ms of zeros, peak 1, the same bytes twice", () => {
    const [L, R] = roomIr();
    expect(L.length).toBe(19200);
    expect(L.slice(0, 384).every((v) => v === 0)).toBe(true);
    expect(L[384]).not.toBe(0);
    expect(Math.max(...L.map(Math.abs), ...R.map(Math.abs))).toBe(1);
    const a = roomIrWav(), b = roomIrWav();
    expect(a.length).toBe(44 + 19200 * 2 * 4);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("reads loudnorm's report, and nothing from a stderr without one", () => {
    const said = 'Input #0\n[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-26.47",\n\t"input_tp" : "-10.79",\n\t"input_lra" : "2.90",\n\t"input_thresh" : "-36.90",\n\t"output_i" : "-14.20",\n\t"target_offset" : "-0.20",\n\t"normalization_type" : "dynamic"\n}\n';
    expect(loudnormMeasured(said)).toMatchObject({ input_i: "-26.47", target_offset: "-0.20", normalization_type: "dynamic" });
    expect(loudnormMeasured("")).toBeUndefined();
    expect(loudnormMeasured("{ \"input_i\": \"-20\" }")).toBeUndefined();
  });
});

describe.skipIf(!HAVE_FFMPEG)("the dialogue mix, measured", { timeout: 120_000 }, () => {
  it("a line at x 0.8 measures the L-R its pan gains promise, within 0.1 dB", () => {
    const src = at("pan.wav");
    speech(src, 2);
    for (const x of [0.8, 0.27]) {
      const p = panOf(x);
      const out = at(`pan-${x}.wav`);
      ff(["-i", src, "-af", [monoIn(), gainStage(-6), toneStage(), panStage(p)].join(","), "-c:a", "pcm_f32le", out]);
      const s = pcm(out, 2);
      let l = 0, r = 0;
      for (let i = 0; i < s.length; i += 2) {
        l += (s[i] ?? 0) ** 2;
        r += (s[i + 1] ?? 0) ** 2;
      }
      const { gL, gR } = panGains(p);
      expect(Math.abs(10 * Math.log10(l / r) - 20 * Math.log10(gL / gR))).toBeLessThan(0.1);
    }
  });

  it("the room's wet copy sits within 1 dB of arm d's -12.25 dB under the dry line", () => {
    const src = at("room-src.wav"), ir = at("room.wav"), dry = at("dry.wav"), wet = at("wet.wav");
    speech(src, 3);
    writeFileSync(ir, roomIrWav());
    const pre = [monoIn(), toneStage(), panStage(0)].join(",");
    ff(["-i", src, "-af", pre, "-c:a", "pcm_f32le", dry]);
    const [, wetChain] = roomStage("v", "ir", "o", -14);
    ff(["-i", src, "-i", ir, "-filter_complex", `[0:a]${pre}[v];[1:a]aresample=48000[ir];${(wetChain ?? "").replace("[vw]", "[v]").replace("[vx]", "[a]")}`, "-map", "[a]", "-c:a", "pcm_f32le", wet]);
    expect(Math.abs(rmsDb(pcm(wet, 1)) - rmsDb(pcm(dry, 1)) - -12.25)).toBeLessThan(1);
  });

  it("two lines and a bed lay in two passes within 0.5 LU of -14 LUFS, the picture kept", () => {
    const video = at("in.mp4"), a = at("a.wav"), b = at("b.wav"), bed = at("bed.wav"), ir = at("lay-room.wav"), out = at("laid.mp4");
    ff(["-f", "lavfi", "-i", "color=c=black:s=64x64:r=24:d=5", "-f", "lavfi", "-i", "sine=f=3000:d=5", "-c:v", "mpeg4", "-c:a", "aac", "-shortest", video]);
    speech(a, 1.6);
    speech(b, 1.4);
    ff(["-f", "lavfi", "-i", "anoisesrc=color=brown:amplitude=0.05:d=5:seed=3", "-ac", "2", bed]);
    writeFileSync(ir, roomIrWav());
    const lufsOf = (f: string) => parseEbur128(stderrOf(dialogueLoudnessArgs(f)))?.integratedLufs;
    const la = lufsOf(a), lb = lufsOf(b);
    expect(la).toBeTypeOf("number");
    const input = { video, ir, out, totalS: 5, bed: { file: bed, gainDb: -14 }, lines: [{ file: a, startS: 0.5, x: 0.27, direction: "quietly", ...(la === undefined ? {} : { lufs: la }) }, { file: b, startS: 2.8, x: 0.71, ...(lb === undefined ? {} : { lufs: lb }) }] };
    const measured = loudnormMeasured(stderrOf(dialogueMeasureArgs(input)));
    expect(measured).toBeDefined();
    execFileSync("ffmpeg", dialogueMixArgs(input, measured));
    const r = parseEbur128(stderrOf(["-hide_banner", "-nostats", "-i", out, "-vn", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"]));
    expect(Math.abs((r?.integratedLufs ?? 0) - -14)).toBeLessThan(0.5);
    const streams = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout.trim().split(/\s+/);
    expect(streams).toEqual(["video", "audio"]);
  });
});
