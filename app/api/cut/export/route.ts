// POST /api/cut/export — the Cut's animatic. A compiled CutDocument
// (app/_phases/cut/cutDocument.ts) and the project id in; an mp4 on the
// publish shelf out (lib/cutExport.ts). Card frames-score-cut-B.
//
// Compute route, gated like its music-video sibling: `guardRequest` first,
// then `canSpawnLocalBinaries()` BEFORE the body is parsed — a document can
// carry megabytes of data: URL plates, and a posture that forbids ffmpeg is a
// named refusal, not something to discover after decoding them.
//
// 503 for the posture, the same status and code as its two siblings behind
// `localRender` (music-video/export, ads/render). This route used to answer 403
// on the argument that 503 invites a retry no retry can satisfy — true, and
// true of every availability refusal: lib/text/errors.ts statusFor gives all
// five of them (no-key, policy-forbidden, managed-platform…) one 503 and puts
// the remedy in `code`. A client branches on the code; three spellings of one
// refusal is the thing to avoid (unified 2026-10-06). The capability is what
// keeps a client from asking at all. The sentence is `describePosture`'s, the
// one place postures are worded.
//
// maxDuration: an animatic is one still per scene, not a frame walk, so the
// encode is a fraction of the music video's; 300s is that route's ceiling
// reasoning scaled down, with room for a libx264 fallback on a long cut.

import { guardRequest } from "@/lib/apiAuth";
import { ExportError, checkCutDocument, runCutExport } from "@/lib/cutExport";
import { canSpawnLocalBinaries, describePosture, localPosture } from "@/lib/deployment";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await guardRequest(req);
  if (denied) return denied;

  if (!canSpawnLocalBinaries()) {
    return Response.json(
      {
        detail: `The animatic export spawns ffmpeg locally, and this environment will not allow it: ${describePosture(localPosture())}.`,
        code: "local-binaries-forbidden",
      },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ detail: "The request body was not a JSON object.", code: "bad-request" }, { status: 400 });
  }
  const document = checkCutDocument(body.document);
  if (typeof document === "string") return Response.json({ detail: document, code: "bad-request" }, { status: 400 });
  const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId : null;

  try {
    const result = await runCutExport({ document, projectId });
    return Response.json({ ...result, downloadUrl: `/api/cut/export/file?id=${result.id}` });
  } catch (e) {
    if (e instanceof ExportError) {
      const status = e.code === "bad-request" ? 400 : e.code === "local-binaries-forbidden" ? 503 : 500;
      return Response.json({ detail: e.message, code: e.code }, { status });
    }
    console.error("[cut/export] unexpected failure", e);
    return Response.json(
      { detail: "The animatic export failed unexpectedly. Check the server log for the real cause.", code: "failed" },
      { status: 500 },
    );
  }
}
