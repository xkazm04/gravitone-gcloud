// POST /audio/cover/remix - the final remix the owner brings back from Suno by hand, and the style it was made
// with (spark track-mirror-studio, WP2). multipart: `id` (the cover), `file` (the audio), `style`. Only a cover
// with a winner takes one (state `picked`): the remix descends from the winner. Writes `remix.<ext>` in the
// cover's folder and sets `remix` on the record; a second upload replaces the first. Answers `{ id }`.
//
// A route for the source door's reason (a song's bytes), access-gated, measured before it is filed
// (../../_cover/upload.ts). The studio never fetches from Suno.
import { z } from "zod";

import { COVER_STYLE_MAX } from "@gt/domain/cover";
import { coverIdSchema } from "@gt/domain/cover.schema";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../../_server/route.ts";
import { mutateCover, readCover, writeCoverFile } from "../../../../../lib/sound/cover/store.ts";
import { COVER_UPLOAD_CAP, coverForm, formField, measuredUpload } from "../../_cover/upload.ts";

export const maxDuration = 60;

const fields = z.strictObject({ id: coverIdSchema, style: z.string().trim().max(COVER_STYLE_MAX) });

const notPicked = (id: string, state: string): string => `cover ${id} is ${state}; a remix follows a picked winner`;

export const POST = route({ guard: "access", bodyCap: COVER_UPLOAD_CAP, maxDuration }, async ({ req }): Promise<Result<{ readonly id: string }>> => {
  const read = await coverForm(req, "id, file and style");
  if (!read.ok) return read;
  const form = read.value;
  const p = parseAt("cover remix", fields, { id: formField(form, "id"), style: formField(form, "style") ?? "" });
  if (!p.ok) return p;
  const { id, style } = p.value;
  const c = await readCover(id);
  if (c === undefined) return err("not-found", `no cover ${id}`);
  if (c.state !== "picked") return err("refused", notPicked(id, c.state));
  const up = await measuredUpload(form, "a remix");
  if (!up.ok) return up;
  const file = `remix${up.value.ext}`;
  await writeCoverFile(id, file, up.value.bytes);
  await mutateCover(id, (r) => {
    if (r.state !== "picked") throw new AppError("refused", notPicked(id, r.state));
    return { ...r, remix: { file, mime: up.value.mime, name: up.value.name, style } };
  });
  return ok({ id });
});
