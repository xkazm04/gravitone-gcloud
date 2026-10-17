// GET /api/sound/mv/jobs/[id]/file?kind=audio|still|video|thumb -> the file,
// its own content-type, and byte ranges (206) so a <video> can seek without
// downloading a whole render first. Kept past Phase 6: the Board's music-video
// packet (lib/decision/v1/sources/mv.ts) draws its candidates from here.
//
// THE BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67), which absorbed
// this route's copy of the takes range parser. A Regenerate replaces a render under the
// same name, so the per-call cache stays "revalidate", never the session hold a take gets -
// and serveFile's ETag now makes that revalidation a 304-sized question, not a re-download.
//
// THE DOOR IS route()'s `access` guard (Phase 6 L70; the takes file route says why `?k=`
// went, in full): the session cookie for the studio, a header for a CLI. Access-checked,
// not rate-bucketed: seeking issues a burst of ranges.

import { err } from "@gt/domain/errors";

import { toErrorResponse } from "../../../../../../../lib/sound/http.ts";
import { mvFileOf } from "../../../../../../../lib/sound/mv/store.ts";
import { route } from "../../../../../../_server/route.ts";
import { serveFile } from "../../../../../../_server/serveFile.ts";

export const runtime = "nodejs";

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req, params }) => {
  const id = (await params)["id"];
  if (typeof id !== "string" || id === "") return err("invalid", "a music-video job is addressed by its id");
  try {
    const { abs, mime } = await mvFileOf(id, new URL(req.url).searchParams.get("kind"));
    const res = await serveFile(req, abs, { mime, cache: "private, no-cache" });
    return res.status === 404 ? err("not-found", `job ${id}'s file is missing from the store`) : res;
  } catch (e) {
    return toErrorResponse(e);
  }
});
