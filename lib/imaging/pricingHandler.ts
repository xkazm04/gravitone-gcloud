// GET /api/imaging/pricing's body, in a module of its own on purpose: the route is
// DELIBERATELY_PUBLIC (tests/golden-path/imaging-auth.probe.spec.ts walks its runtime
// imports and asserts none reads process.env), so what it reaches must stay
// pricing.ts alone. handlers.ts re-exports this beside the gated handlers.

import { priceTable } from "@/lib/imaging/pricing";

export function pricingHandler(): Response {
  return Response.json(priceTable());
}
