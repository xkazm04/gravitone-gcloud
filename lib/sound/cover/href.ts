import type { CoverRecord } from "@gt/domain/cover";

// THE ADDRESS A COVER'S AUDIO PLAYS FROM (spark track-mirror-studio, WP2): one spelling for the desk's reader
// (app/(studio)/audio/_cover/read.ts) and the Library feed (lib/library/feeds/cover.ts), which may not import
// from app/. Pure: no store, no fs. The route that answers it is app/(studio)/audio/cover/file/route.ts.

export const COVER_FILE_ROUTE = "/audio/cover/file";

/** The names the file route serves, beside `take-<seed>` for a seed on the record. */
export const COVER_FILE_NAMES = ["source", "section", "winner", "remix"] as const;
export type CoverFileName = (typeof COVER_FILE_NAMES)[number] | `take-${number}`;

export const coverFileHref = (id: string, f: CoverFileName): string => `${COVER_FILE_ROUTE}?id=${encodeURIComponent(id)}&f=${encodeURIComponent(f)}`;

/** The section's wav, relative to the cover's folder: written by the job's transcribe step (lib/sound/cover/store.ts layout). */
export const SECTION_FILE = "section.wav";
/** The winner's mp3, relative to the cover's folder. */
export const WINNER_FILE = "winner.mp3";

const EXT_MIME: Readonly<Record<string, string>> = { ".flac": "audio/flac", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg" };
const TAKE_NAME = /^take-(\d{1,15})$/;

/** A served name to its file on the record, or undefined: the allow-list. A name the record does not hold
 *  yet (no winner, no remix, no file on a take) is undefined too. `section` is named whether or not the job
 *  has cut it; serving it answers not-found until it has. */
export function coverFileOf(c: CoverRecord, f: string): { readonly rel: string; readonly mime: string } | undefined {
  if (f === "source") return { rel: c.source.file, mime: c.source.mime };
  if (f === "section") return { rel: SECTION_FILE, mime: "audio/wav" };
  if (f === "winner") return c.exportFile === undefined ? undefined : { rel: c.exportFile, mime: "audio/mpeg" };
  if (f === "remix") return c.remix === undefined ? undefined : { rel: c.remix.file, mime: c.remix.mime };
  const m = TAKE_NAME.exec(f);
  if (m === null) return undefined;
  const take = c.takes.find((t) => t.seed === Number(m[1]));
  if (take?.file === undefined) return undefined;
  const dot = take.file.lastIndexOf(".");
  return { rel: take.file, mime: (dot < 0 ? undefined : EXT_MIME[take.file.slice(dot).toLowerCase()]) ?? "application/octet-stream" };
}
