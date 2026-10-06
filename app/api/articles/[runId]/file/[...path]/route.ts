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

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { guardAccessOnly } from "@/lib/apiAuth";
import { inRun } from "@/lib/articles/store";

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
  if (denied) return denied;

  const { runId, path: parts } = await params;
  const rel = parts.join("/");
  // A backslash is a separator to path.resolve on Windows, so `post/..\run.json`
  // would pass a segment test and land outside the served root: refused whole.
  if (!SERVED.some((root) => rel.startsWith(root)) || rel.includes("\\") || rel.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    return Response.json({ error: `not a served run file: ${rel}`, code: "bad-path" }, { status: 404 });
  }
  try {
    const abs = inRun(runId, rel);
    const s = await stat(abs).catch(() => null);
    if (!s?.isFile()) return Response.json({ error: `run ${runId} has no ${rel}`, code: "not-found" }, { status: 404 });
    const ext = path.extname(abs).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    const headers: Record<string, string> = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (ext === ".html" || ext === ".svg") headers["content-security-policy"] = UNTRUSTED_CSP;
    if (ext === ".html" && k) return new Response(carryKey(await readFile(abs, "utf8"), k), { headers });
    return new Response(new Uint8Array(await readFile(abs)), { headers });
  } catch (e) {
    return failure(e);
  }
}
