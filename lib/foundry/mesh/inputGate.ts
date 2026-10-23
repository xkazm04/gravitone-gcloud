// THE CONCEPT'S INPUT GATE (spark game-3d-assets WP2) - before a GPU minute is spent on a mesh,
// is this picture reconstructable? (game-production: image-to-3d-input-gating, technique
// single-subject-plain-background.) An image-to-3D model reproduces what it is fed: a busy
// background becomes attached geometry, a second subject a fused mass, a limb clipped by the frame
// an amputation - and nothing downstream removes any of it. So three mechanical checks, each one
// the technique's procedure made deterministic, over the concept decoded to 256 x 256 RGBA:
//
//   background  a SMOOTH field (or transparent): the ring is cut into short runs, each run's median is
//               the background there, and the field inside is interpolated from the four sides. A
//               studio gradient or vignette is background; clutter is not: `busy-background` fails
//               below 0.75 of the ring within 24 levels of its local field, `uneven-background` warns
//               below 0.97. (Calibrated 2026-10-22 on the operator's round-4 concepts: one median for
//               the whole ring read a vignette's dark corners as foreground and refused every hero.)
//   subjects    foreground (over 40 levels from the background, or opaque on a transparent field)
//               falls into ONE subject - 8-connected regions whose boxes overlap or lie within 3% of
//               the frame are one subject (a grey fur or metal near a grey ground splits a figure):
//               `multiple-subjects` fails when a second subject holds 8% of the largest; specks under 0.1% of the frame are counted only;
//               `no-subject` fails when the largest holds under 0.5% of the frame
//   in frame    `subject-cropped` (the technique's hard fail) when the subject runs along more than 10%
//               of any outermost row or column - a limb or a weapon cut by the frame; a touch shorter
//               than that (a fingertip) warns `touches-edge`; `tight-margin` warns inside 2% of an edge;
//               `subject-small` warns when the subject spans under a quarter of both axes
//
// A pass is not a quality claim: the gate judges reconstructability, never the design. The
// thresholds are this repo's (no PoF scorer exists for it - PoF's input gate is a VLM call), and
// INPUT_GATE_VERSION (./gates/version.ts) names them. A concept that cannot be decoded is
// `unmeasured`, and the launch treats that as a refusal: an ungated picture is not a gated one.
//
// The decode is ffmpeg (FFMPEG, else on PATH), bounded, as lib/producers/media-facts.ts shells to
// it: the repo carries no image library, and ffmpeg reads every format a concept arrives in.

import { execFile } from "node:child_process";

import { INPUT_GATE_VERSION } from "./gates/version";
import type { Measured } from "./grade";
import type { GateResult } from "./types";

export const INPUT_SIZE = 256;
export type Pixels = { readonly width: number; readonly height: number; readonly rgba: Uint8Array };

const RING = 3;
const BG_NEAR = 24;
const FG_FAR = 40;
const UNIFORM_FAIL = 0.75;
const UNIFORM_WARN = 0.97;
const SPECK_SHARE = 0.001;
const SUBJECT_MIN_SHARE = 0.005;
const SECOND_SUBJECT_SHARE = 0.08;
const MARGIN_SHARE = 0.02;
const CROP_SHARE = 0.1;
/** Regions whose boxes overlap or lie within this share of the frame are one subject (a grey fur or metal close to a grey ground splits one figure). */
const JOIN_SHARE = 0.03;
/** Ring runs the background field is read from, per side. */
const SEGMENTS = 16;
const SMALL_SHARE = 0.25;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

