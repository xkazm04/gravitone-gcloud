// GET /api/articles/<runId>/file/<run-relative path>[?k=<access secret>]
//
// One file out of a run directory, for the gate: the post the agent drafted
// (`post/index.html` in an iframe, its `figures/`), the check's screenshots
// (`check/*.png`) and the paste-ready Medium package (`medium/`). Nothing
// else in the run is served — the manifest, the prompts and the agent receipts
// reach the page through GET /api/articles/<runId>, already shaped.
//
// A PATH, NOT A QUERY. The post links its figures relatively
// (`<img src="figures/01-x.svg">`), so the page has to be served from a URL
// whose directory is the post's; a `?path=` seam would send every figure to
// the wrong place.
//
// UNTRUSTED CONTENT. The post was written by a model that read the open web.
// HTML and SVG go out under a CSP that loads nothing from the network and runs
// no script (`sandbox`), and the page frames it in a sandboxed iframe as well:
// the preview shows what the reader will see and can do nothing else.
//
// THE SECRET. An <iframe> or <img> cannot carry an Authorization header, so
// the access secret may arrive as `k=`, as on /api/foundry/file — the same
// public bundle value lib/apiAuth.ts documents. A post served with `k` has its
// relative src/href rewritten to carry it, or every figure inside the frame
// would be refused. Access-checked, not rate-limited: a post is a dozen files.
//
// KEPT PAST PHASE 6: the Board's article packet (lib/decision/v1/sources/article.ts)
// frames the post from here. The studio sends no `k` - it holds the session cookie,
// which v1's door never read - so a refusal with nothing presented is asked again
// through route()'s guard (app/_server/route.ts guardOf), the cookie consulted only
// when no credential of its own was presented; a post framed that way needs no
// rewrite, its figures ride the same cookie. `k` goes with the last v1 page.
// THE BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67), streamed with
// an ETag, except the one body this route must rewrite (a post served with `k`).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { guardAccessOnly } from "@/lib/apiAuth";
import { inRun } from "@/lib/articles/store";

import { guardOf } from "../../../../../_server/route.ts";
import { serveFile } from "../../../../../_server/serveFile.ts";
import { carryKey, failure } from "../../../_lib/respond";

export const runtime = "nodejs";

const SERVED = ["post/", "check/", "medium/"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const UNTRUSTED_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:; sandbox";

export async function GET(req: Request, { params }: { params: Promise<{ runId: string; path: string[] }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await guardAccessOnly(probe);
  if (denied !== null && !("who" in (await guardOf(probe, "access")))) return denied;

  const { runId, path: parts } = await params;
  const rel = parts.join("/");
  // A backslash is a separator to path.resolve on Windows, so `post/..\run.json`
  // would pass a segment test and land outside the served root: refused whole.
  if (!SERVED.some((root) => rel.startsWith(root)) || rel.includes("\\") || rel.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    return Response.json({ error: `not a served run file: ${rel}`, code: "bad-path" }, { status: 404 });
  }
  try {
    const abs = inRun(runId, rel);
    const ext = path.extname(abs).toLowerCase();
    const extra: Record<string, string> = { "x-content-type-options": "nosniff" };
    if (ext === ".html" || ext === ".svg") extra["content-security-policy"] = UNTRUSTED_CSP;
    const type = MIME[ext] ?? "application/octet-stream";
    if (ext === ".html" && k) {
      const html = await readFile(abs, "utf8").catch(() => null);
      if (html === null) return Response.json({ error: `run ${runId} has no ${rel}`, code: "not-found" }, { status: 404 });
      return new Response(carryKey(html, k), { headers: { "content-type": type, "cache-control": "no-store", ...extra } });
    }
    // A draft is rewritten in place while the run works: never held, never seeked.
    const res = await serveFile(req, abs, { mime: type, cache: "no-store", ranges: false });
    if (res.status === 404) return Response.json({ error: `run ${runId} has no ${rel}`, code: "not-found" }, { status: 404 });
    for (const [h, v] of Object.entries(extra)) res.headers.set(h, v);
    return res;
  } catch (e) {
    return failure(e);
  }
}
