// POST /audio/reference - a track a person likes, as multipart `file`: its tempo, key and energy
// contour come back as the composer's tempo, key and painted shape (lib/audio/reference.ts). A
// route, not a Server Action, for /audio/return's reason (a file's bytes); access-gated, not
// money: measuring is local and free. Nothing is stored - the upload is measured from a temp file
// and deleted.
import { AppError, err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { route } from "../../../_server/route.ts";
import { readReference, type ReferenceRead } from "../../../../lib/audio/reference.ts";

export const maxDuration = 60;

const MAX_BYTES = 40 * 1024 * 1024;

export const POST = route({ guard: "access", bodyCap: MAX_BYTES + 1_000_000, maxDuration }, async ({ req }): Promise<Result<ReferenceRead>> => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return e instanceof AppError && e.detail === "body-too-large" ? err("invalid", `a reference is at most ${MAX_BYTES / 1048576} MB`) : err("invalid", `expected multipart/form-data with a file: ${errorMessage(e)}`);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return err("invalid", "no file in the upload");
  if (file.size > MAX_BYTES) return err("invalid", `a reference is at most ${MAX_BYTES / 1048576} MB`);
  const r = await readReference(file.name.slice(0, 120), new Uint8Array(await file.arrayBuffer()));
  return r.ok ? ok(r.value) : r;
});
