// GET /api/sound/takes/[id]/file -> the take's bytes, its own content-type,
// and byte ranges (206) so an <audio> element can seek without downloading the
// whole file first. Kept past Phase 6: the audio desk (app/(studio)/audio/_audio/read.ts),
// the Board's audio packet, the Library feed and the cut timeline (`takeFileUrl`) all
// point an <audio src> here.
//
// THE BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67). This route used to
// carry its own copy of the range parser, the copy serveFile lists as the one it absorbed.
// Kept from it: `bytes=a-b`, `a-`, `-n`, the first range of a multi-range, 416 past the end,
// and a take held for the session (a new version is a new take). Gained: If-Range, an ETag
// and streamed reads (Next answers HEAD from GET). Changed on purpose: a malformed Range is
// ignored and the whole take served (RFC 9110 14.2), where this copy answered 416 for a
// range it never parsed.
//
// THE DOOR IS route()'s `access` guard (Phase 6 L70). v1's `?k=` - the access secret in the
// URL, for an <audio> that cannot send a header - went with the last v1 page: the studio
// holds the session cookie, which rides an element's request by itself, and a CLI presents
// its header. A stale URL that still carries `k` is read as carrying nothing, so it is
// judged by its cookie, never by the secret in its query. Access-checked, not
// rate-bucketed: a Triage queue of thirty takes is thirty of these at once.

import { err } from "@gt/domain/errors";

import { toErrorResponse } from "../../../../../../lib/sound/http.ts";
import { filePathAbs } from "../../../../../../lib/sound/store.ts";
import { getTake } from "../../../../../../lib/sound/takes.ts";
import { route } from "../../../../../_server/route.ts";
import { serveFile } from "../../../../../_server/serveFile.ts";

export const runtime = "nodejs";

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req, params }) => {
  const id = (await params)["id"];
  if (typeof id !== "string" || id === "") return err("invalid", "a take is addressed by its id");
  try {
    const take = await getTake(id);
    if (!take.file) return err("not-found", `take ${id} has no audio — it is an example row with no bytes`);
    const res = await serveFile(req, filePathAbs(take.file.path), { mime: take.file.mime });
    // serveFile's not-found names no take; the sound store's own sentence does.
    return res.status === 404 ? err("not-found", `take ${id}'s file is missing from the store (${take.file.path})`) : res;
  } catch (e) {
    return toErrorResponse(e);
  }
});
