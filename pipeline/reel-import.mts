// REEL IMPORT - bring a film made outside the pipeline (a contest folder, a night's winner) in as a reel at its
// film stop, so it is judged, scored and released like any other (spark reel-studio).
//
//   npx tsx pipeline/reel-import.mts <folder> --slug <slug> --title <t> --hook <question?> --path <why> [--again] [--dry] [--shared <dir>] [--json]
//
// The folder holds a page pair (`reel-desktop.html` 1920x1080, `reel.html` 1080x1920, a shared module), the two
// silent masters (`film-desktop.mp4`, and `film-mobile.mp4` - the phone face, the same timeline at --step 2) and
// what the pages load. Into `<reelsRoot>/<slug>/film/` it copies the pages, every .js/.json/.css beside them,
// `fonts/`, `data/`, `NOTES.md` and `still*.png`; the masters as `film-desktop.mp4` / `film-phone.mp4` (a file
// copy, never read into memory). The shared data dir the pages load from `/data/` is copied ONCE to
// `<reelsRoot>/_shared/data/` (a leading `_` is not a reel slug, so listReelSlugs never lists it).
//
// It measures each master (ffprobe seconds and frames, a streamed sha256 - once, here, so no read ever hashes a
// master again), draws 12 thumbs per face (`thumbs/d-NN.jpg` 320 w, `thumbs/p-NN.jpg` 180 w) and `poster.jpg` (the
// desktop frame at 40%, 1280 w), and writes `reel.json`: stage `idea`, the idea, and `film` with both renders, no
// copies, the thumbs and `imported`. A TABLE IS NOT INVENTED: an imported reel has no `tableSha`, and its stage is
// `review` because a film with both faces rendered is past data regardless of the table (lib/reel/film.ts).
//
// An existing slug is refused unless --again, which replaces `film/` and reel.json and leaves verdicts.json alone
// (new bytes are a new round, never a re-judged one). --dry prints what would be copied and writes nothing.
//
// SPEND: none. ffmpeg on the CPU, a folder copy; no GPU, no vendor, no store. Set REELS_STORE_DIR for a rehearsal.

import { cp, copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filmFrame, filmThumbs, probeMedia, sha256File } from "../lib/reel/encode";
import { filmStageOf } from "../lib/reel/film";
import { newReel, parseIdea } from "../lib/reel/state";
import { isReelSlug, readVerdicts, reelsRoot } from "../lib/reel/store";
import { FILM_DIR, FILM_SPEC, REEL_FPS, ReelError, type FilmFace, type FilmRecord, type FilmRender, type ReelState } from "../lib/reel/types";

// The shared /data/ folder (flags, geo, fonts) the night pages load: --shared or REEL_SHARED_DATA; no default, a path
// on one machine is no path on another. Absent and already in <root>/_shared/data: nothing to copy.
/** The phone master's name in a contest folder, and in the store. */
const SOURCE_MASTER: Readonly<Record<FilmFace, readonly string[]>> = { desktop: ["film-desktop.mp4"], phone: ["film-mobile.mp4", "film-phone.mp4"] };
const PAGE_EXT = new Set([".html", ".js", ".json", ".css"]);
const THUMB = { desktop: { prefix: "d", width: 320 }, phone: { prefix: "p", width: 180 } } as const;
const THUMBS = 12;
const POSTER_AT = 0.4;

export type ImportOptions = { readonly folder: string; readonly slug: string; readonly title: string; readonly hook: string; readonly path: string; readonly again?: boolean; readonly dry?: boolean; readonly shared?: string; readonly now?: string };

const isDir = (p: string): Promise<boolean> => stat(p).then((s) => s.isDirectory(), () => false);
const isFile = (p: string): Promise<boolean> => stat(p).then((s) => s.isFile(), () => false);

