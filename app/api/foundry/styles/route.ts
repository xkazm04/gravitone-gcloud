// GET /api/foundry/styles - RETIRED (Phase 5 wave B, L54). It served the v1 Foundry's Styles
// shelf the style catalogue, the forge ledger behind it and `_rev`. The catalogue is the kernel
// store's `styles` table now (pipeline/foundry/styles.json is its export, for the Python readers),
// read in the Library as the style kind and worked in the style atelier; the shelf and its plant
// station count are gone with it. 410 with the new address, still behind the access door, so a
// stale client is told where the catalogue went and an anonymous one is told nothing.

import { guardAccessOnly } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  return Response.json({ detail: "The style catalogue moved to the Library: /library?kind=style.", moved: "/library?kind=style", code: "retired" }, { status: 410 });
}
