// POST /api/music/sfx — text-to-sound-effect. Playground seam; money route,
// gated like its siblings. The interesting dials are duration (exact, for
// picture-locked hits), prompt_influence (spec vs fishing) and loop (seamless
// ambience) — the playground exposes all three.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { generateSfx } from "@/lib/music/elevenlabs";

export const runtime = "nodejs";
// LONGER THAN THE VENDOR DEADLINE IT RELIES ON, which is the only correct
// relationship between the two. vendorFetch aborts at TIMEOUT_MS (240s,
// lib/music/elevenlabs.ts) and throws a `timeout` MusicError naming the vendor
// and the number. This used to be 120 -- SHORTER than that -- so the platform
// killed the request first and elevenlabs.ts's own message, "The vendor did not
// answer within 240s", was literally unreachable on this route. The caller got
// an unclassified 5xx instead, indistinguishable from a slow render.
//
// That is the exact failure 737860e fixed for generate/compose (both 300) by
// making the abort span the body read; it was reintroduced here by a route
// config that never moved with it. The rule: no route's platform deadline may
// be shorter than the vendor deadline it depends on.
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 2000)
      return Response.json({ detail: '"text" must be 1..2000 chars.', code: "bad-request" }, { status: 400 });

    const out = await generateSfx({
      text,
      durationSeconds: typeof body.durationSeconds === "number" ? body.durationSeconds : undefined,
      promptInfluence: typeof body.promptInfluence === "number" ? body.promptInfluence : undefined,
      loop: typeof body.loop === "boolean" ? body.loop : undefined,
    });
    return Response.json(out);
  } catch (e) {
    if (e instanceof MusicError) return Response.json({ detail: e.message, code: e.kind }, { status: statusFor(e.kind) });
    return Response.json({ detail: "The SFX call failed unexpectedly.", code: "failed" }, { status: 500 });
  }
}
