// GET /api/foundry/styles — the style catalogue, the ledger behind it, and
// `_rev`, the catalogue revision (lib/foundry/catalogue.ts), so a client can
// tell the catalogue moved since it last read it.

import { guardAccessOnly } from "@/lib/apiAuth";
import { getCatalogue } from "@/lib/foundry/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  return Response.json(await getCatalogue());
}
