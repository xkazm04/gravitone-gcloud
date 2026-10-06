// PATCH /api/sound/hunts/[id] { nodes?, lessonId? } -> { hunt }
//
// The operator's edits to a drafted map: node states, renders attached,
// winners marked, the confirmed lesson linked. A node that BECOMES a winner
// keeps its unjudged takes in the same transaction (lib/sound/hunt.ts
// patchHunt), so a winner reaches Arrangement's pending column without a
// second request that could be lost between the two.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { patchHunt } from "@/lib/sound/hunt";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ hunt: await patchHunt(id, await readJson(req)) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
