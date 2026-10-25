// THE MUSIC-VIDEO STEPS - what each step does to one track, against a fresh read
// of its record, and the engines it reaches outside this process. Server-only.
// Moved out of ./queue.ts when the queue's worker became a kernel job
// (Phase 4, lib/producers/mv.ts drives it; packages/producers/src/mv is the
// plan). The step bodies are v1's, unchanged in what they make:
//
//   fetch     the track's bytes into mv/<jobId>/audio.<ext>
//   analyse   envelope + MvAnalysis                 (./render.ts)
//   treat     the still prompt + motion             (./treatment.ts, a text turn)
//   motion    new motion only, same still           (a Regenerate · motion)
//   still     one Leonardo still                    (lib/imaging generate), or
//             the operator's own picture, copied, never bought
//   metadata  title, description, tags              (./metadata.ts, a text turn)
//   video     the 1080p mp4                         (./render.ts)
//
// A FILE LANDS WHOLE OR NOT AT ALL: an engine writes beside the final name and
// ./store.ts landFile renames it over the old one only when it exists whole, so
// a Regenerate keeps the old render until the new one lands.

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { leonardoStudioHealth } from "@/lib/imaging/providers/leonardoStudio";
import { generate } from "@/lib/imaging/router";

import { filePathAbs } from "../store";
import { fetchAudio, fetchClipBytes, type FetchClipFn } from "./fetchAudio";
import { MV_LOOK_NOTES } from "./looks";
import { writeMetadata } from "./metadata";
import { analyseTrack, renderMusicVideo, type AnalyseArgs, type RenderArgs } from "./render";
import { cleanTitle, ensureJobDir, jobFileRel, landFile, stagingAbs, type MvStep } from "./store";
import { operatorTreatment, treatmentInput, writeMotion, writeTreatment, type ReasonFn } from "./treatment";
import type { MvAnalysis, MvDriverHealth, MvFiles, MvJob, MvPart } from "./types";

export interface StillRequest {
  prompt: string;
  negativePrompt?: string;
}
export interface StillImage {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg" | "image/webp";
}

/** Everything a step reaches outside this process. Production uses the
 *  defaults; a test binds fakes through lib/producers/mv.ts `mvProducer`. */
export interface MvEngines {
  analyse(args: AnalyseArgs): Promise<MvAnalysis>;
  render(args: RenderArgs): Promise<{ durationS: number }>;
  still(req: StillRequest): Promise<StillImage>;
  fetchClip: FetchClipFn;
  reason?: ReasonFn;
  /** Is the still vendor reachable? Asked by the snapshot, and before a job that buys a still. */
  health(): Promise<MvDriverHealth>;
}

/** The studio pool, by name. The router reaches `leonardo-studio` ONLY when a
 *  request prefers it, and then alone (lib/imaging/router.ts PREFER_ONLY): a
 *  closed studio browser fails this still with the studio's own sentence and
 *  never moves it onto a vendor billed in dollars. The real studio answers
 *  JPEG, so the mime travels with the bytes and names the file. */
async function studioStill(req: StillRequest): Promise<StillImage> {
  const out = await generate({ prompt: req.prompt, ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}), aspect: "16:9", count: 1, prefer: "leonardo-studio" });
  const img = out.images[0];
  if (!img) throw new Error(`${out.provenance.provider} returned no image`);
  return { bytes: Buffer.from(img.base64, "base64"), mime: img.mime };
}

export const DEFAULT_ENGINES: MvEngines = {
  analyse: analyseTrack,
  render: renderMusicVideo,
  still: studioStill,
  fetchClip: fetchClipBytes,
  health: leonardoStudioHealth,
};

const STILL_EXT: Record<StillImage["mime"], string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

const MIME_OF_EXT: Record<string, StillImage["mime"]> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** The operator's own picture, read from disk. */
async function suppliedStill(file: string): Promise<StillImage> {
  const mime = MIME_OF_EXT[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`${file} is not a png, jpg or webp picture`);
  return { bytes: await readFile(file), mime };
}

