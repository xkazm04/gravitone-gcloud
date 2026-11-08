import "server-only";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { probeDurationS } from "../../../../lib/sound/cover/cut.ts";
import { SoundError, soundFailure } from "../../../../lib/sound/store.ts";
import { audioMime, MAX_UPLOAD_BYTES } from "../../../../lib/sound/takes.ts";

// WHAT THE COVER'S TWO UPLOAD DOORS SHARE, SERVER SIDE (../cover/source, ../cover/remix; spark track-mirror-studio
// WP2), on /audio/studio/take's shape: the body counted against a cap as it is read, the file held to the sound
// store's audio rule and its cap, and the bytes MEASURED before anything is filed - written to a temp file that
// ffprobe reads (lib/sound/cover/cut.ts probeDurationS), so a file that claims to be audio and does not decode is
// refused in ffprobe's words and nothing is created. The client's sender is ./send.ts.

export const COVER_UPLOAD_CAP = MAX_UPLOAD_BYTES + 1_000_000;
const over = `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`;

export type CoverUpload = { readonly bytes: Uint8Array; readonly mime: string; readonly name: string; readonly ext: string; readonly durationS: number };

/** The multipart body; route()'s bodyCap errors past the cap as it is read (body-too-large). */
export async function coverForm(req: Request, fields: string): Promise<Result<FormData>> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > COVER_UPLOAD_CAP) return err("invalid", over);
  try {
    return ok(await req.formData());
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", over) : err("invalid", `expected multipart/form-data with ${fields}: ${errorMessage(e)}`);
  }
}

/** A text field, or undefined when absent or empty: the door's absent value is an omitted key. */
export const formField = (form: FormData, k: string): string | undefined => {
  const v = form.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
};

/** The file's content type, or the sound store's refusal in its words. Its 415 is the caller's file, so `invalid`. */
function mimeOf(f: File): Result<string> {
  try {
    return ok(audioMime(f.type, f.name));
  } catch (e) {
    return e instanceof SoundError ? err("invalid", e.message) : soundFailure(e);
  }
}

const EXT_OF_MIME: Readonly<Record<string, string>> = { "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/flac": ".flac", "audio/x-flac": ".flac", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg", "audio/webm": ".webm" };

/** The stored file's extension: the name's own when it is a plain one, else the type's. */
function extOf(name: string, mime: string): string {
  const own = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(own) ? own : (EXT_OF_MIME[mime] ?? ".audio");
}

/** The `file` field, held to the audio rule and the cap, and measured. */
export async function measuredUpload(form: FormData, what: string): Promise<Result<CoverUpload>> {
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", `${what} needs its audio file (multipart field \`file\`)`);
  if (f.size > MAX_UPLOAD_BYTES) return err("invalid", `${f.name || "the file"} is ${Math.round(f.size / 1048576)} MB; ${what} is at most ${MAX_UPLOAD_BYTES / 1048576} MB`);
  const mime = mimeOf(f);
  if (!mime.ok) return mime;
  const name = f.name.slice(0, 255) || "upload";
  const ext = extOf(name, mime.value);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const d = await measuredBytes(bytes, name, ext);
  if (!d.ok) return d;
  return ok({ bytes, mime: mime.value, name, ext, durationS: d.value });
}

/** ffprobe's duration of bytes about to be filed, or its refusal naming the file. The link door's measure too. */
export async function measuredBytes(bytes: Uint8Array, name: string, ext: string): Promise<Result<number>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-cover-upload-"));
  try {
    // The name's own extension, so a decoder that sniffs by name reads it as what it is.
    const tmp = path.join(dir, `upload${ext}`);
    await writeFile(tmp, bytes);
    const d = await probeDurationS(tmp);
    if (!d.ok) return err(d.error.code, `${name} could not be read: ${d.error.message}`);
    return ok(d.value);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
