// POST /api/foundry/training/<id>/commit — copy the approved keepers into git,
// delete the decided media, append the ledger rows.
//
// Destructive and one-way: the gate page confirms with exact counts before it
// calls this. Undecided improvements keep their media on disk.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { commitCycle } from "@/lib/foundry/training/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await commitCycle(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
