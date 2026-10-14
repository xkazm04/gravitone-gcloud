// The imaging routes' handler bodies, lifted out of app/api/imaging/*/route.ts so
// a CLI or probe can drive them without importing a Next route module.
//
// THE AUTH DOOR IS NOT HERE. Every route.ts keeps its own `guardRequest` /
// `guardAccessOnly` call and invokes one of these only after it passed, because
// tests/golden-path/imaging-auth.probe.spec.ts checks the door per route file.
// `export const runtime` / `maxDuration` stay in the route files too: Next reads
// them from there.

import {
  asAspect,
  asCount,
  asImage,
  asImages,
  asSteer,
  asString,
  BadRequest,
  errorResponse,
  readJson,
  respondKeyed,
} from "@/lib/imaging/api";
import { budgetStats } from "@/lib/imaging/budget";
import { budgetQuote } from "@/lib/imaging/budgetForecast";
import { estimatePerImage } from "@/lib/imaging/pricing";
import { edit, generate, recognize } from "@/lib/imaging/router";

/** POST /api/imaging/generate — a prompt in, plate images out. */
export async function generateHandler(req: Request): Promise<Response> {
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

/** POST /api/imaging/edit — an image and an instruction in, the adjusted image out. */
export async function editHandler(req: Request): Promise<Response> {
  try {
    const body = await readJson(req);
    const request = {
      ...asSteer(body),
      image: asImage(body.image, "image"),
      instruction: asString(body.instruction, "instruction"),
      // One slot of the reference window is spent on the subject itself.
      references: asImages(body.references, "references", 13),
    };
    // Keyed like generate: a duplicate joins or replays (lib/imaging/receipts.ts).
    return await respondKeyed(req, "edit", request, () => edit(request));
  } catch (e) {
    return errorResponse(e);
  }
}

/** POST /api/imaging/recognize — an image and a question in, an answer out. */
export async function recognizeHandler(req: Request): Promise<Response> {
  try {
    const body = await readJson(req);

    let schema: Record<string, unknown> | undefined;
    if (body.schema !== undefined && body.schema !== null) {
      if (typeof body.schema !== "object" || Array.isArray(body.schema))
        throw new BadRequest("`schema` must be a JSON Schema object.");
      schema = body.schema as Record<string, unknown>;
    }

    const out = await recognize({
      ...asSteer(body),
      image: asImage(body.image, "image"),
      instruction: asString(body.instruction, "instruction"),
      schema,
    });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}

export { pricingHandler } from "@/lib/imaging/pricingHandler";

/** GET /api/imaging/budget — forecast affordability and window reset timing. */
export async function budgetHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const imagesParam = url.searchParams.get("images");
  const parsed = imagesParam ? parseInt(imagesParam, 10) : undefined;
  const count = Number.isFinite(parsed) && parsed! > 0 ? parsed! : 1;

  const stats = await budgetStats();
  const pricing = estimatePerImage();
  const perImageUsd = typeof pricing.usd === "number" && Number.isFinite(pricing.usd) ? pricing.usd : null;
  const quote = await budgetQuote({ images: count });

  return Response.json({
    ceilingUsd: stats.ceilingUsd,
    spentUsd: stats.spentUsd,
    remainingUsd: stats.remainingUsd,
    windowMs: stats.windowMs,
    // Where the window lives: this machine's ledger file, or (pinned or on the
    // managed posture) this process alone, with the reason.
    store: stats.store,
    ...(stats.storeReason ? { storeReason: stats.storeReason } : {}),
    perImageUsd,
    quote,
  });
}
