// POST /api/music/plan — a prompt in, a draft composition plan out.
//
// Playground seam. Costs no vendor credits (the plan endpoint is free and
// rate-limited only), but it is still key-holding and therefore still behind
// the access gate — free for us is not free for whoever finds the origin.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { draftPlan } from "@/lib/music/elevenlabs";
import type { WirePlan } from "@/lib/music/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 4100)
      return Response.json({ detail: '"prompt" must be 1..4100 chars.', code: "bad-request" }, { status: 400 });
    const lengthMs = typeof body.lengthMs === "number" ? body.lengthMs : undefined;
    if (lengthMs !== undefined && (lengthMs < 3_000 || lengthMs > 300_000))
      return Response.json({ detail: "lengthMs runs 3000..300000 for plans.", code: "bad-request" }, { status: 400 });

    const plan = await draftPlan({
      prompt,
      lengthMs,
      style: typeof body.style === "string" ? body.style : undefined,
      negativeStyle: typeof body.negativeStyle === "string" ? body.negativeStyle : undefined,
      sourcePlan: body.sourcePlan ? (body.sourcePlan as WirePlan) : undefined,
    });
    return Response.json({ plan });
  } catch (e) {
    if (e instanceof MusicError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    return Response.json({ detail: "The plan call failed unexpectedly.", code: "failed" }, { status: 500 });
  }
}
