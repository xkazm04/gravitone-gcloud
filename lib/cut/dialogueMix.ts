// THE DUB LAY'S DIALOGUE, AS A FILTER GRAPH — what lib/producers/productionCutActs.ts lays when a cut has dub lines, pure.
//
// The operator's pick of 2026-11-19 (arm d of the registry's shift-replica-dialogue-el-dub-r2, one scene, one listener):
// the take's native sound is DROPPED under the dub ("original track should be completely removed"), and each line is
// placed in the scene instead of laid flat on it. Every stage below carries arm d's value as heard; none is re-tuned.
//
//   LINE   mono 48 kHz, its leading silence trimmed, then a static gain to -23 LUFS plus its direction's offset (the
//          line's own loudness is measured by the caller, ebur128 over this same mono segment), the dialogue tone
//          (rumble out, a little mud and sibilance off, air capped), a constant-power pan to the speaker's side, a
//          small room (the dry line plus its convolution with a generated small-room impulse at -14 dB), and its start
//          on the cut clock.
//   VOICE  the lines mixed with normalize=0, so two lines that never overlap keep their own level.
//   BED    optional, at the caller's static gain, side-chain ducked under the voice bus with narrationMix.ts's
//          DUCK_FILTER, then mixed under it.
//   LOUD   two-pass loudnorm to EXPORT_LOUDNORM's target with linear=true requested. On arm d's sum the linear pass
//          fell back to dynamic (a 15.7 dB peak-to-loudness ratio cannot reach -14 LUFS under TP -1.5 linearly); the
//          dynamic output is what the operator heard and picked, so the fallback is kept, not engineered away.
//
// THE PAN. p = clamp(2x - 1, -1, 1) * 0.3 for x the speaker's horizontal centre as a fraction of frame width, held for
// the line; gL = √2·cos((p+1)π/4), gR = √2·sin((p+1)π/4): constant power, unity at centre, L-R = 20·log10(gL/gR) dB.
//
// THE ROOM. afir's default irnorm (an L1 norm) leaves a noise impulse far below unity, hence irnorm=2. The voice bus
// re-stamps its timestamps (asetpts=N/SR/TB): afir's output timestamps run ahead of its samples, and without it the
// replica's first render cut the bus 0.98 s early.
//
// THE TAP. `tap` ends the same graph at the voice bus or the ducked bed (before loudness), so a test renders the stem it
// measures, as narrationMix.ts's does.

import { DUCK_FILTER, EXPORT_LOUDNORM } from "./narrationMix";

export const SR = 48000;
/** Every line is first brought here, then offset by its direction (dB). */
export const LINE_TARGET_LUFS = -23;
export const DIRECTION_OFFSET_DB: Readonly<Record<string, number>> = { "low and urgent": 0, "low and tired": -2, quietly: -3, softly: -4, "close to tears": -2 };
/** An off-screen speaker sits further back: quieter, centred, wetter. */
export const OFFSCREEN_DB = -2;
export const PAN_WIDTH = 0.3;
export const ROOM_WET_DB = -14;
export const ROOM_WET_OFFSCREEN_DB = -11;
/** An ambience bed's level (arm d's rain). A score or a music master is not an ambience: the caller sets its gain. */
export const AMBIENCE_TARGET_LUFS = -32;
const FADE_OUT_S = 0.03;

export type DialogueTap = "mix" | "voice" | "bed";

export interface DialogueLine {
  readonly file: string;
  /** Where the line's (trimmed) first sample lands on the cut clock. */
  readonly startS: number;
  /** Seconds cut from the file's head: its leading silence. */
  readonly trimS?: number;
  /** The file's duration; when it runs past the picture the line is cut there with a 30 ms fade. */
  readonly durS?: number;
  /** The speaker's horizontal centre, 0..1 of frame width. Absent: centre. */
  readonly x?: number;
  readonly off?: boolean;
  readonly direction?: string;
  /** The segment's integrated loudness (dialogueLoudnessArgs). Absent: no gain stage. */
  readonly lufs?: number;
}

export interface DialogueMixInput {
  readonly video: string;
  /** The room impulse response (roomIrWav's bytes, written by the caller). */
  readonly ir: string;
  readonly lines: readonly DialogueLine[];
  readonly bed?: { readonly file: string; readonly gainDb: number };
  readonly totalS: number;
  readonly out: string;
}

/** loudnorm's first-pass report, as print_format=json writes it. */
export interface LoudnormMeasure {
  readonly input_i: string;
  readonly input_tp: string;
  readonly input_lra: string;
  readonly input_thresh: string;
  readonly target_offset: string;
}

const fx = (n: number, d: number) => n.toFixed(d);

/* ── stages (pure; each returns filter text) ──────────────────────────────── */

