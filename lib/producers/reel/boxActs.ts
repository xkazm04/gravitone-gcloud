// THE REEL'S BOX JOBS (spark reel-studio WP2): `reel-render` draws the film on the GPU, `reel-release` lays the bed
// and encodes the publish copies. Local tools only, no vendor: a dry job runs them exactly as a live one does (the
// only thing dry changes in a reel is the seat).
//
//   stills          8 timeline frames per face into film/stills/, on the page that will render - the cheap look
//                   before a 15-minute master, and the check that the page's REEL.frames is the film's
//   render:<face>   the master, streamed into ffmpeg; film/progress.json every 30 frames; ffprobe, sha, the state.
//                   A face whose master is in the state and on disk is adopted, never drawn again.
//   thumbs          12 jpgs per face and the poster, read off the masters
//   mix:<face>      the bed laid under the master (desktop as-is, phone at atempo 2)
//   encode:<face>   the mix to its size (2-pass x264), sha, the state
//   vmaf            each copy's picture against its master: a reading recorded on the copy, never a gate
//
// A render that throws is a vendor failure, not the job's end: the kernel plans the same face again (a crash
// restarts the face), and three in a row fail the job with the last sentence.

import { existsSync } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { EventData } from "@gt/domain/event";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { faceFrames, progressDue, spreadFrames, STILLS_PER_FACE, THUMBS_PER_FACE } from "@gt/producers/reel/define";
import { madePaid } from "@gt/producers/research/partAct";

import { FILM_FACES, FILM_SPEC, type FilmFace, type FilmRecord, type ReelState } from "../../reel/types.ts";
import type { ReelEngines } from "./engines.ts";
import { clearProgress, filmDirOf, mutateState, readState, sharedDataDir, writeProgress } from "./folder.ts";

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const now = (): string => new Date().toISOString();
const msg = (x: unknown): string => (x instanceof Error ? x.message : String(x));
const refused = (message: string): StepOutcome => ({ kind: "fatal", code: "refused", message });

const filmOf = (s: ReelState): FilmRecord | undefined => s.film;

const siteOf = (dir: string, face: FilmFace) => {
  const spec = FILM_SPEC[face];
  return { filmDir: filmDirOf(dir), sharedData: sharedDataDir(), page: spec.page, width: spec.width, height: spec.height };
};

/* ── reel-render ──────────────────────────────────────────────────────────── */

async function stillsAct(e: ReelEngines, dir: string, film: FilmRecord, ctx: StepContext): Promise<StepOutcome> {
  const at = spreadFrames(film.frames, STILLS_PER_FACE);
  const written: Record<string, string[]> = {};
  for (const face of FILM_FACES) {
    const shots = at.map((frame, k) => ({ frame, out: path.join(filmDirOf(dir), "stills", `${face}-${String(k).padStart(2, "0")}.png`) }));
    let r;
    try {
      r = await e.renderStills({ ...siteOf(dir, face), shots });
    } catch (x) {
      return { kind: "vendor-failure", message: `stills (${face}): ${msg(x)}` };
    }
    if (r.timeline !== film.frames) return refused(`${FILM_SPEC[face].page} declares ${r.timeline} frames; the film was authored at ${film.frames}`);
    written[face] = shots.map((s) => path.relative(filmDirOf(dir), s.out).replace(/\\/g, "/"));
  }
  return madePaid(data({ frames: at, stills: written }), ctx);
}

async function renderAct(e: ReelEngines, dir: string, film: FilmRecord, face: FilmFace, ctx: StepContext): Promise<StepOutcome> {
  const spec = FILM_SPEC[face];
  const out = path.join(filmDirOf(dir), spec.file);
  const held = film.renders[face];
  // Adopted only when it is a picture of the current pages (rendered at or after they were written).
  const current = held !== undefined && (film.authoredAt === undefined || held.renderedAt >= film.authoredAt);
  if (held !== undefined && current && existsSync(out)) return madePaid(data({ face, file: spec.file, sha: held.sha, held: true }), ctx);
  let report;
  try {
    report = await e.renderFilm({
      ...siteOf(dir, face),
      step: spec.step,
      out,
      onProgress: async (frame, frames) => {
        if (progressDue(frame, frames)) await writeProgress(dir, { face, frame, frames, at: now() });
      },
    });
  } catch (x) {
    await clearProgress(dir);
    return { kind: "vendor-failure", message: `render:${face}: ${msg(x)}` };
  }
  if (report.timeline !== film.frames) {
    await clearProgress(dir);
    return refused(`${spec.page} declares ${report.timeline} frames; the film was authored at ${film.frames}`);
  }
  const probed = await e.probe(out);
  const expected = faceFrames(film.frames, spec.step);
  if (probed.frames !== expected) {
    await clearProgress(dir);
    return { kind: "vendor-failure", message: `render:${face}: ${spec.file} holds ${probed.frames} frames, not ${expected}` };
  }
  const sha = await e.sha256File(out);
  const bytes = (await stat(out)).size;
  await mutateState(dir, (s) => e.withFilmRender(s, face, { file: spec.file, frames: probed.frames, seconds: probed.seconds, bytes, sha, renderedAt: now() }, film.frames, now()));
  // A new picture drops the copies from the state (withFilmRender); the mixes and copies made of the old one go with them.
  for (const f of FILM_FACES) for (const file of [FILM_SPEC[f].mix, FILM_SPEC[f].release]) await rm(path.join(filmDirOf(dir), file), { force: true });
  await clearProgress(dir);
  return madePaid(data({ face, file: spec.file, frames: probed.frames, seconds: probed.seconds, bytes, sha, renderer: report.renderer, gpu: report.gpu, msPerFrame: report.msPerFrame, pageErrors: report.pageErrors }), ctx);
}

