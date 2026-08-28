// GET /api/foundry/styles — the style catalogue and the ledger behind it.

import { guardAccessOnly } from "@/lib/apiAuth";
import { getCatalogue } from "@/lib/foundry/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  return Response.json(await getCatalogue());
}
