// /api/foundry/training/<id>/blind — the Dojo's blind picks.
//
// PATCH {edits: [{imp, pair?, pick?, anchored?, floorOverride?}]} records the
// human's A/B/tie pick per pair (pick: null clears), the "skip blind" anchor
// and the explicit below-the-floor override. Run-locked with the verdicts and
// refused on a committed cycle (lib/foundry/training/store.ts patchBlind).

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import type { BlindEdit } from "@/lib/foundry/training/blind";
import { patchBlind } from "@/lib/foundry/training/store";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not JSON." }, { status: 400 });
  }
  const edits = (body as { edits?: unknown } | null)?.edits;
  if (!Array.isArray(edits) || !edits.length || edits.some((e) => !e || typeof e !== "object" || typeof (e as BlindEdit).imp !== "string"))
    return Response.json({ detail: "`edits` must be a non-empty list of {imp, pair?, pick?, anchored?, floorOverride?}." }, { status: 400 });
  try {
    return Response.json({ blind: await patchBlind(id, edits as BlindEdit[]) });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
