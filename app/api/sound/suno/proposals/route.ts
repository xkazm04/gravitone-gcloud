// POST /api/sound/suno/proposals { fields, lane } -> 201 { proposal }
//
// A prompt the operator wrote on the canvas. Nothing is spent until it is
// queued. guardRequest as the brief set it, so imaging-auth.probe.spec.ts
// drives it: an empty body is a 400 from parseFields, before the store.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { addProposals, parseFields, parseLane } from "@/lib/sound/suno/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { fields?: unknown; lane?: unknown } | null;
    const fields = parseFields(body?.fields);
    const lane = parseLane(body?.lane);
    const [proposal] = await addProposals([{ fields, lane, origin: "custom" }]);
    return Response.json({ proposal }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