async function masterOf(folder: string, face: FilmFace): Promise<string> {
  for (const name of SOURCE_MASTER[face]) if (await isFile(path.join(folder, name))) return path.join(folder, name);
  throw new ReelError(`${folder} has no ${face} master (${SOURCE_MASTER[face].join(" or ")})`);
}

/** What goes into film/: [source, film-relative destination, is a folder]. */
async function plan(folder: string): Promise<[string, string, boolean][]> {
  const out: [string, string, boolean][] = [];
  for (const e of await readdir(folder, { withFileTypes: true })) {
    const ext = path.extname(e.name).toLowerCase();
    if (e.isFile() && (PAGE_EXT.has(ext) || e.name === "NOTES.md" || (e.name.startsWith("still") && ext === ".png"))) out.push([path.join(folder, e.name), e.name, false]);
    else if (e.isDirectory() && (e.name === "fonts" || e.name === "data")) out.push([path.join(folder, e.name), e.name, true]);
  }
  for (const page of [FILM_SPEC.desktop.page, FILM_SPEC.phone.page]) if (!out.some(([, rel]) => rel === page)) throw new ReelError(`${folder} has no ${page}: an imported film needs both pages`);
  return out.sort((a, b) => a[1].localeCompare(b[1]));
}

async function measured(file: string, rel: string, now: string): Promise<FilmRender> {
  const [probe, sha, s] = await Promise.all([probeMedia(file), sha256File(file), stat(file)]);
  return { file: rel, frames: probe.frames ?? Math.round(probe.seconds * REEL_FPS), seconds: Math.round(probe.seconds * 1000) / 1000, bytes: s.size, sha, renderedAt: now };
}

