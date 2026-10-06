// GET /api/video/clips/[id] — one clip's stored record (ClipRecord).
//
// The poll. Access-checked, NOT rate-limited: a clip is minutes of rendering
// and the Frames surface reads this every few seconds per shot in flight,
// which would drain the money routes' bucket and refuse the next real Animate
// (lib/apiAuth.ts guardAccessOnly states the same trade for the foundry).

import { guardAccessOnly } from "@/lib/apiAuth";
import { readClip } from "@/lib/imaging/video/clips";
import { VideoError, videoErrorResponse } from "@/lib/imaging/video/errors";
import { isClipId } from "@/lib/imaging/video/store";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!isClipId(id)) throw new VideoError("Not a clip id.", "not-found");
    const rec = await readClip(id);
    if (!rec) throw new VideoError(`No clip ${id} on this server.`, "not-found");
    return Response.json(rec, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return videoErrorResponse(e);
  }
}
