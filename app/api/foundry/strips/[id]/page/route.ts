// GET /api/foundry/strips/<id>/page?card=<cardId>[&k=<access secret>] — one
// card's authored strip.html, for the lightbox's live view and nothing else.
//
// UNTRUSTED CODE. The page was written by a model, and unlike an article it
// RUNS: `renderFrameAt(i)` is the whole point of it. So it goes out under a
// CSP that loads nothing from the network, allows only its own inline script
// and style, and is itself a sandbox (`sandbox allow-scripts`, no
// allow-same-origin: an opaque origin with no reach into the app's storage or
// cookies) — and the tab frames it in `<iframe sandbox="allow-scripts">` as
// well, so either fence alone still holds. The file route never serves .html.
//
// A Leonardo asset referenced RELATIVELY by the page does not resolve here
// (the URL's directory is this route's, not the card's); the CSP allows
// `data:` images, which is what an inlined asset is.
//
// THE SECRET may arrive as `k=`, as on /api/foundry/file: an iframe cannot
// carry an Authorization header. Access-checked, not rate-limited.

import { readFile } from "node:fs/promises";

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { stripPageFile } from "@/lib/foundry/strips/store";

export const runtime = "nodejs";

const STRIP_PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: 'self'; font-src data:; sandbox allow-scripts";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await guardAccessOnly(probe);
  if (denied) return denied;
  const { id } = await params;
  const card = url.searchParams.get("card") ?? "";
  try {
    const abs = await stripPageFile(id, card);
    return new Response(await readFile(abs, "utf8"), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": STRIP_PAGE_CSP,
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
