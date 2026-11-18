// THE WRITES THE /reels STEPS NEED THAT ARE NOT FILM TRANSITIONS (spark reel-studio WP4). A reel made from the
// idea form, a table accepted or sent back (the `data` stop's verdict, through the one verdict writer), a music
// bed attached under the film, and the words a release slot carries. The pure transitions are ./state.ts and
// ./film.ts; this module only reads a folder, calls one of them, and writes.
//
// Every answer is a Result: a refusal is a sentence the screen shows verbatim in an ErrorLine, never a throw.
// No `server-only` mark on purpose (store.ts's reason): a CLI may call these.
//
// THE DATA STOP'S `of` is the bytes the Board would show for it: the card `data` drew (data-card.png), or the
// table itself when no card was drawn. A verdict is of the bytes judged (store.ts), so a table the seat writes
// again opens a new round instead of inheriting this one's keep.
//
// THE BED is copied into `<slug>/film/bed.<ext>`, measured there (ffprobe seconds, sha256), and refused with
// `bedProblem`'s sentence BEFORE anything is copied when it is shorter than the desktop film. Its loudness is
// the sound store's measured LUFS when it came through the take upload (the take route measured it before
// filing); a file attached by path carries none rather than a guess.

import { copyFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";

import { FoundryError, readJson, writeJsonAtomic } from "../foundry/runStore.ts";
import { withRunLock } from "../foundry/verdictLog.ts";
import { probeDurationS } from "../sound/cover/cut.ts";
import { SoundError, storeRoot } from "../sound/store.ts";
import { getTake } from "../sound/takes.ts";
import { sha256File } from "./encode.ts";
import { bedProblem, withBed } from "./film.ts";
import { newReel, parseIdea, parseState } from "./state.ts";
import { isReelSlug, parsePublish, readVerdicts, recordVerdict, reelDir, roundOf, type Recorded, type ReelPublish, type ReelVerdict } from "./store.ts";
import { FILM_DIR, ReelError, type BedPrompt, type BedRecord, type ReelIdea, type ReelState } from "./types.ts";

export const BED_EXTS: readonly string[] = [".mp3", ".m4a", ".wav"];
export const PUBLISH_FILE = "publish.json";
/** YouTube's own caps: a title of 100 characters, a description of 5000, tags 500 characters in all. */
export const PUBLISH_CAPS = { title: 100, description: 5000, tagsChars: 500 } as const;

const nowIso = (): string => new Date().toISOString();
const exists = (abs: string): Promise<boolean> => stat(abs).then((s) => s.isFile(), () => false);

/** A thrown refusal as a Result: a ReelError is the operator's to act on, a FoundryError keeps its status. */
function failure<T>(e: unknown): Result<T> {
  if (e instanceof ReelError) return err(e.code === "unbuilt" ? "unavailable" : "refused", e.message);
  if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : e.status === 403 ? "refused" : e.status === 400 ? "invalid" : "unavailable", e.message);
  if (e instanceof SoundError) return err(e.status === 404 ? "not-found" : e.status < 500 ? "invalid" : "unavailable", e.message);
  return err("internal", e instanceof Error ? e.message : String(e));
}

async function guard<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    return failure(e);
  }
}

/** The reel's state, or why it does not read. */
export async function readReelState(slug: string): Promise<Result<ReelState>> {
  return guard(async () => {
    const raw = await readJson<unknown>(path.join(reelDir(slug), "reel.json"));
    if (raw === null) return err("not-found", `no reel ${slug}`);
    const parsed = parseState(raw);
    return typeof parsed === "string" ? err("unavailable", `reel ${slug}: reel.json: ${parsed}`) : ok(parsed);
  });
}

const saveState = (slug: string, state: ReelState): Promise<void> => writeJsonAtomic(path.join(reelDir(slug), "reel.json"), state);

/* ── a new reel ────────────────────────────────────────────────────────────── */

