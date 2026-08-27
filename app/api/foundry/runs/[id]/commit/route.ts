// POST /api/foundry/runs/<id>/commit — delete the rejected, index the decided.
//
// Destructive and one-way: the page confirms with exact counts before it
// calls this. `undecidedAs` says what happens to candidates nobody judged —
// "reject" is the cull the page defaults to (keep what was chosen, the rest
// goes), "leave" keeps them on disk and out of the indices.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, commitRun } from "@/lib/foundry/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { undecidedAs?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is allowed */
  }
  const undecidedAs = body.undecidedAs === "leave" ? "leave" : "reject";
  try {
    return Response.json(await commitRun(id, undecidedAs));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
