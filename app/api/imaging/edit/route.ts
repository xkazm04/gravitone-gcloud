// POST /api/imaging/edit — an image and an instruction in, the adjusted image
// out. Nano Banana 2 Lite in both environments; Leonardo has no equivalent.

import { asImage, asImages, asString, errorResponse, readJson } from "@/lib/imaging/api";
import { edit } from "@/lib/imaging/router";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const out = await edit({
      image: asImage(body.image, "image"),
      instruction: asString(body.instruction, "instruction"),
      // One slot of the reference window is spent on the subject itself.
      references: asImages(body.references, "references", 13),
    });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
