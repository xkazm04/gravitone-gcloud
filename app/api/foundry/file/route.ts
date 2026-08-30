// GET /api/foundry/file?run=<id>&path=<run-relative>[&kind=extract|training] —
// serve one run file. `kind` names the output root: the forge's runs (default),
// the Extract module's (foundry-out/extract/), or the Dojo's
// (foundry-out/training/). Same path discipline on all three.
//
// foundry-out/ sits outside public/ on purpose (third-party reference frames,
// never to be published), so the page reaches images through this seam. An
// <img> cannot carry an Authorization header, so the access secret may also
// arrive as `k=` — it is the same PUBLIC bundle value lib/apiAuth.ts already
// documents, and a query string here bounds nothing the header did not.
// Access-checked but NOT rate-limited: a gallery of fifty tiles is fifty
// requests in one second, and the money-route bucket would refuse the tail.

import { checkAccess } from "@/lib/apiAuth";
import { FoundryError, fileStat } from "@/lib/foundry/store";
import { extractFileStat } from "@/lib/foundry/extract/store";
import { trainingFileStat } from "@/lib/foundry/training/store";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  if (checkAccess(probe) !== "ok") return Response.json({ detail: "Access denied." }, { status: 401 });

  const run = url.searchParams.get("run") ?? "";
  const rel = url.searchParams.get("path") ?? "";
  try {
    const kind = url.searchParams.get("kind");
    const { abs } =
      kind === "extract" ? await extractFileStat(run, rel)
      : kind === "training" ? await trainingFileStat(run, rel)
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
