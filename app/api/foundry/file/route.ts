// GET /api/foundry/file?run=<id>&path=<run-relative>[&kind=extract|training|strips] —
// serve one run file. `kind` names the output root: the forge's runs (default),
// the Extract module's (foundry-out/extract/), the Dojo's
// (foundry-out/training/), or the code-rendered strips' (foundry-out/strips/).
// Same path discipline on all four.
//
// VIDEO, FOR STRIPS ONLY. `kind=strips` also serves .mp4 and .webm, with one
// `bytes=a-b` Range honoured as a 206 — what a <video> asks for to start and to
// seek (lifted from app/api/video/clips/[id]/file/route.ts). Every other kind
// keeps runStore's SERVABLE_EXTENSIONS, images and json only. A strip's
// strip.html is never served here: it is code, and goes out only through
// /api/foundry/strips/<id>/page under a sandbox CSP.
//
// foundry-out/ sits outside public/ on purpose (third-party reference frames,
// never to be published), so the page reaches images through this seam. An
// <img> cannot carry an Authorization header, so the access secret may also
// arrive as `k=` — it is the same PUBLIC bundle value lib/apiAuth.ts already
// documents, and a query string here bounds nothing the header did not.
// Access-checked but NOT rate-limited: a gallery of fifty tiles is fifty
// requests in one second, and the money-route bucket would refuse the tail.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, fileStat } from "@/lib/foundry/store";
import { extractFileStat } from "@/lib/foundry/extract/store";
import { stripFileStat } from "@/lib/foundry/strips/store";
import { trainingFileStat } from "@/lib/foundry/training/store";
import { open, readFile } from "node:fs/promises";
import path from "node:path";

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

/** One file with one `bytes=a-b` range honoured (a suffix `bytes=-N` too);
 *  anything else gets the whole file. 416 for a range past the end. */
async function serveRanged(req: Request, abs: string, size: number, type: string): Promise<Response> {
  const base = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=3600" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let partial = false;
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    } else {
      start = Math.max(0, size - Number(m[2]));
    }
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
    partial = true;
  }
  const len = Math.max(0, end - start + 1);
  const buf = Buffer.alloc(len);
  if (len > 0) {
    const fh = await open(abs, "r");
    try {
      await fh.read(buf, 0, len, start);
    } finally {
      await fh.close();
    }
  }
  return new Response(new Uint8Array(buf), {
    status: partial ? 206 : 200,
    headers: { ...base, "content-length": String(len), ...(partial ? { "content-range": `bytes ${start}-${end}/${size}` } : {}) },
  });
}

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
  if (denied) return denied;

  const run = url.searchParams.get("run") ?? "";
  const rel = url.searchParams.get("path") ?? "";
  try {
    const kind = url.searchParams.get("kind");
    if (kind === "strips") {
      const { abs, size } = await stripFileStat(run, rel);
      const ext = path.extname(abs).toLowerCase();
      if (VIDEO.has(ext)) return await serveRanged(req, abs, size, MIME[ext]);
    }
    const { abs } =
      kind === "extract" ? await extractFileStat(run, rel)
      : kind === "training" ? await trainingFileStat(run, rel)
      : kind === "strips" ? await stripFileStat(run, rel)
      : await fileStat(run, rel);
    const bytes = await readFile(abs);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream",
        // Candidates are immutable once written (a re-forge is a new seed or
        // a new run), so the browser may hold them for the session.
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
