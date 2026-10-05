// THE CUT'S ANIMATIC EXPORT — a compiled CutDocument in, an mp4 on the publish
// shelf out. Server-only. Card frames-score-cut-B.
//
// WHAT IT RENDERS. The document (app/_phases/cut/cutDocument.ts) is the edit
// decision list; this module only executes it. Picture: each segment is ONE
// still held for its duration (an animatic, so no per-frame capture), scaled
// to cover 1920x1080, a gap is black. Audio: every take segment is read by id
// from the sound store, trimmed to its span and delayed to its dialled start;
// takes are mixed, and the soundtrack is padded and cut to the ruler, so the
// file is `totalS` long whatever the takes measure.
//
// WHAT IT DOES NOT DRAW YET, SAID HERE AND IN THE RESULT. A still is the
// frame's PLATE. The elements and texts FrameCanvas composites over it are in
// the document's layer snapshot but not on the picture: drawing them belongs
// to the page that already draws them (frames/parts.tsx, Tailwind + CSS vars),
// and re-implementing that compositor here would make the export and the
// monitor two pictures that drift. The result's `drawn: "plates"` says which
// layers made it, so nobody reads a plate-only animatic as the composite.
//
// WHY ffmpeg's FILTER GRAPH, NOT THE CONCAT DEMUXER the card sketched. The
// demuxer wants every input the same size and codec; plates are whatever the
// vendor returned (data: URLs of PNG/JPEG/WebP at their own sizes). One graph
// normalises each still on its own branch, then concatenates — and a gap is a
// `color` source of exactly its hold, so it needs no file at all.
//
// WHERE IT LANDS. `exportsRoot()` (lib/publish/exports.ts) — the directory the
// publish calendar lists — through the kernel's atomic landing, with a sidecar
// that carries the project and the finish line's verdicts at export time.

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CutDocument } from "@/app/_phases/cut/cutDocument";
import { cutDocumentHash } from "@/app/_phases/cut/cutDocument";
import type { FinishCheck } from "@/app/_phases/cut/finishLine";

import {
  ExportError,
  assertCanSpawn,
  cleanUpExport,
  landExport,
  makeWorkDir,
  partialPath,
  run,
  videoArgs,
  withEncoderFallback,
  type Encoder,
} from "./export/headless";
import { exportsRoot } from "./publish/exports";
import { filePathAbs } from "./sound/store";
import { getTake } from "./sound/takes";

export { ExportError };

export const CUT_FPS = 25;
const W = 1920;
const H = 1080;

export interface CutExportRequest {
  document: CutDocument;
  projectId: string | null;
}

export interface CutSidecar {
  projectId: string | null;
  kind: "cut-animatic";
  /** cutDocumentHash of what was rendered: the version, for a diff. */
  document: string;
  totalS: number;
  /** The finish line as it stood when the animatic was made. */
  finish: FinishCheck[];
  gaps: { picture: number; audio: number };
}

export interface CutExportResult {
  id: string;
  encoder: Encoder;
  width: number;
  height: number;
  fps: number;
  durationS: number;
  /** Which layers are on the picture. */
  drawn: "plates";
  /** Segments the document held that the server could not reach, by ref. */
  unreachable: { unitRef?: string; takeId?: string; why: string }[];
  sidecar: CutSidecar;
  wallMs: number;
  sizeBytes: number;
}

export function cutSidecar(doc: CutDocument, projectId: string | null): CutSidecar {
  return {
    projectId,
    kind: "cut-animatic",
    document: cutDocumentHash(doc),
    totalS: doc.totalS,
    finish: doc.finish,
    gaps: {
      picture: doc.picture.filter((p) => p.kind === "gap").length,
      audio: doc.audio.filter((a) => a.kind === "gap").length,
    },
  };
}

/* ── the request, held to the document's shape ─────────────────────────────── */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The document as the route received it, or a sentence saying why it is not
 *  one. Shape only: what the segments MEAN was decided when it was compiled. */
