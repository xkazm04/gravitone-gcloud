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
// THE DOOR IS v1's, plus the session (the takes file route says why, in full): `k=` for the
// v1 pages until wave C, and the session cookie through route()'s guard for the studio,
// which sends no `k`. Access-checked, not rate-bucketed: seeking issues a burst of ranges.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, errorResponse, toErrorResponse } from "@/lib/sound/http";
import { mvFileOf } from "@/lib/sound/mv/store";

import { guardOf } from "../../../../../../_server/route.ts";
import { serveFile } from "../../../../../../_server/serveFile.ts";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const refused = await guardAccessOnly(probe);
  if (refused !== null && !("who" in (await guardOf(probe, "access")))) return (await asContractDenial(refused)) ?? refused;
  try {
    const { id } = await params;
    const { abs, mime } = await mvFileOf(id, url.searchParams.get("kind"));
    const res = await serveFile(req, abs, { mime, cache: "private, no-cache" });
    return res.status === 404 ? errorResponse(`job ${id}'s file is missing from the store`, 404) : res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