/** A new reel folder holding only its idea. Refused for a slug that is not one, an idea `parseIdea` refuses, or a reel that exists. */
export async function createReel(slug: string, idea: unknown): Promise<Result<ReelState>> {
  if (!isReelSlug(slug)) return err("invalid", `${slug} is not a reel slug: letters, digits, - and _, at most 60, starting with a letter or digit`);
  const parsed = parseIdea(idea);
  if (typeof parsed === "string") return err("invalid", parsed);
  return guard(async () => {
    const dir = reelDir(slug);
    if (await exists(path.join(dir, "reel.json"))) return err("conflict", `reel ${slug} already exists`);
    const state = newReel(slug, { title: parsed.title.trim(), hook: parsed.hook.trim(), path: parsed.path.trim() } satisfies ReelIdea, nowIso());
    await saveState(slug, state);
    return ok(state);
  });
}

/* ── the data stop ─────────────────────────────────────────────────────────── */

/** What the data stop judges: the card when one was drawn, else the table. Undefined: no table yet. */
async function dataSubject(slug: string): Promise<Result<string>> {
  const st = await readReelState(slug);
  if (!st.ok) return st;
  if (st.value.tableSha === undefined) return err("refused", `reel ${slug} has no table yet`);
  const dir = reelDir(slug);
  for (const rel of ["data-card.png", "table.json"]) {
    const abs = path.join(dir, rel);
    if (await exists(abs)) return ok(await sha256File(abs));
  }
  return err("not-found", `reel ${slug}: table.json is missing`);
}

async function decideData(slug: string, verdict: "keep" | "reject", reasons: readonly string[], note: string | undefined): Promise<Result<Recorded>> {
  return guard(async () => {
    const of = await dataSubject(slug);
    if (!of.ok) return of;
    const dir = reelDir(slug);
    const held = (await readVerdicts(dir)).stops.data;
    const { round } = roundOf(held, of.value);
    const v: ReelVerdict = { verdict, reasons: [...reasons], ...(note === undefined || note.trim() === "" ? {} : { note: note.trim() }), by: "operator", at: nowIso(), of: of.value, round };
    return ok(await recordVerdict(dir, "data", v));
  });
}

/** The operator keeps the table: the data stop's keep for the bytes it shows now. */
export const acceptTable = (slug: string): Promise<Result<Recorded>> => decideData(slug, "keep", [], undefined);

/** The operator sends the table back with what is wrong with it. The note is required: it is the next research turn's brief. */
export function sendBackTable(slug: string, note: string, reasons: readonly string[] = []): Promise<Result<Recorded>> {
  if (note.trim() === "") return Promise.resolve(err("invalid", "a table sent back needs a note: it is what the next research turn reads"));
  return decideData(slug, "reject", reasons, note);
}

/* ── the bed ───────────────────────────────────────────────────────────────── */

export type BedSource = { readonly takeId: string } | { readonly file: string };

/** The source file and what the sound store measured on it. */
async function sourceOf(src: BedSource): Promise<Result<{ readonly abs: string; readonly lufs?: number; readonly takeId?: string }>> {
  if ("file" in src) return ok({ abs: path.resolve(src.file) });
  const take = await getTake(src.takeId);
  if (take.file === null) return err("not-found", `take ${src.takeId} holds no file`);
  const lufs = take.measured?.lufs;
  return ok({ abs: path.join(storeRoot(), take.file.path), takeId: take.id, ...(typeof lufs === "number" && Number.isFinite(lufs) ? { lufs } : {}) });
}

