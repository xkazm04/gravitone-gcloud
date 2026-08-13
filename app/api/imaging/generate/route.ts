// POST /api/imaging/generate — a prompt in, plate images out.
//
// The seam exists because the API key must never reach the browser. Which
// vendor answers is the router's decision, not the caller's: in dev that is
// Leonardo (Lucid Origin), in production Nano Banana 2 Lite.

import { asAspect, asCount, asImages, asString, errorResponse, readJson } from "@/lib/imaging/api";
import { generate } from "@/lib/imaging/router";

export const runtime = "nodejs";
/** Leonardo polls for up to three minutes; give the handler room past that. */
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const out = await generate({
      prompt: asString(body.prompt, "prompt"),
      negativePrompt: body.negativePrompt === undefined ? undefined : asString(body.negativePrompt, "negativePrompt"),
      aspect: asAspect(body.aspect),
      count: asCount(body.count),
      // 14 is the production model's reference-image window.
      references: asImages(body.references, "references", 14),
      seed: typeof body.seed === "number" ? body.seed : undefined,
    });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