export function checkCutDocument(v: unknown): CutDocument | string {
  if (!isObj(v)) return "`document` is required: the compiled cut.";
  if (v.v !== 1) return "`document.v` must be 1 — a document from another build cannot be rendered by this one.";
  if (!isNum(v.totalS) || v.totalS <= 0) return "The cut has nothing on its clock to render.";
  if (!Array.isArray(v.picture) || v.picture.length === 0) return "The cut has no picture segments.";
  if (!Array.isArray(v.audio) || !Array.isArray(v.finish)) return "`document` is missing its audio or finish line.";
  let sum = 0;
  for (const p of v.picture) {
    if (!isObj(p) || !isNum(p.durS) || p.durS <= 0 || typeof p.unitRef !== "string") return "A picture segment has no hold.";
    if (p.kind === "still") {
      if (!isObj(p.layers) || typeof p.layers.plate !== "string") return `Picture segment ${p.unitRef} is a still with no plate.`;
    } else if (p.kind !== "gap") return `Picture segment ${p.unitRef} is neither a still nor a gap.`;
    sum += p.durS;
  }
  if (Math.abs(sum - v.totalS) > 0.01) return "The picture segments do not sum to the cut's length.";
  for (const a of v.audio) {
    if (!isObj(a) || !isNum(a.startS) || !isNum(a.durS)) return "An audio segment has no place on the clock.";
    if (a.kind === "take" && typeof a.takeId !== "string") return "An audio take names no take id.";
  }
  return v as unknown as CutDocument;
}

/* ── the ffmpeg plan, pure ─────────────────────────────────────────────────── */

/** Seconds as ffmpeg reads them, to the millisecond, no trailing zeros. */
const sec = (s: number) => String(Math.round(s * 1000) / 1000);

/**
 * The whole render as one ffmpeg argument list.
 *
 * @param inputs files the server resolved: a plate per still (by unitRef) and
 *               the bytes per take (by takeId). A still or take missing here
 *               renders as a gap — the caller reports it as unreachable.
 */
export function cutExportArgs(
  doc: CutDocument,
  inputs: { stills: Record<string, string>; takes: Record<string, string> },
  outPath: string,
  encoder: Encoder,
): string[] {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  const graph: string[] = [];
  let n = 0;

  const black = `color=c=black:s=${W}x${H}:r=${CUT_FPS}`;
  doc.picture.forEach((p, i) => {
    const file = p.kind === "still" ? inputs.stills[p.unitRef] : undefined;
    if (file) args.push("-loop", "1", "-framerate", String(CUT_FPS), "-t", sec(p.durS), "-i", file);
    else args.push("-f", "lavfi", "-t", sec(p.durS), "-i", black);
    graph.push(
      `[${n}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${CUT_FPS},format=yuv420p,trim=duration=${sec(p.durS)},setpts=PTS-STARTPTS[v${i}]`,
    );
    n++;
  });
  graph.push(`${doc.picture.map((_, i) => `[v${i}]`).join("")}concat=n=${doc.picture.length}:v=1:a=0[v]`);

  const mixed: string[] = [];
  for (const a of doc.audio) {
    if (a.kind !== "take") continue;
    const file = inputs.takes[a.takeId];
    if (!file) continue;
    args.push("-i", file);
    // A block nudged before zero starts late into its own take instead.
    const skip = Math.max(0, -a.startS);
    const delayMs = Math.round(Math.max(0, a.startS) * 1000);
    const label = `a${mixed.length}`;
    graph.push(
      `[${n}:a]atrim=start=${sec(skip)}:duration=${sec(Math.max(0, a.durS - skip))},asetpts=PTS-STARTPTS,aresample=48000,adelay=${delayMs}:all=1[${label}]`,
    );
    mixed.push(`[${label}]`);
    n++;
  }
  if (mixed.length === 0) {
    args.push("-f", "lavfi", "-t", sec(doc.totalS), "-i", "anullsrc=r=48000:cl=stereo");
    graph.push(`[${n}:a]anull[a]`);
  } else {
    // Pad then cut: the soundtrack is exactly the ruler, never the longest take.
    const mix = mixed.length === 1 ? mixed[0] : `${mixed.join("")}amix=inputs=${mixed.length}:normalize=0:duration=longest,`;
    graph.push(`${mix}apad,atrim=duration=${sec(doc.totalS)}[a]`);
  }

  args.push(
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]",
    ...videoArgs(encoder),
    "-pix_fmt", "yuv420p",
    "-r", String(CUT_FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-t", sec(doc.totalS),
    "-movflags", "+faststart",
    outPath,
  );
  return args;
}

