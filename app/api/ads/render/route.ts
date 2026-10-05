// POST /api/ads/render — the ads Finish step's render: adopted clips, drawn
// supers and end-card, an optional music bed, one aspect → one mp4.
//
//   202 `{ exportId }`   validated, every clip found on disk, record written as
//                        `queued`; the render runs after the response
//   400                  a body lib/adRender.ts cannot render (it names the field)
//   404                  a clip or the music take is not on this machine
//   503                  this deployment may not spawn ffmpeg / Chromium
//
// Failures answer `AdErrorBody` ({ error, message }), the ads family's one shape.
//
// THE RENDER IS NOT TIED TO THIS REQUEST — the same shape as /api/turns: the
// work is a detached promise in this process, handed to `after()` so the
// platform keeps the instance alive for it. Outside a request scope (a probe
// calling the handler directly) `after` throws and the detached promise is the
// whole of it. GET /api/ads/render/<id> is what the step polls.
//
// Compute route: `guardRequest` first. Gated a second time on the posture —
// ffmpeg and headless Chromium are local-binary spawns — before the body is read.

import { after } from "next/server";

import { guardRequest } from "@/lib/apiAuth";
import { canSpawnLocalBinaries, describePosture, localPosture } from "@/lib/deployment";
import { AdRenderError, startAdRender } from "@/lib/adRender";
import type { AdErrorBody } from "@/lib/ads/types";

export const runtime = "nodejs";
/** A 30s spot at 1080p through libx264 plus overlay drawing is well under a
 *  minute on the dev machine; 900 matches the music-video export's ceiling,
 *  which `after()` lives inside. */
export const maxDuration = 900;

const fail = (status: number, error: string, message: string) =>
  Response.json({ error, message } satisfies AdErrorBody, { status });

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;

  if (!canSpawnLocalBinaries())
    return fail(
      503,
      "local-binaries-forbidden",
      `Ad render spawns ffmpeg and a headless browser on this machine, and this environment will not allow it: ${describePosture(localPosture())}.`,
    );

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad-request", "The body must be JSON: an AdRenderRequest.");
  }

  try {
    const { exportId, done } = await startAdRender(body);
    try {
      after(() => done);
    } catch {
      // No request scope (see the header). The render is already under way.
    }
    return Response.json({ exportId }, { status: 202 });
  } catch (e) {
    if (e instanceof AdRenderError) return fail(e.status, e.code, e.message);
    console.error("[ads/render] unexpected failure", e);
    return fail(500, "failed", "The render could not be queued. Check the server log for the real cause.");
  }
}
