// POST /audio/cover/source - the song a cover starts from (spark track-mirror-studio, WP2). multipart: `file`
// (the audio), `title`, `rights` (one of COVER_RIGHTS, no default: an upload that does not declare is refused),
// `holder?`, `note?`, held by @gt/domain/cover.schema coverUploadSchema. Answers `{ id }`: a cover in `draft`.
//
// A route, not a Server Action, for /audio/studio/take's reason: a song's bytes, and an action's body is capped
// far below one. Access-gated, not money: nothing here spends. The file is held to the sound store's audio rule
// and cap and measured by ffprobe before the cover exists (../../_cover/upload.ts), so its duration on the record
// is the decoder's, and a file the decoder cannot read creates nothing.
import { parseAt } from "@gt/domain/door";
import { coverUploadSchema } from "@gt/domain/cover.schema";
import { ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { createCover } from "../../../../../lib/sound/cover/store.ts";
import { COVER_UPLOAD_CAP, coverForm, formField, measuredUpload } from "../../_cover/upload.ts";

export const maxDuration = 60;

export const POST = route({ guard: "access", bodyCap: COVER_UPLOAD_CAP, maxDuration }, async ({ req }): Promise<Result<{ readonly id: string }>> => {
  const read = await coverForm(req, "file, title and rights");
  if (!read.ok) return read;
  const form = read.value;
  const raw: Record<string, string> = {};
  for (const k of ["title", "rights", "holder", "note"]) {
    const v = formField(form, k);
    if (v !== undefined) raw[k] = v;
  }
  const p = parseAt("cover upload", coverUploadSchema, raw);
  if (!p.ok) return p;
  const up = await measuredUpload(form, "a cover");
  if (!up.ok) return up;
  const { title, rights, holder, note } = p.value;
  const c = await createCover({
    title,
    rights,
    ...(holder === undefined ? {} : { holder }),
    ...(note === undefined ? {} : { note }),
    source: { bytes: up.value.bytes, mime: up.value.mime, name: up.value.name, durationS: up.value.durationS },
  });
  return ok({ id: c.id });
});