/** Grade decoded pixels. Pure. */
export function gradeConcept(px: Pixels): GateResult {
  const { width: W, height: H, rgba } = px;
  const at = (x: number, y: number, c: number): number => rgba[(y * W + x) * 4 + c] ?? 0;
  const border: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < RING || y < RING || x >= W - RING || y >= H - RING) border.push([x, y]);

  const transparent = border.filter(([x, y]) => at(x, y, 3) < 16).length >= 0.9 * border.length;
  // The background field: each side's ring cut into SEGMENTS runs, a run's median colour its value,
  // linear between run centres; inside, the mean of the top-bottom and left-right interpolations.
  const side = (pts: (i: number) => [number, number][], n: number): number[][] => {
    const runs = Array.from({ length: SEGMENTS }, (_, k) => {
      const from = Math.floor((k * n) / SEGMENTS);
      const to = Math.max(from + 1, Math.floor(((k + 1) * n) / SEGMENTS));
      const ps: [number, number][] = [];
      for (let i = from; i < to; i++) ps.push(...pts(i));
      return [0, 1, 2].map((c) => median(ps.map(([x, y]) => at(x, y, c))));
    });
    return Array.from({ length: n }, (_, i) => {
      const t = (i * SEGMENTS) / n - 0.5;
      const k0 = Math.max(0, Math.min(SEGMENTS - 1, Math.floor(t)));
      const k1 = Math.min(SEGMENTS - 1, k0 + 1);
      const f = Math.max(0, Math.min(1, t - k0));
      return [0, 1, 2].map((c) => (runs[k0]?.[c] ?? 0) * (1 - f) + (runs[k1]?.[c] ?? 0) * f);
    });
  };
  const ring = (fix: (i: number, r: number) => [number, number]) => (i: number): [number, number][] => Array.from({ length: RING }, (_, r) => fix(i, r));
  const top = side(ring((i, r) => [i, r]), W);
  const bottom = side(ring((i, r) => [i, H - 1 - r]), W);
  const left = side(ring((i, r) => [r, i]), H);
  const right = side(ring((i, r) => [W - 1 - r, i]), H);
  const field = (x: number, y: number, c: number): number => {
    const v = (top[x]?.[c] ?? 0) * (1 - y / (H - 1)) + (bottom[x]?.[c] ?? 0) * (y / (H - 1));
    const h = (left[y]?.[c] ?? 0) * (1 - x / (W - 1)) + (right[y]?.[c] ?? 0) * (x / (W - 1));
    return (v + h) / 2;
  };
  const dist = (x: number, y: number): number => Math.max(...[0, 1, 2].map((c) => Math.abs(at(x, y, c) - field(x, y, c))));
  const uniformity = transparent ? 1 : border.filter(([x, y]) => dist(x, y) <= BG_NEAR).length / border.length;
  const fg = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) fg[y * W + x] = (transparent ? at(x, y, 3) >= 128 : at(x, y, 3) >= 16 && dist(x, y) > FG_FAR) ? 1 : 0;

  // 8-connected components, iterative flood fill.
  const label = new Int32Array(W * H).fill(-1);
  const comps: { size: number; x0: number; y0: number; x1: number; y1: number; edge: boolean; top: number; bottom: number; left: number; right: number }[] = [];
  for (let start = 0; start < W * H; start++) {
    if (fg[start] !== 1 || label[start] !== -1) continue;
    const c = { size: 0, x0: W, y0: H, x1: -1, y1: -1, edge: false, top: 0, bottom: 0, left: 0, right: 0 };
    const stack = [start];
    label[start] = comps.length;
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      const x = i % W;
      const y = (i - x) / W;
      c.size++;
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) c.edge = true;
      if (y === 0) c.top++;
      if (y === H - 1) c.bottom++;
      if (x === 0) c.left++;
      if (x === W - 1) c.right++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (fg[j] === 1 && label[j] === -1) {
            label[j] = comps.length;
            stack.push(j);
          }
        }
      }
    }
    comps.push(c);
  }
  const area = W * H;
  const kept = comps.filter((c) => c.size >= SPECK_SHARE * area).sort((a, b) => b.size - a.size);
  const largest = kept[0];
  // Join regions whose boxes overlap or nearly touch into one subject, then count subjects.
  type Box = (typeof comps)[number];
  const gap = JOIN_SHARE * Math.min(W, H);
  const near = (a: Box, b: Box): boolean => a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;
  const joined: Box[] = [];
  for (const c of kept) {
    const into = joined.find((j) => near(j, c));
    if (into === undefined) joined.push({ ...c });
    else Object.assign(into, { size: into.size + c.size, x0: Math.min(into.x0, c.x0), y0: Math.min(into.y0, c.y0), x1: Math.max(into.x1, c.x1), y1: Math.max(into.y1, c.y1), edge: into.edge || c.edge, top: into.top + c.top, bottom: into.bottom + c.bottom, left: into.left + c.left, right: into.right + c.right });
  }
  joined.sort((a, b) => b.size - a.size);
  const subjects = largest === undefined ? [] : joined.filter((c) => c.size >= SECOND_SUBJECT_SHARE * (joined[0]?.size ?? largest.size));
  const specks = comps.length - kept.length;

  const fails: string[] = [];
  const warns: string[] = [];
  const pct = (x: number): string => `${Math.round(x * 1000) / 10}%`;
  if (uniformity < UNIFORM_FAIL) fails.push(`busy-background: ${pct(uniformity)} of the border is the background colour (under ${pct(UNIFORM_FAIL)})`);
  else if (uniformity < UNIFORM_WARN) warns.push(`uneven-background: ${pct(uniformity)} of the border is the background colour (under ${pct(UNIFORM_WARN)})`);
  if (largest === undefined || largest.size < SUBJECT_MIN_SHARE * area) {
    fails.push(`no-subject: the largest foreground region holds ${pct((largest?.size ?? 0) / area)} of the frame (under ${pct(SUBJECT_MIN_SHARE)})`);
  } else {
    if (subjects.length > 1) fails.push(`multiple-subjects: ${subjects.length} separate regions of ${subjects.map((s) => pct(s.size / area)).join(", ")} of the frame`);
    const box = { x0: Math.min(...subjects.map((s) => s.x0)), y0: Math.min(...subjects.map((s) => s.y0)), x1: Math.max(...subjects.map((s) => s.x1)), y1: Math.max(...subjects.map((s) => s.y1)) };
    const along = Math.max(...subjects.map((s) => Math.max(s.top / W, s.bottom / W, s.left / H, s.right / H)));
    if (along > CROP_SHARE) fails.push(`subject-cropped: the subject runs along ${pct(along)} of a frame edge (over ${pct(CROP_SHARE)})`);
    else if (subjects.some((s) => s.edge)) warns.push(`touches-edge: the subject touches the frame along ${pct(along)} of an edge`);
    else {
      const margin = Math.min(box.x0, box.y0, W - 1 - box.x1, H - 1 - box.y1);
      if (margin < MARGIN_SHARE * Math.min(W, H)) warns.push(`tight-margin: ${margin} px from the edge at ${W} x ${H} (under ${pct(MARGIN_SHARE)})`);
    }
    if ((box.x1 - box.x0 + 1) / W < SMALL_SHARE && (box.y1 - box.y0 + 1) / H < SMALL_SHARE) warns.push(`subject-small: the subject spans ${box.x1 - box.x0 + 1} x ${box.y1 - box.y0 + 1} of ${W} x ${H}`);
  }
  return {
    name: "input",
    version: INPUT_GATE_VERSION,
    score: Math.max(0, 100 - fails.length * 50 - warns.length * 15),
    verdict: fails.length > 0 ? "fail" : warns.length > 0 ? "warn" : "pass",
    fails,
    warns,
    metrics: { borderUniformity: Math.round(uniformity * 1000) / 1000, subjects: subjects.length, specks, subjectShare: Math.round(((largest?.size ?? 0) / area) * 1000) / 1000, transparent },
    gradedAs: "single subject, plain background, whole in frame (image-to-3d-input-gating)",
  };
}