/** Attach a bed under the film: copied to `film/bed.<ext>`, measured, recorded through `withBed`. */
export async function attachBed(slug: string, src: BedSource, prompt?: BedPrompt): Promise<Result<BedRecord>> {
  return guard(async () => {
    const st = await readReelState(slug);
    if (!st.ok) return st;
    const desktop = st.value.film?.renders.desktop;
    if (desktop === undefined) return err("refused", `reel ${slug}: the desktop film is not rendered yet; a bed is measured against it`);
    const from = await sourceOf(src);
    if (!from.ok) return from;
    const ext = path.extname(from.value.abs).toLowerCase();
    if (!BED_EXTS.includes(ext)) return err("invalid", `a bed is ${BED_EXTS.join(", ")}, not ${ext || "a file with no extension"}`);
    if (!(await exists(from.value.abs))) return err("not-found", `${from.value.abs} does not exist`);
    const seconds = await probeDurationS(from.value.abs);
    if (!seconds.ok) return seconds;
    const problem = bedProblem({ seconds: seconds.value }, desktop.seconds);
    if (problem !== undefined) return err("refused", problem);
    const dir = reelDir(slug);
    const filmDir = path.join(dir, FILM_DIR);
    const file = `bed${ext}`;
    return withRunLock(dir, async (): Promise<Result<BedRecord>> => {
      const tmp = path.join(filmDir, `${file}.${process.pid}.${Date.now()}.tmp`);
      await copyFile(from.value.abs, tmp);
      await rename(tmp, path.join(filmDir, file));
      // A bed of another extension is not this film's bed any more.
      for (const name of await readdir(filmDir)) if (name !== file && /^bed\.[a-z0-9]+$/.test(name)) await rm(path.join(filmDir, name), { force: true });
      const bed: BedRecord = {
        file,
        seconds: seconds.value,
        sha: await sha256File(path.join(filmDir, file)),
        ...(from.value.lufs === undefined ? {} : { lufs: from.value.lufs }),
        ...(from.value.takeId === undefined ? {} : { takeId: from.value.takeId }),
        ...(prompt === undefined ? {} : { prompt }),
        attachedAt: nowIso(),
      };
      // Re-read under the lock: a render that landed while the bed was copied is the state the bed joins.
      const cur = await readReelState(slug);
      if (!cur.ok) return cur;
      await saveState(slug, withBed(cur.value, bed, bed.attachedAt));
      return ok(bed);
    });
  });
}

/* ── the release words ─────────────────────────────────────────────────────── */

/** The release words a check refuses, in one sentence, or undefined when they hold. */
export function publishProblem(p: ReelPublish): string | undefined {
  if (p.title.length > PUBLISH_CAPS.title) return `the title is ${p.title.length} characters; a slot holds ${PUBLISH_CAPS.title}`;
  if (p.description.length > PUBLISH_CAPS.description) return `the description is ${p.description.length} characters; a slot holds ${PUBLISH_CAPS.description}`;
  const chars = p.tags.reduce((n, t) => n + t.length, 0);
  if (chars > PUBLISH_CAPS.tagsChars) return `the tags are ${chars} characters together; a slot holds ${PUBLISH_CAPS.tagsChars}`;
  return undefined;
}

/** `film/publish.json` as written, undefined before it is, or the sentence that says it does not read. */
export async function readPublish(slug: string): Promise<Result<ReelPublish | undefined>> {
  return guard(async () => {
    const raw = await readJson<unknown>(path.join(reelDir(slug), FILM_DIR, PUBLISH_FILE));
    if (raw === null) return ok(undefined);
    const p = parsePublish(raw);
    return typeof p === "string" ? err("unavailable", `reel ${slug}: ${FILM_DIR}/${p}`) : ok(p);
  });
}

/** The words both release slots carry, written to `film/publish.json` before the release verdict. */
export async function savePublish(slug: string, words: ReelPublish): Promise<Result<ReelPublish>> {
  const clean: ReelPublish = { title: words.title.trim(), description: words.description.trim(), tags: [...new Set(words.tags.map((t) => t.trim()).filter((t) => t !== ""))] };
  const p = parsePublish(clean);
  if (typeof p === "string") return err("invalid", p);
  const problem = publishProblem(p);
  if (problem !== undefined) return err("invalid", problem);
  return guard(async () => {
    const st = await readReelState(slug);
    if (!st.ok) return st;
    if (st.value.film === undefined) return err("refused", `reel ${slug} has no film yet`);
    await writeJsonAtomic(path.join(reelDir(slug), FILM_DIR, PUBLISH_FILE), p);
    return ok(p);
  });
}
