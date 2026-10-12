// POST /api/imaging/generate — a prompt in, plate images out.
//
// The seam exists because the API key must never reach the browser. Which
// vendor answers is the router's decision — Google in both environments, with
// Leonardo behind it in dev. A caller may steer that with `prefer`/`avoid`
// (`avoid` is the move after a safety refusal), but it cannot name a vendor
// outright: the plan still decides, and provenance reports who served.

import {
  asAspect,
  asCount,
  asImages,
  asSteer,
  asString,
  errorResponse,
  readJson,
  respondKeyed,
} from "@/lib/imaging/api";
import { generate } from "@/lib/imaging/router";
import { guardRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
/** Leonardo polls for up to three minutes; give the handler room past that. */
export const maxDuration = 300;

export async function POST(req: Request) {
  // Money route — auth + rate limit before anything is read or spent.
  const denied = await guardRequest(req);
  if (denied) return denied;
  try {
    const body = await readJson(req);
    const request = {
      ...asSteer(body),
      prompt: asString(body.prompt, "prompt"),
      negativePrompt: body.negativePrompt === undefined ? undefined : asString(body.negativePrompt, "negativePrompt"),
      aspect: asAspect(body.aspect),
      count: asCount(body.count),
      // 14 is the production model's reference-image window.
      references: asImages(body.references, "references", 14),
      seed: typeof body.seed === "number" ? body.seed : undefined,
    };
    // An `idempotency-key` makes the paid result outlive this response: a
    // duplicate joins the call in flight or replays it (lib/imaging/receipts.ts).
    return await respondKeyed(req, "generate", request, () => generate(request));
  } catch (e) {
    return errorResponse(e);
  }
}