/* ── resolving what the document names ─────────────────────────────────────── */

const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp" };

/** A plate's bytes on disk for ffmpeg, or why the server cannot reach it. A
 *  plate is a data: URL or a public path (frames.ts `Plate.src`); a public
 *  path is held inside `public/`. */
async function resolvePlate(src: string, workDir: string, name: string): Promise<string | { why: string }> {
  const data = /^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/.exec(src);
  if (data) {
    const ext = IMAGE_EXT[data[1].toLowerCase()];
    if (!ext) return { why: `plate is ${data[1]}, not an image ffmpeg is handed` };
    const file = path.join(workDir, `${name}.${ext}`);
    await writeFile(file, Buffer.from(data[2], "base64"));
    return file;
  }
  if (src.startsWith("/") && !src.startsWith("//")) {
    const pub = path.join(process.cwd(), "public");
    const file = path.resolve(pub, "." + decodeURIComponent(src.split("?")[0]));
    if (!file.startsWith(pub + path.sep)) return { why: "plate path leaves public/" };
    return file;
  }
  return { why: "plate is not a data: URL or a public path" };
}

/**
 * Run one animatic export, end to end. Throws `ExportError` for every refusal
 * it can name; an unexpected ffmpeg failure is left to the route's 500.
 */
export async function runCutExport(req: CutExportRequest): Promise<CutExportResult> {
  assertCanSpawn("The animatic export needs to spawn ffmpeg on this machine");
  const checked = checkCutDocument(req.document);
  if (typeof checked === "string") throw new ExportError(checked, "bad-request");
  const doc = checked;

  const id = randomUUID();
  const t0 = Date.now();
  const root = exportsRoot();
  const workDir = await makeWorkDir("cut-export-");
  try {
    const unreachable: CutExportResult["unreachable"] = [];
    const stills: Record<string, string> = {};
    for (const [i, p] of doc.picture.entries()) {
      if (p.kind !== "still") continue;
      const got = await resolvePlate(p.layers.plate, workDir, `still-${i}`);
      if (typeof got === "string") stills[p.unitRef] = got;
      else unreachable.push({ unitRef: p.unitRef, why: got.why });
    }
    const takes: Record<string, string> = {};
    for (const a of doc.audio) {
      if (a.kind !== "take" || takes[a.takeId]) continue;
      try {
        const take = await getTake(a.takeId);
        if (take.file) takes[a.takeId] = filePathAbs(take.file.path);
        else unreachable.push({ takeId: a.takeId, why: "take has no audio" });
      } catch {
        // Gone since the document was compiled: rendered as silence, and said.
        unreachable.push({ takeId: a.takeId, why: "take gone from the store" });
      }
    }

    await mkdir(root, { recursive: true });
    const outPath = partialPath(root, id);
    const encoder = await withEncoderFallback("cut/export", (enc) =>
      run("ffmpeg", cutExportArgs(doc, { stills, takes }, outPath, enc), { maxBuffer: 1 << 26 }).then(() => undefined),
    );

    const sidecar = cutSidecar(doc, req.projectId);
    const { sizeBytes } = await landExport({ root, id, finalPath: path.join(root, `${id}.mp4`), sidecar });
    return {
      id,
      encoder,
      width: W,
      height: H,
      fps: CUT_FPS,
      durationS: doc.totalS,
      drawn: "plates",
      unreachable,
      sidecar,
      wallMs: Date.now() - t0,
      sizeBytes,
    };
  } finally {
    await cleanUpExport({ workDir, root, id });
  }
}
