// POST /reels/<slug>/bed - the music bed the operator made on suno.com, uploaded under a film (spark reel-studio
// WP4). multipart: `file` (mp3 | m4a | wav) and the prompt that made it - `style` (required), `title?`,
// `lyrics?`, `model?`, `url?`, `note?` - recorded beside the bed so a later spark can learn to make beds itself.
// Answers the BedRecord as attached.
//
// Modeled on app/(studio)/audio/studio/take/route.ts and for its reasons: a route, not a Server Action (a
// song's bytes are far over an action's body cap); access-gated, not money (nothing here spends: the bytes are
// the ones the operator already downloaded). MEASURED BEFORE FILED: the bytes become a sound-store take only
// after the sidecar analysed them (lib/sound/suno/measure.ts measureAndFile), so the bed carries the measured
// LUFS and a file that does not decode is refused in the decoder's words with nothing filed. Then the take is
// attached (lib/reel/studio.ts attachBed): copied to film/bed.<ext>, measured against the desktop film, and
// refused with `bedProblem`'s sentence when it is too short.
import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { isReelSlug } from "../../../../../lib/reel/store.ts";
import { attachBed, BED_EXTS, readReelState } from "../../../../../lib/reel/studio.ts";
import type { BedRecord } from "../../../../../lib/reel/types.ts";
import { SoundError, soundFailure } from "../../../../../lib/sound/store.ts";
import { measureAndFile } from "../../../../../lib/sound/suno/measure.ts";
import { audioMime, MAX_UPLOAD_BYTES } from "../../../../../lib/sound/takes.ts";

export const maxDuration = 120;

const opt = (max: number) => z.string().trim().min(1).max(max).optional();
const promptFields = z.strictObject({
  style: z.string().trim().min(1, "a bed records the style it was made with").max(1000),
  title: opt(200),
  lyrics: opt(6000),
  model: opt(40),
  url: z.string().trim().url().max(400).optional(),
  note: opt(2000),
});
const PROMPT_KEYS = ["style", "title", "lyrics", "model", "url", "note"] as const;

const CAP = MAX_UPLOAD_BYTES + 1_000_000;
const over = `the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`;

async function cappedForm(req: Request): Promise<Result<FormData>> {
  try {
    return ok(await req.formData());
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", over) : err("invalid", `expected multipart/form-data with file and style: ${errorMessage(e)}`);
  }
}

const field = (form: FormData, k: string): string | undefined => {
  const v = form.get(k);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

function mimeOf(f: File): Result<string> {
  try {
    return ok(audioMime(f.type, f.name));
  } catch (e) {
    return e instanceof SoundError ? err("invalid", e.message) : soundFailure(e);
  }
}

/** The studio session a bed's take is filed under: one per reel, held to the take door's session pattern. */
const bedSession = (slug: string): string => `reel-${slug.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 48);

export const POST = route({ guard: "access", bodyCap: CAP, maxDuration }, async ({ req, params }): Promise<Result<BedRecord>> => {
  const slug = (await params)["slug"];
  if (typeof slug !== "string" || !isReelSlug(slug)) return err("not-found", "That is not a reel.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > CAP) return err("invalid", over);
  const read = await cappedForm(req);
  if (!read.ok) return read;
  const form = read.value;
  const given = Object.fromEntries(PROMPT_KEYS.flatMap((k) => (field(form, k) === undefined ? [] : [[k, field(form, k)]])));
  const prompt = parseAt("reel bed prompt", promptFields, given);
  if (!prompt.ok) return prompt;
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return err("invalid", "a bed needs its audio file (multipart field `file`)");
  if (f.size > MAX_UPLOAD_BYTES) return err("invalid", `${f.name || "the file"} is ${Math.round(f.size / 1048576)} MB; a bed is at most ${MAX_UPLOAD_BYTES / 1048576} MB`);
  const ext = (f.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (!BED_EXTS.includes(ext)) return err("invalid", `a bed is ${BED_EXTS.join(", ")}, not ${ext || "a file with no extension"}`);
  const mime = mimeOf(f);
  if (!mime.ok) return mime;
  // A bed is measured against the desktop film: with none rendered, nothing is filed.
  const st = await readReelState(slug);
  if (!st.ok) return st;
  if (st.value.film?.renders.desktop === undefined) return err("refused", `reel ${slug}: the desktop film is not rendered yet; a bed is measured against it`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const filed = await measureAndFile({ bytes, mime: mime.value, name: f.name.slice(0, 255) }, { session: bedSession(slug) });
  if (!filed.ok) return filed;
  return attachBed(slug, { takeId: filed.value.takeId }, prompt.value);
});
