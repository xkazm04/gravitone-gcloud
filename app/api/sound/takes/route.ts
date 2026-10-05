// GET    /api/sound/takes?kind&verdict&stage&provider&origin&fixtures=1 -> { takes }  (newest first)
//                          &projectId&cueId   a Score cue's takes (origin "score")
// POST   /api/sound/takes  multipart `file` + `meta` (Partial<SoundTake>)     -> 201 { take }
//                           (200 { take } when a migrated row's id is already filed)
// DELETE /api/sound/takes?origin=fixture                                     -> { removed }
//
// The sound store's shelf (lib/sound/takes.ts). Access-gated, NOT rate-bucketed:
// nothing here spends a vendor balance, and the Library migration files every
// IndexedDB row through this POST in one burst — 160 fixture rows would drain
// the money bucket (lib/apiAuth.ts:422 states the same reasoning for the
// foundry). Rendering is /api/sound/generate, which IS bucketed.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, errorResponse, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { createTake, listTakes, parseTakeFilter, removeFixtures, MAX_UPLOAD_BYTES } from "@/lib/sound/takes";
import type { SoundTake } from "@/lib/sound/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json({ takes: await listTakes(parseTakeFilter(new URL(req.url).searchParams)) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 1_000_000) throw new SoundError(`the upload is over ${MAX_UPLOAD_BYTES / 1048576} MB`, 413);
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new SoundError("expected multipart/form-data with `file` and `meta`", 400);
    }
    const rawMeta = form.get("meta");
    let meta: Partial<SoundTake> = {};
    if (typeof rawMeta === "string" && rawMeta.trim()) {
      try {
        meta = JSON.parse(rawMeta) as Partial<SoundTake>;
      } catch {
        throw new SoundError("`meta` is not valid JSON", 400);
      }
    }
    const f = form.get("file");
    const file =
      f && typeof f === "object" && "arrayBuffer" in f
        ? { bytes: new Uint8Array(await (f as Blob).arrayBuffer()), mime: (f as Blob).type, name: (f as File).name ?? "" }
        : null;
    const { take, created } = await createTake(meta, file);
    return Response.json({ take }, { status: created ? 201 : 200 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Clear the examples. Fixtures only, by construction (takes.ts removeFixtures):
 *  any other `origin` is refused rather than read as "delete everything". */
export async function DELETE(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    if (new URL(req.url).searchParams.get("origin") !== "fixture")
      return errorResponse("only the examples can be cleared in bulk: DELETE /api/sound/takes?origin=fixture", 400);
    return Response.json({ removed: await removeFixtures() });
  } catch (e) {
    return toErrorResponse(e);
  }
}