const TIMEOUT_MS = 30_000;

/** The concept as 256 x 256 RGBA through ffmpeg, or the decoder's own sentence. */
export function decodeConcept(file: string, bin: string = process.env["FFMPEG"] ?? "ffmpeg"): Promise<Measured<Pixels>> {
  const args = ["-v", "error", "-i", file, "-vf", `scale=${INPUT_SIZE}:${INPUT_SIZE}:flags=area`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"];
  return new Promise((resolve) => {
    execFile(bin, args, { encoding: "buffer", timeout: TIMEOUT_MS, maxBuffer: 4 * INPUT_SIZE * INPUT_SIZE + 1024, windowsHide: true }, (e, stdout, stderr) => {
      if (e !== null) {
        const said = stderr.toString("utf8").trim().split("\n").slice(-3).join(" | ");
        resolve({ ok: false, why: `ffmpeg could not decode the concept: ${said !== "" ? said : e.message}` });
      } else if (stdout.byteLength !== 4 * INPUT_SIZE * INPUT_SIZE) {
        resolve({ ok: false, why: `ffmpeg returned ${stdout.byteLength} bytes for a ${INPUT_SIZE} x ${INPUT_SIZE} RGBA frame` });
      } else resolve({ ok: true, value: { width: INPUT_SIZE, height: INPUT_SIZE, rgba: new Uint8Array(stdout) } });
    });
  });
}

export type Decode = (file: string) => Promise<Measured<Pixels>>;

/** The gate over a concept file: graded, or `unmeasured` with the decoder's sentence. */
export async function inputGate(file: string, decode: Decode = (f) => decodeConcept(f)): Promise<GateResult> {
  const px = await decode(file);
  if (!px.ok) return { name: "input", version: INPUT_GATE_VERSION, verdict: "unmeasured", fails: [], warns: [`unmeasured: ${px.why}`] };
  return gradeConcept(px.value);
}

/** Whether a gate verdict lets the mesh launch: a pass or a warn. A fail and an unmeasured refuse. */
export const admitsMesh = (g: GateResult): boolean => g.verdict === "pass" || g.verdict === "warn";
