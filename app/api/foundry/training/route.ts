// GET /api/foundry/training — every dojo cycle the loop has left on disk,
// summarised. Polled by the gate page; access-only, never rate-limited.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { listCycles } from "@/lib/foundry/training/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  try {
    return Response.json({ cycles: await listCycles() });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
