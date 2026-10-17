// GET /api/foundry/file?run=<id>&path=<run-relative>[&kind=extract|training|strips] —
// serve one run file. `kind` names the output root: the forge's runs (default),
// the Extract module's (foundry-out/extract/), the Dojo's
// (foundry-out/training/), or the code-rendered strips' (foundry-out/strips/).
// Same path discipline on all four.
//
// VIDEO, FOR STRIPS ONLY. `kind=strips` also serves .mp4 and .webm, with a
// Range honoured as a 206 — what a <video> asks for to start and to seek. Every
// other kind keeps runStore's SERVABLE_EXTENSIONS, images and json only. A
// strip's strip.html is never served here: it is code, and goes out only
// through /api/foundry/strips/<id>/page under a sandbox CSP.
//
// KEPT PAST PHASE 6: the Board's forge, extract, strips and Dojo packets draw
// their candidates from here (lib/decision/v1/types.ts foundryFileUrl). THE
// BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67), which lists
// this route's `serveRanged` among the copies it absorbed: that copy allocated
// the whole range in memory (a `bytes=0-` on a long strip was the strip on the
// heap) and every image was read whole into a buffer; both stream now, with an
// ETag. Ranges stay video-only, as before - an <img> never seeks.
//
// foundry-out/ sits outside public/ on purpose (third-party reference frames,
// never to be published), so the page reaches images through this seam. An
// <img> cannot carry an Authorization header, so the access secret may also
// arrive as `k=` — it is the same PUBLIC bundle value lib/apiAuth.ts already
// documents, and a query string here bounds nothing the header did not. The
// studio's Board sends no `k`: it holds the session cookie, which v1's door
// never read, so a refusal with nothing presented is asked again through
// route()'s guard (app/_server/route.ts guardOf), the cookie consulted only
// when no credential of its own was presented. `k` goes with the last v1 page.
// Access-checked but NOT rate-limited: a gallery of fifty tiles is fifty
// requests in one second, and the money-route bucket would refuse the tail.

import path from "node:path";

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, fileStat } from "@/lib/foundry/store";
import { extractFileStat } from "@/lib/foundry/extract/store";
import { stripFileStat } from "@/lib/foundry/strips/store";
import { trainingFileStat } from "@/lib/foundry/training/store";

import { guardOf } from "../../../_server/route.ts";
import { serveFile } from "../../../_server/serveFile.ts";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const VIDEO = new Set([".mp4", ".webm"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  // THE SAME THREE SENTENCES EVERY OTHER GATED ROUTE GIVES. This used to answer
  // a bare "Access denied." for all three verdicts, so a deployment with no
  // IMAGING_ACCESS_SECRET configured — the fail-closed default — showed a
  // gallery of broken tiles whose only word was one that sends a reader to
  // check the key they presented, not the one the server never had.
  const denied = await guardAccessOnly(probe);
  if (denied !== null && !("who" in (await guardOf(probe, "access")))) return denied;

  const run = url.searchParams.get("run") ?? "";
  const rel = url.searchParams.get("path") ?? "";
  try {
    const kind = url.searchParams.get("kind");
    const { abs } =
      kind === "extract" ? await extractFileStat(run, rel)
      : kind === "training" ? await trainingFileStat(run, rel)
      : kind === "strips" ? await stripFileStat(run, rel)
      : await fileStat(run, rel);
    const ext = path.extname(abs).toLowerCase();
    // Candidates are immutable once written (a re-forge is a new seed or a new
    // run), so the browser may hold them for the session: serveFile's default.
    return await serveFile(req, abs, { mime: MIME[ext] ?? "application/octet-stream", ranges: kind === "strips" && VIDEO.has(ext) });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
