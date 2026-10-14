// POST /api/imaging/edit — an image and an instruction in, the adjusted image
// out. Nano Banana 2 Lite in both environments; Leonardo has no equivalent.

import { editHandler } from "@/lib/imaging/handlers";
import { guardRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  // Money route — auth + rate limit before anything is read or spent.
  const denied = await guardRequest(req);
  if (denied) return denied;
  return editHandler(req);
}
