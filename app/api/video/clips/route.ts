// /api/video/clips — the image-to-video hop.
//
//   POST  VideoClipRequest → 202 { clipId }     the record exists, the run is going
//         400 bad body · 503 no vendor key · 402 over the video ceiling
//         (all three before anything is dispatched; body: lib/imaging/video/errors.ts)
//   GET   → VideoCapability                     what the Animate button needs first
//
// THE RUN IS NOT TIED TO THIS REQUEST. `startClip` writes the record, reserves
// the spend and starts the run as a detached promise; it is handed to `after()`
// so the platform keeps the instance alive for it (up to maxDuration). Outside
// a request scope — a probe calling the handler directly — `after` throws and
// the detached promise is the whole of it (app/api/turns/route.ts, same shape).
//
// POST is a money route: rate bucket + access. GET discloses whether this
// server holds a vendor key, so it is access-gated too, but spends nothing and
// is read before every Animate, so it skips the bucket.

import { after } from "next/server";

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { parseClipRequest, startClip, videoCapability } from "@/lib/imaging/video/clips";
import { VideoError, videoErrorResponse } from "@/lib/imaging/video/errors";
import type { VideoClipStarted } from "@/lib/imaging/video/types";

export const runtime = "nodejs";
/** The adapter polls for up to fifteen minutes; `after()` lives as long as the route may. */
export const maxDuration = 1000;

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new VideoError("The body must be JSON.", "bad-request");
    }
    const started = await startClip(parseClipRequest(body));
    try {
      after(() => started.done);
    } catch {
      // No request scope (see the header). The run is already under way.
    }
    const out: VideoClipStarted = { clipId: started.clipId };
    return Response.json(out, { status: 202 });
  } catch (e) {
    return videoErrorResponse(e);
  }
}

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  return Response.json(videoCapability(), { headers: { "cache-control": "no-store" } });
}
