// What every /api/articles route answers on failure, and how it reads a body.
// Server only.
//
// NOT AN AUTH WRAPPER. Each route calls its lib/apiAuth.ts door in its own file
// (tests/golden-path/imaging-auth.probe.spec.ts reads the door off the route's
// own source, so a door hidden in here would read as an ungated route). This
// file only shapes what comes after the door.
//
// The error body is `{ error, code }`: `error` is the engine's own sentence,
// verbatim, and `code` the closed name an ArticleError carries
// (lib/articles/store.ts). The UI and the Board render `error` as the work.

import { ArticleError, readRun } from "@/lib/articles/store";

export function failure(e: unknown): Response {
  if (e instanceof ArticleError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[articles] route failed: ${message}`);
  return Response.json({ error: message, code: "internal" }, { status: 500 });
}

/** The body as a JSON object, or the 400 that says it was not one. An empty
 *  body reads as `{}` so a verb with no required field needs none. */
export async function objectBody(req: Request): Promise<Record<string, unknown> | Response> {
  const text = await req.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // falls through to the refusal
  }
  return Response.json({ error: "the request body is not a JSON object", code: "bad-body" }, { status: 400 });
}

/** A post served with the access secret as `k=` has its RELATIVE src/href
 *  rewritten to carry it too — an <img> inside an iframe sends no header, so
 *  without this every figure in the preview is refused. Absolute, rooted and
 *  fragment references are left alone. */
export function carryKey(html: string, k: string): string {
  return html.replace(/\b(src|href)="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]+)"/gi, (_, attr: string, ref: string) => {
    const sep = ref.includes("?") ? "&" : "?";
    return `${attr}="${ref}${sep}k=${encodeURIComponent(k)}"`;
  });
}

/**
 * The run must exist before a verb touches it. Checked with a plain read
 * because the store's write path takes a lock, and taking a lock creates the
 * run's directory: an approve or resume for an id that names nothing would
 * otherwise leave an empty run directory behind on every probe and typo.
 */
export async function existing(runId: string): Promise<Response | null> {
  try {
    await readRun(runId);
    return null;
  } catch (e) {
    return failure(e);
  }
}
