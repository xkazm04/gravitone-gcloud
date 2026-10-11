// POST /api/sound/suno/queue { proposalIds } | { huntNodeIds, lane? } -> 201 { jobs }
//
// Queue prompts for the Suno worker: every job renders on both models, two
// clips each. MONEY ROUTE - each job is Suno credits on the operator's
// account - so guardRequest, and imaging-auth.probe.spec.ts drives it: an
// empty body is a 400 before the store is touched. Hunt leaves are converted
// to one proposal each (idempotent per leaf) and queued through it.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { enqueueHuntLeaves, enqueueProposals } from "@/lib/sound/suno/queue";
import { parseLane } from "@/lib/sound/suno/store";

export const runtime = "nodejs";

const ids = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null);

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { proposalIds?: unknown; huntNodeIds?: unknown; lane?: unknown } | null;
    const proposalIds = ids(body?.proposalIds);
    const huntNodeIds = ids(body?.huntNodeIds);
    if (proposalIds?.length) return Response.json({ jobs: await enqueueProposals(proposalIds) }, { status: 201 });
    if (huntNodeIds?.length) {
      const lane = body?.lane === undefined ? null : parseLane(body.lane);
      return Response.json({ jobs: await enqueueHuntLeaves(huntNodeIds, lane) }, { status: 201 });
    }
    throw new SoundError('name what to queue: "proposalIds" or "huntNodeIds", a non-empty list of ids', 400);
  } catch (e) {
    return toErrorResponse(e);
  }
}
