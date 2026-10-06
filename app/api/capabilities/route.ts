// GET /api/capabilities -> CapabilitiesAnswer
//
// The capability matrix as THIS server computes it: the flags, plus the two
// facts a browser bundle cannot see (is the music key set, may this process
// spawn ffmpeg). lib/useCapabilities.ts is the one reader.
//
// Access-gated, never rate-counted — the same shape as GET /api/video/clips:
// the answer discloses whether a vendor key is configured, which
// /api/music/pricing is audited never to do, and it is read on every mount of a
// surface that spends.

import { guardAccessOnly } from "@/lib/apiAuth";
import { capabilities, type CapabilitiesAnswer } from "@/lib/capabilities";
import { deploymentFacts } from "@/lib/serverCapabilities";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const facts = deploymentFacts();
  const out: CapabilitiesAnswer = { capabilities: capabilities(facts), facts };
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
