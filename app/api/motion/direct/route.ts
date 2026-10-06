// POST /api/motion/direct — one plate in, a proposed motion line or a decline out.
//
// The Motion step's direction turn (app/_phases/motion/direction.ts): two
// `recognize` passes over the plate — READ what is in it, PROPOSE what moves —
// ported from pipeline/video/motion_author.py, with the decline that file could
// not make. Body: `{ image: { base64, mime }, prefer?, avoid? }`.
//
//   200 `{ outcome }`   `proposed` with its basis, or `declined` with a reason —
//                       both are answers; a decline is not an error
//   400                 no plate, or a plate this layer cannot send
//   401 / 429           the money door (lib/apiAuth), before anything is read
//   4xx / 5xx           the imaging layer's own vocabulary (lib/imaging/api)
//
// Nothing is stored here. The outcome goes back to the step, which keeps it in
// its own record and writes `FrameClip.motion` only when the creator accepts.

import { asImage, asSteer, errorResponse, readJson } from "@/lib/imaging/api";
import { recognize } from "@/lib/imaging/router";
import { guardRequest } from "@/lib/apiAuth";

import { directMotion } from "@/app/_phases/motion/direction";

export const runtime = "nodejs";
/** Two vision passes on a local annotator are tens of seconds each. */
export const maxDuration = 300;

export async function POST(req: Request) {
  // Money route: two recognize calls per request — auth + rate limit first.
  const denied = await guardRequest(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    const image = asImage(body.image, "image");
    const outcome = await directMotion(image, recognize, asSteer(body));
    return Response.json({ outcome });
  } catch (e) {
    return errorResponse(e);
  }
}