async function thumbsAct(e: ReelEngines, dir: string, ctx: StepContext): Promise<StepOutcome> {
  const film = filmOf(await readState(dir));
  if (film === undefined) return refused("the reel has no film");
  const fd = filmDirOf(dir);
  const names: Record<FilmFace, string[]> = { desktop: [], phone: [] };
  for (const face of FILM_FACES) {
    if (film.renders[face] === undefined) return refused(`the ${face} film is not rendered`);
    const src = path.join(fd, FILM_SPEC[face].file);
    const got = await e.filmThumbs({ src, dir: path.join(fd, "thumbs"), prefix: face === "desktop" ? "d" : "p", count: THUMBS_PER_FACE, width: face === "desktop" ? 480 : 270 });
    names[face] = got.map((n) => `thumbs/${n}`);
  }
  // The poster is the desktop film's middle frame, full size.
  const poster = await e.filmThumbs({ src: path.join(fd, FILM_SPEC.desktop.file), dir: fd, prefix: "poster", count: 1, width: FILM_SPEC.desktop.width });
  const first = poster[0];
  if (first === undefined) return { kind: "vendor-failure", message: "thumbs: no poster frame was written" };
  await rm(path.join(fd, "poster.jpg"), { force: true });
  await rename(path.join(fd, first), path.join(fd, "poster.jpg"));
  const thumbs = { desktop: names.desktop, phone: names.phone, poster: "poster.jpg" };
  await mutateState(dir, (s) => (s.film === undefined ? s : { ...s, film: { ...s.film, thumbs }, updatedAt: now() }));
  return madePaid(data(thumbs), ctx);
}

export async function renderStep(e: ReelEngines, name: string, dir: string, ctx: StepContext): Promise<StepOutcome> {
  const film = filmOf(await readState(dir));
  if (film === undefined) return refused("the reel has no film pages yet");
  if (name === "stills") return stillsAct(e, dir, film, ctx);
  if (name === "render:desktop" || name === "render:phone") return renderAct(e, dir, film, name === "render:desktop" ? "desktop" : "phone", ctx);
  if (name === "thumbs") return thumbsAct(e, dir, ctx);
  return { kind: "fatal", code: "internal", message: `reel-render has no step ${name}` };
}

/* ── reel-release ─────────────────────────────────────────────────────────── */

const faceOf = (name: string): FilmFace => (name.endsWith(":phone") ? "phone" : "desktop");

export async function releaseStep(e: ReelEngines, name: string, dir: string, ctx: StepContext): Promise<StepOutcome> {
  const film = filmOf(await readState(dir));
  if (film === undefined) return refused("the reel has no film");
  const bed = film.bed;
  if (bed === undefined) return refused("the film has no bed yet");
  const fd = filmDirOf(dir);
  if (name === "vmaf") {
    const read: Record<string, unknown> = {};
    for (const face of FILM_FACES) {
      const copy = film.copies[face];
      if (copy === undefined) continue;
      try {
        const vmaf = await e.measureVmaf({ ref: path.join(fd, FILM_SPEC[face].file), dist: path.join(fd, copy.file) });
        await mutateState(dir, (s) => {
          const cur = s.film?.copies[face];
          return cur === undefined || cur.sha !== copy.sha ? s : e.withCopy(s, face, { ...cur, vmaf }, now());
        });
        read[face] = vmaf;
      } catch (x) {
        // A reading, never a gate: a VMAF that would not run is said, and the copy stands.
        read[face] = { error: msg(x) };
      }
    }
    return madePaid(data({ vmaf: read }), ctx);
  }
  const face = faceOf(name);
  const spec = FILM_SPEC[face];
  const render = film.renders[face];
  if (render === undefined) return refused(`the ${face} film is not rendered`);
  const master = path.join(fd, spec.file);
  const mix = path.join(fd, spec.mix);
  try {
    if (name.startsWith("mix:")) {
      await e.muxBed({ film: master, bed: path.join(fd, bed.file), out: mix, face, seconds: render.seconds });
      return madePaid(data({ face, mix: spec.mix }), ctx);
    }
    if (name.startsWith("encode:")) {
      if (!existsSync(mix)) return refused(`${spec.mix} is missing: the mix step comes first`);
      const out = path.join(fd, spec.release);
      const bytes = await e.encodeToSize({ src: mix, out, targetBytes: spec.targetBytes, seconds: render.seconds });
      const sha = await e.sha256File(out);
      const copy = { file: spec.release, seconds: render.seconds, bytes, sha, encodedAt: now(), bedSha: bed.sha };
      await mutateState(dir, (s) => e.withCopy(s, face, copy, now()));
      return madePaid(data({ face, ...copy }), ctx);
    }
  } catch (x) {
    return { kind: "vendor-failure", message: `${name}: ${msg(x)}` };
  }
  return { kind: "fatal", code: "internal", message: `reel-release has no step ${name}` };
}
