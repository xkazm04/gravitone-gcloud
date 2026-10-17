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
// THE DOOR IS v1's, plus the session. An <audio src> cannot carry an Authorization header,
// so the access secret may still arrive as `k=` - the PUBLIC bundle value lib/apiAuth.ts
// documents - until the last v1 page that sends it is gone (wave C). The studio sends no
// `k`: it holds the session cookie, which v1's door never read, so a refusal with nothing
// presented is asked again through route()'s guard (app/_server/route.ts guardOf), which
// consults the cookie only when no credential of its own was presented. Access-checked,
// not rate-bucketed: a Triage queue of thirty takes is thirty of these at once.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, errorResponse, toErrorResponse } from "@/lib/sound/http";
import { filePathAbs } from "@/lib/sound/store";
import { getTake } from "@/lib/sound/takes";

import { guardOf } from "../../../../../_server/route.ts";
import { serveFile } from "../../../../../_server/serveFile.ts";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const k = new URL(req.url).searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const refused = await guardAccessOnly(probe);
  if (refused !== null && !("who" in (await guardOf(probe, "access")))) return (await asContractDenial(refused)) ?? refused;
  try {
    const { id } = await params;
    const take = await getTake(id);
    if (!take.file) return errorResponse(`take ${id} has no audio — it is an example row with no bytes`, 404);
    const res = await serveFile(req, filePathAbs(take.file.path), { mime: take.file.mime });
    // serveFile's not-found names no take; the sound store's own sentence does.
    return res.status === 404 ? errorResponse(`take ${id}'s file is missing from the store (${take.file.path})`, 404) : res;
  } catch (e) {
    return toErrorResponse(e);
  }
}
