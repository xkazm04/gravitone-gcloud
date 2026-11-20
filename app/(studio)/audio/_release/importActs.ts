"use server";

// THE SHELF'S IMPORT (spark studio-to-release WP3): audio files dropped on the release shelf, each filed as a KEPT music
// take through the take door (lib/sound/takes.ts createTake) - the shelf's twin of pipeline/import-folder.mts, under
// the same rules: the door's audio rule and its 60 MB cap, the length MEASURED by ffprobe before anything is filed (a
// file that does not decode is refused in ffprobe's words and no take is made), titled from the file name, the id a
// digest of the bytes so a second drop of the same file finds its take.
//
// IN PIECES, BECAUSE A SERVER ACTION'S BODY IS CAPPED AT 1 MB (next.config `serverActions.bodySizeLimit`, unset here:
// node_modules/next/dist/docs/.../serverActions.md) and a song is tens of MB. The page sends each file as numbered
// pieces of IMPORT_PIECE bytes under one upload id; each lands in a temp folder, and the last one assembles the file,
// checks it is the size the first piece declared, and files it. The first piece refuses a file past the cap or not
// audio before any other byte is sent. A route would take the file whole (as /audio/studio/take does) at the price of a
// new door and its probe rows; this keeps the drop on the action core.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { probeDurationS } from "../../../../lib/sound/cover/cut.ts";
import { trackTitle } from "../../../../lib/sound/mv/store.ts";
import { SoundError, soundFailure } from "../../../../lib/sound/store.ts";
import { audioMime, createTake, MAX_UPLOAD_BYTES } from "../../../../lib/sound/takes.ts";

/** One piece's bytes: under the 1 MB action cap with room for the multipart framing. */
const PIECE_MAX = 800 * 1024;

export type ImportAnswer =
  | { readonly kind: "partial"; readonly received: number }
  | { readonly kind: "filed"; readonly takeId: string; readonly title: string; readonly created: boolean; readonly durationS: number };

const pieceInput = z.strictObject({
  upload: z.string().regex(/^[0-9a-f]{16}$/),
  index: z.number().int().min(0),
  count: z.number().int().min(1).max(Math.ceil(MAX_UPLOAD_BYTES / (64 * 1024))),
  size: z.number().int().min(1),
  name: z.string().min(1).max(255),
});
type Piece = z.output<typeof pieceInput>;

const workDir = (upload: string): string => path.join(os.tmpdir(), "gt-release-import", upload);
const capRefusal = (bytes: number): string => `the file is ${Math.round(bytes / 1048576)} MB; takes are capped at ${MAX_UPLOAD_BYTES / 1048576} MB`;

function mimeOf(name: string): Result<string> {
  try {
    return ok(audioMime(null, name));
  } catch (e) {
    return e instanceof SoundError ? err("invalid", e.message) : soundFailure(e);
  }
}

/** The file, once every piece is in: assembled, held to its declared size, measured, filed kept. */
async function fileWhole(p: Piece, mime: string, dir: string): Promise<Result<ImportAnswer>> {
  const parts = (await readdir(dir)).filter((f) => /^\d+\.part$/.test(f));
  if (parts.length !== p.count) return err("invalid", `${p.name}: ${parts.length} of ${p.count} pieces arrived`);
  const chunks = await Promise.all(Array.from({ length: p.count }, (_, i) => readFile(path.join(dir, `${i}.part`))));
  const bytes = new Uint8Array(Buffer.concat(chunks));
  if (bytes.byteLength !== p.size) return err("invalid", `${p.name}: ${bytes.byteLength} bytes arrived of ${p.size}`);
  const ext = path.extname(p.name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
  const whole = path.join(dir, `whole${ext}`);
  await writeFile(whole, bytes);
  const d = await probeDurationS(whole);
  if (!d.ok) return err("invalid", `${p.name} could not be read: ${d.error.message}`);
  const title = trackTitle(path.basename(p.name, path.extname(p.name)));
  const id = `st-${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}`;
  try {
    const { take, created } = await createTake({ id, origin: "import", kind: "music", title, verdict: "kept", fileName: p.name, durationS: d.value }, { bytes, mime, name: p.name });
    return ok({ kind: "filed", takeId: take.id, title: take.title, created, durationS: d.value });
  } catch (e) {
    return e instanceof SoundError ? err(e.status === 413 || e.status === 415 || e.status === 400 ? "invalid" : "conflict", e.message) : err("internal", errorMessage(e));
  }
}

/** One piece received: held to its upload, written beside its siblings, and - the last one - the file filed. */
async function receivePiece(p: Piece, bytes: Uint8Array | null): Promise<Result<ImportAnswer>> {
  if (bytes === null || bytes.byteLength < 1 || bytes.byteLength > PIECE_MAX) return err("invalid", `a piece is 1 byte to ${PIECE_MAX} bytes`);
  if (p.index >= p.count) return err("invalid", `piece ${p.index} of a ${p.count}-piece upload`);
  if (p.size > MAX_UPLOAD_BYTES) return err("invalid", capRefusal(p.size));
  const mime = mimeOf(p.name);
  if (!mime.ok) return mime;
  const dir = workDir(p.upload);
  if (p.index === 0) await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${p.index}.part`), bytes);
  if (p.index < p.count - 1) return ok({ kind: "partial", received: p.index + 1 });
  try {
    return await fileWhole(p, mime.value, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** One piece of one dropped file (the page's `importFile` sends them in order). */
export async function importPieceAct(form: FormData): Promise<ActionResult<ImportAnswer>> {
  const blob = form.get("bytes");
  const bytes = blob instanceof Blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  const num = (k: string): number => Number(form.get(k));
  return action("release shelf import", pieceInput, (p) => receivePiece(p, bytes))({ upload: form.get("upload"), index: num("index"), count: num("count"), size: num("size"), name: form.get("name") });
}