/** The treatment of a job whose picture was supplied: no prompt to write, the
 *  motion defaults kept, and the metadata turn told why this picture. */
function suppliedStillTreatment(current: MvJob["treatment"]): NonNullable<MvJob["treatment"]> {
  return { ...operatorTreatment("the album's own cover art", current), rationale: "the album's own cover art" };
}

const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined || v === null) throw new Error(`cannot continue: ${what} is missing`);
  return v;
};

/** One step against a fresh read of the job. Returns the patch that lands it.
 *  `landing` is asked right before a file replaces its old one: a driver that
 *  lost its lease must not rename its still or render over the new holder's. */
export async function runStep(step: MvStep, j: MvJob, eng: MvEngines, landing: () => void = () => undefined): Promise<(x: MvJob) => void> {
  const abs = (k: keyof MvFiles) => filePathAbs(need(j.files[k], `the ${k} file`));
  const title = cleanTitle(j.source.title);
  const input = () => treatmentInput(title, need(j.analysis, "the analysis"));
  const noteFor = (part: MvPart) => (j.redo?.includes(part) ? j.note : undefined);
  await ensureJobDir(j.id);
  switch (step) {
    case "fetch": {
      const rel = await fetchAudio(j.id, j.source, eng.fetchClip);
      return (x) => void (x.files.audio = rel);
    }
    case "analyse": {
      const rel = jobFileRel(j.id, "envelope.json");
      const analysis = await eng.analyse({ audioPath: abs("audio"), envelopePath: filePathAbs(rel) });
      return (x) => {
        x.analysis = analysis;
        x.files.envelope = rel;
      };
    }
    case "treat": {
      // The step runs on a first run or an image redo; either way a prompt the
      // operator set (enqueue or regenerate) replaces the turn.
      const treatment = j.stillFrom ? suppliedStillTreatment(j.treatment) : j.prompt ? operatorTreatment(j.prompt, j.treatment) : await writeTreatment(input(), { note: noteFor("image"), reason: eng.reason });
      return (x) => void (x.treatment = treatment);
    }
    case "motion": {
      const treatment = await writeMotion(input(), need(j.treatment, "the treatment"), { note: noteFor("motion"), reason: eng.reason });
      return (x) => void (x.treatment = treatment);
    }
    case "still": {
      const t = need(j.treatment, "the treatment");
      // A supplied picture (the album's cover) is copied, never bought.
      const img = j.stillFrom ? await suppliedStill(j.stillFrom) : await eng.still({ prompt: t.prompt, ...(t.negativePrompt ? { negativePrompt: t.negativePrompt } : {}) });
      if (!img.bytes.byteLength) throw new Error("the still came back empty");
      const rel = jobFileRel(j.id, `still.${STILL_EXT[img.mime] ?? "png"}`);
      const staged = stagingAbs(rel);
      try {
        await writeFile(staged, img.bytes);
        landing();
      } catch (e) {
        await rm(staged, { force: true }).catch(() => {});
        throw e;
      }
      await landFile(staged, rel);
      const old = j.files.still;
      if (old && old !== rel) await rm(filePathAbs(old), { force: true });
      return (x) => void (x.files.still = rel);
    }
    case "metadata": {
      const metadata = await writeMetadata(input(), { rationale: j.treatment?.rationale, note: noteFor("metadata"), ...(j.look ? { picture: MV_LOOK_NOTES[j.look] } : {}), reason: eng.reason });
      return (x) => void (x.metadata = metadata);
    }
    case "video": {
      const rel = jobFileRel(j.id, "video.mp4");
      const staged = stagingAbs(rel);
      try {
        await eng.render({ audioPath: abs("audio"), stillPath: abs("still"), envelopePath: abs("envelope"), motion: need(j.treatment, "the treatment").motion, ...(j.look ? { look: j.look } : {}), outPath: staged });
        landing();
      } catch (e) {
        await rm(staged, { force: true }).catch(() => {});
        throw e;
      }
      await landFile(staged, rel);
      return (x) => void (x.files.video = rel);
    }
  }
}