export async function importReel(o: ImportOptions): Promise<Record<string, unknown>> {
  if (!isReelSlug(o.slug) || o.slug.startsWith("_")) throw new ReelError(`"${o.slug}" is not a reel slug (letters, digits, - and _, not starting with _)`, "usage");
  const idea = parseIdea({ title: o.title, hook: o.hook, path: o.path });
  if (typeof idea === "string") throw new ReelError(`the idea: ${idea}`, "usage");
  const folder = path.resolve(o.folder);
  if (!(await isDir(folder))) throw new ReelError(`${folder} is not a folder`);
  const root = reelsRoot();
  const dir = path.join(root, o.slug);
  if ((await isFile(path.join(dir, "reel.json"))) && o.again !== true) throw new ReelError(`reel ${o.slug} exists in ${root}: pass --again to import over its film`);
  const masters = { desktop: await masterOf(folder, "desktop"), phone: await masterOf(folder, "phone") };
  const files = await plan(folder);
  const sharedFrom = o.shared ?? process.env["REEL_SHARED_DATA"];
  const shared = sharedFrom === undefined ? undefined : path.resolve(sharedFrom);
  const sharedTo = path.join(root, "_shared", "data");
  const sharedNeeded = shared !== undefined && !(await isDir(sharedTo)) && (await isDir(shared));
  if (shared === undefined && !(await isDir(sharedTo))) throw new ReelError(`${sharedTo} is absent: pass --shared <the night data folder> (or REEL_SHARED_DATA) once`);
  if (o.dry === true) return { dry: true, slug: o.slug, into: path.join(dir, FILM_DIR), copies: files.map(([, rel, d]) => (d ? `${rel}/` : rel)), masters, shared: sharedNeeded ? `${shared} -> ${sharedTo}` : "already there or absent" };

  const now = o.now ?? new Date().toISOString();
  const filmDir = path.join(dir, FILM_DIR);
  await rm(filmDir, { recursive: true, force: true });
  await mkdir(filmDir, { recursive: true });
  for (const [src, rel, folderish] of files) {
    if (folderish) await cp(src, path.join(filmDir, rel), { recursive: true });
    else await copyFile(src, path.join(filmDir, rel));
  }
  for (const face of ["desktop", "phone"] as const) await copyFile(masters[face], path.join(filmDir, FILM_SPEC[face].file));
  if (sharedNeeded && shared !== undefined) {
    // Staged and renamed: a half-copied shared dir would read as present to the next import.
    const tmp = `${sharedTo}.partial`;
    await rm(tmp, { recursive: true, force: true });
    await cp(shared, tmp, { recursive: true });
    await rename(tmp, sharedTo);
  }

  const desktop = await measured(path.join(filmDir, FILM_SPEC.desktop.file), FILM_SPEC.desktop.file, now);
  const phone = await measured(path.join(filmDir, FILM_SPEC.phone.file), FILM_SPEC.phone.file, now);
  const thumbsDir = path.join(filmDir, "thumbs");
  const thumbs = {
    desktop: (await filmThumbs({ src: path.join(filmDir, desktop.file), dir: thumbsDir, prefix: THUMB.desktop.prefix, count: THUMBS, width: THUMB.desktop.width })).map((n) => `thumbs/${n}`),
    phone: (await filmThumbs({ src: path.join(filmDir, phone.file), dir: thumbsDir, prefix: THUMB.phone.prefix, count: THUMBS, width: THUMB.phone.width })).map((n) => `thumbs/${n}`),
    poster: "poster.jpg",
  };
  await filmFrame({ src: path.join(filmDir, desktop.file), out: path.join(filmDir, thumbs.poster), at: desktop.seconds * POSTER_AT, width: 1280 });

  // window.REEL.frames is the timeline at desktop speed: the desktop master holds every frame of it.
  const film: FilmRecord = { frames: desktop.frames, renders: { desktop, phone }, copies: {}, thumbs, imported: { from: folder.replace(/\\/g, "/"), at: now } };
  const state: ReelState = { ...newReel(o.slug, idea, now), film };
  const tmp = path.join(dir, `reel.json.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
  await rename(tmp, path.join(dir, "reel.json"));
  const stage = filmStageOf(state, await readVerdicts(dir));
  return { slug: o.slug, dir, stage, frames: film.frames, desktop: { seconds: desktop.seconds, frames: desktop.frames, bytes: desktop.bytes, sha: desktop.sha }, phone: { seconds: phone.seconds, frames: phone.frames, bytes: phone.bytes, sha: phone.sha }, copied: files.length, shared: sharedNeeded ? sharedTo : "kept" };
}

/* ── The command line ─────────────────────────────────────────────────────── */

const VALUE_FLAGS = ["slug", "title", "hook", "path", "shared"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

async function main(): Promise<number> {
  let json = false;
  try {
    const flags: Partial<Record<ValueFlag, string>> = {};
    const rest: string[] = [];
    let again = false;
    let dry = false;
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i] as string;
      const name = a.slice(2) as ValueFlag;
      if (a === "--json") json = true;
      else if (a === "--again") again = true;
      else if (a === "--dry") dry = true;
      else if (a.startsWith("--") && VALUE_FLAGS.includes(name)) {
        const v = argv[++i];
        if (v === undefined) throw new ReelError(`${a} needs a value`, "usage");
        flags[name] = v;
      } else if (a.startsWith("--")) throw new ReelError(`unknown flag ${a}`, "usage");
      else rest.push(a);
    }
    const folder = rest[0];
    const { slug, title, hook, path: why } = flags;
    if (folder === undefined || slug === undefined || title === undefined || hook === undefined || why === undefined) throw new ReelError("usage: reel-import.mts <folder> --slug <slug> --title <t> --hook <question?> --path <why> [--again] [--dry] [--shared <dir>] [--json]", "usage");
    const out = await importReel({ folder, slug, title, hook, path: why, again, dry, ...(flags.shared === undefined ? {} : { shared: flags.shared }) });
    process.stdout.write(`${JSON.stringify(out, null, json ? 0 : 2)}\n`);
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (json) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
    process.stderr.write(`reel-import: ${message}\n`);
    return e instanceof ReelError && e.code === "usage" ? 2 : 1;
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) process.exitCode = await main();
