// POST /api/music/sfx — text-to-sound-effect. Playground seam; money route,
// gated like its siblings. The interesting dials are duration (exact, for
// picture-locked hits), prompt_influence (spec vs fishing) and loop (seamless
// ambience) — the playground exposes all three.

import { guardRequest } from "@/lib/apiAuth";
import { MusicError, statusFor } from "@/lib/music/errors";
import { generateSfx } from "@/lib/music/elevenlabs";

export const runtime = "nodejs";
export const maxDuration = 120;

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
