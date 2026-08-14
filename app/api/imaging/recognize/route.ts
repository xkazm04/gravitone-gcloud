// POST /api/imaging/recognize — an image and a question in, an answer out.
//
// This is what makes the /library proof sheet judged rather than merely shown:
// the app can read back what a plate actually contains and check it against
// what the style block asked for. Qwen 3.8-Max in dev, Gemini 3.6 Flash in
// production.

import { asImage, asSteer, asString, errorResponse, readJson } from "@/lib/imaging/api";
import { BadRequest } from "@/lib/imaging/api";
import { recognize } from "@/lib/imaging/router";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  try {
    const body = await readJson(req);

    let schema: Record<string, unknown> | undefined;
    if (body.schema !== undefined && body.schema !== null) {
      if (typeof body.schema !== "object" || Array.isArray(body.schema))
        throw new BadRequest("`schema` must be a JSON Schema object.");
      schema = body.schema as Record<string, unknown>;
    }

    const out = await recognize({
      ...asSteer(body),
      image: asImage(body.image, "image"),
      instruction: asString(body.instruction, "instruction"),
      schema,
    });
    return Response.json(out);
  } catch (e) {
    return errorResponse(e);
  }
}