export const gainDb = (lufs: number, direction?: string, off = false): number => LINE_TARGET_LUFS + (DIRECTION_OFFSET_DB[direction ?? ""] ?? 0) - lufs + (off ? OFFSCREEN_DB : 0);
export const gainStage = (db: number) => `volume=${fx(db, 2)}dB`;
export const toneStage = () => "highpass=f=90,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=5000:t=q:w=1:g=-2,lowpass=f=11000";
export const panOf = (x: number | undefined, off = false): number => (off || x === undefined ? 0 : Math.max(-1, Math.min(1, 2 * x - 1)) * PAN_WIDTH);
export const panGains = (p: number) => ({ gL: Math.SQRT2 * Math.cos(((p + 1) * Math.PI) / 4), gR: Math.SQRT2 * Math.sin(((p + 1) * Math.PI) / 4) });
export const panStage = (p: number) => {
  const { gL, gR } = panGains(p);
  return `pan=stereo|c0=${fx(gL, 6)}*c0|c1=${fx(gR, 6)}*c0`;
};
/** Dry plus the impulse-convolved copy wetDb below it, from [inL] to [outL]. */
export const roomStage = (inL: string, irL: string, outL: string, wetDb: number): string[] => [`[${inL}]asplit=2[${inL}d][${inL}w]`, `[${inL}w][${irL}]afir=irnorm=2:irlink=1,volume=${wetDb}dB[${inL}x]`, `[${inL}d][${inL}x]amix=inputs=2:normalize=0:duration=first[${outL}]`];
export const placeStage = (startS: number) => `adelay=delays=${Math.round(startS * 1000)}:all=1`;
/** The head trim, and the picture-end cut with its fade when the line outruns the picture. */
export function trimStage(l: Pick<DialogueLine, "trimS" | "durS" | "startS">, totalS: number): string[] {
  const trimS = l.trimS ?? 0;
  const parts = trimS > 0 ? [`atrim=start=${fx(trimS, 4)}`, "asetpts=PTS-STARTPTS"] : [];
  if (l.durS !== undefined && l.startS + l.durS - trimS > totalS) {
    const keep = totalS - l.startS;
    parts.push(`atrim=end=${fx(keep, 4)}`, `afade=t=out:st=${fx(keep - FADE_OUT_S, 4)}:d=${FADE_OUT_S}`);
  }
  return parts;
}
export const monoIn = () => `aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=mono`;
export const loudPass1 = () => `${EXPORT_LOUDNORM}:print_format=json`;
export const loudPass2 = (m: LoudnormMeasure) => `${EXPORT_LOUDNORM}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=json,aresample=${SR}`;
/** The ambience gain that brings a bed measured at `lufs` to AMBIENCE_TARGET_LUFS. */
export const ambienceGainDb = (lufs: number) => AMBIENCE_TARGET_LUFS - lufs;

/* ── the room's impulse response (generated, never committed) ────────────── */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0.40 s stereo: 8 ms of zeros, seeded white noise under an RT60 0.35 s decay, a 6 kHz one-pole, peak 1. Pure. */
export function roomIr({ seconds = 0.4, preDelayS = 0.008, rt60 = 0.35, lpHz = 6000, seed = 1119 } = {}): [Float32Array, Float32Array] {
  const n = Math.round(seconds * SR), pre = Math.round(preDelayS * SR), rnd = mulberry32(seed);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = pre; i < n; i++) {
    const env = Math.exp((-6.9078 * ((i - pre) / SR)) / rt60);
    L[i] = (rnd() * 2 - 1) * env;
    R[i] = (rnd() * 2 - 1) * env;
  }
  const a = Math.exp((-2 * Math.PI * lpHz) / SR);
  let pk = 0;
  for (const ch of [L, R]) {
    let y = 0;
    for (let i = 0; i < n; i++) {
      y = (1 - a) * (ch[i] ?? 0) + a * y;
      ch[i] = y;
    }
    for (const v of ch) pk = Math.max(pk, Math.abs(v));
  }
  for (const ch of [L, R]) for (let i = 0; i < n; i++) ch[i] = (ch[i] ?? 0) / pk;
  return [L, R];
}

/** roomIr as a 32-bit float WAV. Pure. */
export function roomIrWav(): Uint8Array {
  const chans = roomIr(), n = chans[0].length, c = chans.length, b = Buffer.alloc(44 + n * c * 4);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * c * 4, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20);
  b.writeUInt16LE(c, 22);
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4 * c, 28);
  b.writeUInt16LE(4 * c, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * c * 4, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) b.writeFloatLE(chans[k]?.[i] ?? 0, 44 + (i * c + k) * 4);
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

/* ── the graph ────────────────────────────────────────────────────────────── */

