// POST /audio/songlab/reference - a reference song for the song lab's master stage, filed as a take and
// measured here, for $0 (spark yue2-song-lab WP3). multipart: `file` (the audio). Answers `{ takeId }`:
// a take with `origin:"import"`, `use:"reference"` and no YuE2 facts, so it is never a candidate in a
// blind pair and never scored; a post-chain names it as `referenceTakeId` (lib/yue2/lab.ts fileReference).
//
// A ROUTE, not a Server Action, for /audio/studio/take's reason: a song is megabytes, and an action's
// body is capped far below that. Access-gated, not money: measuring is local and nothing here spends.
// MEASURED BEFORE FILED (the studio take's rule): the sidecar's `analyze` reads the bytes from a temp
// file, and a file that does not decode is refused in the decoder's own words with no take created.
// This route spawns the Windows audio sidecar only (lib/audio/sidecar.ts, posture-gated); nothing here
// reaches WSL - the master stage runs later, in the worker.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { analyzeFile } from "../../../../../lib/audio/sidecar.ts";
import { SoundError, soundFailure } from "../../../../../lib/sound/store.ts";
import { audioMime, MAX_UPLOAD_BYTES } from "../../../../../lib/sound/takes.ts";
import { fileReference } from "../../../../../lib/yue2/lab.ts";

export const maxDuration = 60;

const CAP = MAX_UPLOAD_BYTES + 1_000_000;
const over = `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`;

async function cappedForm(req: Request): Promise<Result<FormData>> {
  try {
    return ok(await req.formData());
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", over) : err("invalid", `expected multipart/form-data with a file: ${errorMessage(e)}`);
  }
}

function mimeOf(f: File): Result<string> {
  try {
    return ok(audioMime(f.type, f.name));
  } catch (e) {
    return e instanceof SoundError ? err("invalid", e.message) : soundFailure(e);
  }
}

export const POST = route({ guard: "access", bodyCap: CAP, maxDuration }, async ({ req }): Promise<Result<{ readonly takeId: string }>> => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CAP) return err("invalid", over);
  const read = await cappedForm(req);
  if (!read.ok) return read;
  const f = read.value.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", "a reference needs its audio file (multipart field `file`)");
  if (f.size > MAX_UPLOAD_BYTES) return err("invalid", `${f.name || "the file"} is ${Math.round(f.size / 1048576)} MB; a take is at most ${MAX_UPLOAD_BYTES / 1048576} MB`);
  const mime = mimeOf(f);
  if (!mime.ok) return mime;
  const name = f.name.slice(0, 255) || "reference";
  const bytes = new Uint8Array(await f.arrayBuffer());
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-songlab-ref-"));
  try {
    const tmp = path.join(dir, `upload${path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6)}`);
    await writeFile(tmp, bytes);
    const analysis = await analyzeFile(tmp);
    if (!analysis.ok) return err(analysis.error.code, `${name} could not be measured: ${analysis.error.message}`);
    const filed = await fileReference({ bytes, mime: mime.value, name }, analysis.value);
    return filed.ok ? ok({ takeId: filed.value.id }) : filed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
