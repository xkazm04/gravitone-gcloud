// The price table's body (its v1 route, GET /api/imaging/pricing, retired in Phase 6
// L70; pipeline/integration-imaging.mts drives it now), in a module of its own on
// purpose: a route that serves it again is admitted as DELIBERATELY_PUBLIC
// (tests/golden-path/imaging-auth.probe.spec.ts walks its runtime imports and asserts
// none reads process.env), so what it reaches must stay pricing.ts alone. handlers.ts
// re-exports this beside the other handler bodies.

import { priceTable } from "@/lib/imaging/pricing";

export function pricingHandler(): Response {
  return Response.json(priceTable());
}
