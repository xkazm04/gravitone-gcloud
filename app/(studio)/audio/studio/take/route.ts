// POST /audio/studio/take - the mp3 the person downloaded from suno.com, filed as a take and measured
// here, for $0 (spark suno-advisor). multipart: `file` (the audio), `session` (the studio conversation
// it came in through), `promptId?` (the prompt card it answers), `clip?` ("a" | "b", which of the two
// takes a Suno generation returns). Answers `{ takeId, facts }`: the take's StudioTakeFacts, the same
// facts the page's port and the agent's inbox read back (lib/sound/suno/facts.ts).
//
// A route, not a Server Action, for /audio/return's reason (a file's bytes; an action's body is capped
// far below a song). Access-gated, not money: measuring is local and nothing here spends. The studio
// never fetches from Suno - these bytes are the ones the person chose to spend a metered download on.
//
// MEASURED BEFORE FILED. The bytes go to a temp file, the sidecar's `analyze` (librosa's tempo and key,
// measure's loudness) reads them, and only an analysed file becomes a take: a file that claims to be
// audio and does not decode is refused in the decoder's own words with no take created, as is
// anything that is not audio or is over the store's cap (lib/sound/takes.ts MAX_UPLOAD_BYTES).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { StudioTakeFacts } from "@gt/domain/audio.suno";
import { studioTasteRowSchema } from "@gt/domain/audio.studio";
import { studioSessionSchema } from "@gt/domain/audio.studio.events";
import { parseAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { analyzeFile } from "../../../../../lib/audio/sidecar.ts";
import { SoundError, soundFailure } from "../../../../../lib/sound/store.ts";
import { fileSunoTake } from "../../../../../lib/sound/suno/facts.ts";
import { audioMime, MAX_UPLOAD_BYTES } from "../../../../../lib/sound/takes.ts";

export const maxDuration = 60;

const fields = z.strictObject({
  session: studioSessionSchema,
  // The studio's one id pattern (@gt/domain/audio.studio `id`, which a prompt card's promptId is held to).
  promptId: studioTasteRowSchema.shape.id.optional(),
  clip: z.enum(["a", "b"]).optional(),
});

const CAP = MAX_UPLOAD_BYTES + 1_000_000;
const over = `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`;

/** The multipart body. route()'s `bodyCap` counts it as it is read and errors past CAP (body-too-large). */
async function cappedForm(req: Request): Promise<Result<FormData>> {
  try {
    return ok(await req.formData());
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", over) : err("invalid", `expected multipart/form-data with file and session: ${errorMessage(e)}`);
  }
}

const field = (form: FormData, k: string): string | undefined => {
  const v = form.get(k);
  return typeof v === "string" && v !== "" ? v : undefined;
};

/** The upload's content type, or the store's own refusal of it in words. Its 415 is the caller's
 *  file, so `invalid` (soundFailure has no code for 415 and would answer `internal`). */
function mimeOf(f: File): Result<string> {
  try {
    return ok(audioMime(f.type, f.name));
  } catch (e) {
    return e instanceof SoundError ? err("invalid", e.message) : soundFailure(e);
  }
}

export const POST = route({ guard: "access", bodyCap: CAP, maxDuration }, async ({ req }): Promise<Result<{ readonly takeId: string; readonly facts: StudioTakeFacts }>> => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CAP) return err("invalid", over);
  const read = await cappedForm(req);
  if (!read.ok) return read;
  const form = read.value;
  const promptId = field(form, "promptId");
  const clip = field(form, "clip");
  const p = parseAt("studio take", fields, { session: field(form, "session"), ...(promptId === undefined ? {} : { promptId }), ...(clip === undefined ? {} : { clip }) });
  if (!p.ok) return p;
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", "a take needs its audio file (multipart field `file`)");
  if (f.size > MAX_UPLOAD_BYTES) return err("invalid", `${f.name || "the file"} is ${Math.round(f.size / 1048576)} MB; a take is at most ${MAX_UPLOAD_BYTES / 1048576} MB`);
  const mime = mimeOf(f);
  if (!mime.ok) return mime;
  const name = f.name.slice(0, 255) || "take";
  const bytes = new Uint8Array(await f.arrayBuffer());
  const dir = await mkdtemp(path.join(os.tmpdir(), "gt-studio-take-"));
  try {
    // The name's own extension, so a decoder that sniffs by name reads it as what it is.
    const tmp = path.join(dir, `upload${path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6)}`);
    await writeFile(tmp, bytes);
    const analysis = await analyzeFile(tmp);
    if (!analysis.ok) return err(analysis.error.code, `${name} could not be measured: ${analysis.error.message}`);
    const filed = await fileSunoTake({ bytes, mime: mime.value, name }, p.value, analysis.value);
    return filed.ok ? ok({ takeId: filed.value.takeId, facts: filed.value }) : filed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
