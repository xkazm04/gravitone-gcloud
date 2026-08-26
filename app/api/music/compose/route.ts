// POST /api/music/compose — the playground's raw compose seam: a prompt OR a
// wire-level composition plan in, audio + song id + the vendor's plan out.
//
// This is deliberately a SECOND music route rather than a mode on
// /api/music/generate: that route speaks CueBrief and the doctrine translates,
// so production callers cannot send what the doctrine would not produce. The
// playground's whole job is the opposite — exercise the raw feature surface,
// section editing included (a plan here may mix generation chunks with
// audio-reference chunks against a stored song id). Money route: gated.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { composeDetailed } from "@/lib/music/elevenlabs";
import type { WirePlan } from "@/lib/music/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : undefined;
    const plan = body.plan && typeof body.plan === "object" ? (body.plan as WirePlan) : undefined;
    const lengthMs = typeof body.lengthMs === "number" ? body.lengthMs : undefined;

    const out = await composeDetailed({
      prompt,
      plan,
      lengthMs,
      // Always store: the whole point of this surface is that any render can
      // become the source of a section edit one panel later.
      storeForInpainting: true,
    });
    return Response.json(out);
  } catch (e) {
    if (e instanceof MusicError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    return Response.json({ detail: "The compose call failed unexpectedly.", code: "failed" }, { status: 500 });
  }
}
