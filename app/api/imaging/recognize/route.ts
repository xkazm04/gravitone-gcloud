// POST /api/imaging/recognize — an image and a question in, an answer out.
//
// This is what makes the /library proof sheet judged rather than merely shown:
// the app can read back what a plate actually contains and check it against
// what the style block asked for. Qwen 3.8-Max in dev, Gemini 3.6 Flash in
// production.

import { recognizeHandler } from "@/lib/imaging/handlers";
import { guardRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  // Money route — auth + rate limit before anything is read or spent.
  const denied = await guardRequest(req);
  if (denied) return denied;
  return recognizeHandler(req);
}
