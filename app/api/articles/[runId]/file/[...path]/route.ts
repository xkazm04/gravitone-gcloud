// GET /api/articles/<runId>/file/<run-relative path>
//
// One file out of a run directory, for the gate: the post the agent drafted
// (`post/index.html` in an iframe, its `figures/`), the check's screenshots
// (`check/*.png`) and the paste-ready Medium package (`medium/`). Nothing
// else in the run is served — the manifest, the prompts and the agent receipts
// reach the Board's packet already shaped (lib/decision/v1/sources/article.ts).
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
// THE DOOR IS route()'s `access` guard (Phase 6 L70). v1 took the access secret as
// `k=` and rewrote every relative src/href in the post to carry it (`carryKey`,
// app/api/articles/_lib/respond.ts), because an <img> inside the frame sends no
// header. Both went with the last v1 page: the Board holds the session cookie, and
// the post's figures ride the same cookie with no rewrite, so the post is served
// byte-for-byte as the agent wrote it. Access-checked, not rate-limited: a post is a
// dozen files. THE BYTES ARE serveFile()'s (app/_server/serveFile.ts, Phase 6 L67).

import path from "node:path";

import { err } from "@gt/domain/errors";

import { ArticleError, inRun } from "../../../../../../lib/articles/store.ts";
import { route } from "../../../../../_server/route.ts";
import { serveFile } from "../../../../../_server/serveFile.ts";

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

export const GET = route({ guard: "access", bodyCap: 0 }, async ({ req, params }) => {
  const p = await params;
  const runId = p["runId"];
  const parts = p["path"];
  if (typeof runId !== "string" || !Array.isArray(parts)) return err("invalid", "an article file is addressed as <runId>/file/<path>");
  const rel = parts.join("/");
  // A backslash is a separator to path.resolve on Windows, so `post/..\run.json`
  // would pass a segment test and land outside the served root: refused whole.
  if (!SERVED.some((root) => rel.startsWith(root)) || rel.includes("\\") || rel.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    return err("not-found", `not a served run file: ${rel}`);
  }
  try {
    const abs = inRun(runId, rel);
    const ext = path.extname(abs).toLowerCase();
    // A draft is rewritten in place while the run works: never held, never seeked.
    const res = await serveFile(req, abs, { mime: MIME[ext] ?? "application/octet-stream", cache: "no-store", ranges: false });
    if (res.status === 404) return err("not-found", `run ${runId} has no ${rel}`);
    if (ext === ".html" || ext === ".svg") res.headers.set("content-security-policy", UNTRUSTED_CSP);
    return res;
  } catch (e) {
    // The store's own sentence and status (a run id that is not one is the store's 400).
    if (e instanceof ArticleError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    throw e;
  }
});
