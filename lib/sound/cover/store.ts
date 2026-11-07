import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { COVER_SECTION_MAX_S, type CoverId, type CoverRecord, type CoverRights } from "@gt/domain/cover";
import { coverIdSchema, parseCoverRecord } from "@gt/domain/cover.schema";
import { AppError } from "@gt/domain/errors";

import { exclusiveSection } from "../../diskTx.ts";
import { storeRoot, writeBytesAtomic, writeJsonAtomic } from "../store.ts";

// THE COVER STORE (spark track-mirror-studio): one folder per cover under the sound store's root,
//
//   <storeRoot()>/covers/<id>/cover.json        the record, validated by @gt/domain/cover.schema at every read and write
//                             source.<ext>       the uploaded song
//                             section.wav        the section SheetSage2 reads (44.1 kHz stereo)
//                             score.abc          its transcription
//                             takes/s<seed>.flac the five YuE2 takes
//                             winner.mp3         the picked take at 320 kbps
//                             remix.<ext>        what the owner brought back from Suno
//
// Two processes write a cover: the Next server (upload, pick, styles) and whoever drives its job (the worker, a CLI).
// So every change is read-change-validate-write under an in-process queue AND a lock file in the cover's folder
// (lib/diskTx.ts exclusiveSection), and lands by tmp + rename (lib/sound/store.ts): a reader sees the old record or
// the new one, never half. A cover.json that does not parse is never overwritten.

const COVER_JSON = "cover.json";

const coversRoot = (): string => path.join(storeRoot(), "covers");

function folderOf(id: string): string {
  if (!coverIdSchema.safeParse(id).success) throw new AppError("invalid", `not a cover id: ${JSON.stringify(id).slice(0, 60)}`);
  return path.join(coversRoot(), id);
}

export type NewCover = {
  readonly title: string;
  readonly rights: CoverRights;
  readonly holder?: string;
  readonly note?: string;
  readonly source: { readonly bytes: Uint8Array; readonly mime: string; readonly name: string; readonly durationS: number };
};

export const newCoverId = (): CoverId => `cov-${randomBytes(6).toString("hex")}`;

const EXT_OF_MIME: Readonly<Record<string, string>> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/flac": "flac", "audio/x-flac": "flac", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/webm": "webm" };

/** The source's extension: the upload's own name's when it is a plain one, else its mime's, else `bin`. */
function extOf(name: string, mime: string): string {
  const own = path.extname(name).slice(1).toLowerCase();
  if (/^[a-z0-9]{1,5}$/.test(own)) return own;
  return EXT_OF_MIME[mime.toLowerCase()] ?? "bin";
}

function valid(raw: unknown): CoverRecord {
  const r = parseCoverRecord(raw);
  if (!r.ok) throw r.error;
  return r.value as CoverRecord;
}

const sections = new Map<string, <T>(fn: () => Promise<T>) => Promise<T>>();
function sectionOf(id: string): <T>(fn: () => Promise<T>) => Promise<T> {
  const held = sections.get(id);
  if (held !== undefined) return held;
  const s = exclusiveSection(() => path.join(folderOf(id), ".lock"), () => ({ by: `cover ${id}` }));
  sections.set(id, s);
  return s;
}

async function readAt(id: string): Promise<CoverRecord | undefined> {
  let text: string;
  try {
    text = await readFile(path.join(folderOf(id), COVER_JSON), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new AppError("internal", `${id}/${COVER_JSON} is not JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return valid(raw);
}

const writeRecord = (c: CoverRecord): Promise<void> => writeJsonAtomic(path.join(folderOf(c.id), COVER_JSON), valid(c));

/** A new cover in `draft`: its source written, its section the first stretch a cover may take. */
export async function createCover(c: NewCover): Promise<CoverRecord> {
  const id = newCoverId();
  const file = `source.${extOf(c.source.name, c.source.mime)}`;
  const record: CoverRecord = {
    id,
    createdAt: new Date().toISOString(),
    title: c.title,
    rights: c.rights,
    ...(c.holder === undefined ? {} : { holder: c.holder }),
    ...(c.note === undefined ? {} : { note: c.note }),
    state: "draft",
    source: { file, mime: c.source.mime, name: c.source.name, durationS: c.source.durationS },
    section: { startS: 0, endS: Math.min(c.source.durationS, COVER_SECTION_MAX_S) },
    style: "",
    lyrics: "",
    takes: [],
  };
  valid(record);
  await sectionOf(id)(async () => {
    await mkdir(folderOf(id), { recursive: true });
    await writeCoverFile(id, file, c.source.bytes);
    await writeRecord(record);
  });
  return record;
}

export async function readCover(id: string): Promise<CoverRecord | undefined> {
  if (!coverIdSchema.safeParse(id).success) return undefined;
  return readAt(id);
}

/** Every cover, newest first. A folder whose cover.json does not parse is skipped and named on the console. */
export async function listCovers(): Promise<readonly CoverRecord[]> {
  let names: string[];
  try {
    names = await readdir(coversRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: CoverRecord[] = [];
  for (const name of names) {
    if (!coverIdSchema.safeParse(name).success) continue;
    try {
      const c = await readAt(name);
      if (c !== undefined) out.push(c);
    } catch (e) {
      console.error(`covers: skipped ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id.localeCompare(a.id)));
}

/** Read, change, validate and write atomically, serialized per cover. */
export async function mutateCover(id: string, f: (c: CoverRecord) => CoverRecord): Promise<CoverRecord> {
  return sectionOf(id)(async () => {
    const c = await readAt(id);
    if (c === undefined) throw new AppError("not-found", `no cover ${id}`);
    const next = valid(f(c));
    if (next.id !== c.id) throw new AppError("internal", `a change to cover ${id} renamed it ${next.id}`);
    await writeRecord(next);
    return next;
  });
}

/** The absolute path of a file relative to a cover's folder; refuses anything that leaves the folder. */
export function coverFileAbs(id: string, rel: string): string {
  const folder = folderOf(id);
  const abs = path.resolve(folder, rel);
  if (rel === "" || path.isAbsolute(rel) || !abs.startsWith(folder + path.sep)) throw new AppError("invalid", `${rel} is outside cover ${id}`);
  return abs;
}

export async function writeCoverFile(id: string, rel: string, bytes: Uint8Array): Promise<void> {
  const abs = coverFileAbs(id, rel);
  await writeBytesAtomic(path.relative(storeRoot(), abs), bytes);
}