/** Inputs and chains up to `[pre]` (the mix before loudness), or `[a]` for a voice or bed tap. */
export function dialogueGraph(input: Omit<DialogueMixInput, "out">, tap: DialogueTap = "mix"): { inputArgs: string[]; graph: string[] } {
  const { lines, totalS } = input;
  if (lines.length === 0) throw new Error("a dialogue mix needs at least one line");
  if (tap === "bed" && input.bed === undefined) throw new Error("a bed tap needs a bed");
  const total = fx(totalS, 5);
  const inputArgs = ["-i", input.video, ...lines.flatMap((l) => ["-i", l.file]), "-i", input.ir, ...(input.bed === undefined ? [] : ["-i", input.bed.file])];
  const irIdx = lines.length + 1;
  const g = [`[${irIdx}:a]aresample=${SR},asplit=${lines.length}${lines.map((_, i) => `[ir${i}]`).join("")}`];
  lines.forEach((l, i) => {
    const gain = l.lufs === undefined ? [] : [gainStage(gainDb(l.lufs, l.direction, l.off))];
    g.push(`[${i + 1}:a]${[monoIn(), ...trimStage(l, totalS), ...gain, toneStage(), panStage(panOf(l.x, l.off))].join(",")}[p${i}]`);
    g.push(...roomStage(`p${i}`, `ir${i}`, `r${i}`, l.off === true ? ROOM_WET_OFFSCREEN_DB : ROOM_WET_DB));
    g.push(`[r${i}]${placeStage(l.startS)}[l${i}]`);
  });
  g.push(`${lines.map((_, i) => `[l${i}]`).join("")}amix=inputs=${lines.length}:duration=longest:normalize=0,asetpts=N/SR/TB,apad,atrim=end=${total}[vbus]`);
  if (tap === "voice") g.push("[vbus]anull[a]");
  else if (input.bed === undefined) g.push("[vbus]anull[pre]");
  else {
    g.push(`[${irIdx + 1}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${fx(input.bed.gainDb, 2)}dB,apad,atrim=end=${total}[bed]`);
    g.push("[vbus]asplit=2[vkey][vmix]", `[bed][vkey]${DUCK_FILTER}[ducked]`);
    g.push(tap === "bed" ? "[ducked]anull[a]" : "[ducked][vmix]amix=inputs=2:normalize=0:duration=first[pre]");
  }
  return { inputArgs, graph: g };
}

/** Pass 1: the mix measured to null; loudnorm's JSON on stderr (loudnormMeasured). No shell. Pure. */
export function dialogueMeasureArgs(input: DialogueMixInput): string[] {
  const { inputArgs, graph } = dialogueGraph(input);
  return ["-hide_banner", "-nostats", "-y", ...inputArgs, "-filter_complex", [...graph, `[pre]${loudPass1()}[a]`].join(";"), "-map", "[a]", "-f", "null", "-"];
}

/** Pass 2: the picture with the dialogue mix and no native sound. Without a measure, the single-pass EXPORT_LOUDNORM. Pure. */
export function dialogueMixArgs(input: DialogueMixInput, measured?: LoudnormMeasure): string[] {
  const { inputArgs, graph } = dialogueGraph(input);
  const loud = measured === undefined ? `${EXPORT_LOUDNORM},aresample=${SR}` : loudPass2(measured);
  return ["-v", "error", "-y", ...inputArgs, "-filter_complex", [...graph, `[pre]${loud}[a]`].join(";"), "-map", "0:v", "-map", "[a]", "-t", fx(input.totalS, 3), "-c:v", "copy", "-c:a", "aac", "-b:a", "384k", "-ar", String(SR), "-movflags", "+faststart", input.out];
}

/** A stem (the voice bus or the ducked bed) as a float WAV, for a measurement. Pure. */
export function dialogueStemArgs(input: DialogueMixInput, tap: Exclude<DialogueTap, "mix">): string[] {
  const { inputArgs, graph } = dialogueGraph(input, tap);
  return ["-v", "error", "-y", ...inputArgs, "-filter_complex", graph.join(";"), "-map", "[a]", "-c:a", "pcm_f32le", "-ar", String(SR), input.out];
}

/** The argv that reports a line segment's integrated loudness (ebur128 on stderr; parseEbur128 reads it). Pure. */
export const dialogueLoudnessArgs = (file: string, trimS = 0): string[] => ["-hide_banner", "-nostats", "-i", file, "-af", [monoIn(), ...trimStage({ trimS, startS: 0 }, Infinity), "ebur128=framelog=quiet"].join(","), "-f", "null", "-"];

/** loudnorm's last JSON report on stderr, or undefined. Pure. */
export function loudnormMeasured(stderr: string): (LoudnormMeasure & { readonly normalization_type?: string }) | undefined {
  const all = stderr.match(/{[^{}]*}/g);
  if (all === null) return undefined;
  try {
    const m = JSON.parse(all[all.length - 1] ?? "") as Partial<LoudnormMeasure> & { readonly normalization_type?: string };
    const keys = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const;
    return keys.every((k) => typeof m[k] === "string") ? (m as LoudnormMeasure & { readonly normalization_type?: string }) : undefined;
  } catch {
    return undefined;
  }
}
