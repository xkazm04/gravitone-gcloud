// GET /api/imaging/budget — forecast affordability and window reset timing.
//
// Gated with guardAccessOnly (lib/apiAuth.ts) rather than guardRequest:
// a caller checking budget before a click spends nothing, and counting it
// against the origin rate limiter would let pre-flight polling starve real
// generation requests (apiAuth.ts:422-433).

import { guardAccessOnly } from "@/lib/apiAuth";
import { budgetStats } from "@/lib/imaging/budget";
import { budgetQuote } from "@/lib/imaging/budgetForecast";
import { estimatePerImage } from "@/lib/imaging/pricing";

export async function GET(req: Request): Promise<Response> {
  const denied = guardAccessOnly(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const imagesParam = url.searchParams.get("images");
  const parsed = imagesParam ? parseInt(imagesParam, 10) : undefined;
  const count = Number.isFinite(parsed) && parsed! > 0 ? parsed! : 1;

  const stats = budgetStats();
  const pricing = estimatePerImage();
  const perImageUsd = typeof pricing.usd === "number" && Number.isFinite(pricing.usd) ? pricing.usd : null;
  const quote = budgetQuote({ images: count });

  return Response.json({
    ceilingUsd: stats.ceilingUsd,
    spentUsd: stats.spentUsd,
    remainingUsd: stats.remainingUsd,
    windowMs: stats.windowMs,
    perImageUsd,
    quote,
  });
}
