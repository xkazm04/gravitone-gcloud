// GET /api/sound/ab/[pairId]/[arm] -> one arm of a blind pair: the loudness-matched window the S1
// `yue2-post` ab-window job cut into the sound store (`<soundStoreRoot>/yue2-ab/<pairId>-<arm>.flac`,
// lib/producers/yue2Acts.ts abWindowPath), with byte ranges so the booth can seek (spark yue2-song-lab S2).
//
// THE ANSWER MUST NOT REVEAL THE TAKE. The address is the pair and the arm, never a take; the bytes are
// a cut window, not the take's file; serveFile() sends no Content-Disposition and no name, and its
// ETag is the window file's size and mtime. So nothing in the response says which take plays as A.
// A window not cut yet is a 404 in words, which the booth shows as the window still cutting.
//
// THE DOOR is route()'s `access` guard (the takes file route says why): the session cookie for the
// studio. Access-checked, not rate-bucketed: seeking issues a burst of ranges.
import { err } from "@gt/domain/errors";

import { abWindowPath } from "../../../../../../lib/producers/yue2Acts.ts";
import { route } from "../../../../../_server/route.ts";
import { serveFile } from "../../../../../_server/serveFile.ts";

export const runtime = "nodejs";

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req, params }) => {
  const p = await params;
  const pairId = p["pairId"];
  const arm = p["arm"];
  if (typeof pairId !== "string" || !/^[0-9a-f]{16}$/.test(pairId)) return err("invalid", "a blind arm is addressed by its pair id (16 hex)");
  if (arm !== "a" && arm !== "b") return err("invalid", "a blind pair has arms a and b");
  const res = await serveFile(req, abWindowPath(pairId, arm), { mime: "audio/flac", cache: "private, no-cache" });
  return res.status === 404 ? err("not-found", `arm ${arm} of pair ${pairId}: its window is not cut yet`) : res;
});
