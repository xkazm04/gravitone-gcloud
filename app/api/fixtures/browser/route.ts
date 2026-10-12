// GET /api/fixtures/browser -> BrowserBundle   (fixture mode only)
//
// Serves <fixtures-out>/browser.json, written by `npm run fixtures`. To an
// authorised caller outside fixture mode this route does not exist: it answers
// 404 exactly as an unbuilt route would, so a real deployment advertises
// nothing. An unauthorised one is refused before that, and learns neither.

import { readFile } from "node:fs/promises";

import { guardAccessOnly } from "@/lib/apiAuth";
import { FIXTURE_MODE } from "@/lib/fixtures/mode";
import { outPath } from "@/lib/fixtures/roots";

export const runtime = "nodejs";

// THE READ DOOR, BEFORE THE MODE CHECK, and the order is the point: gating
// second would make 404-or-401 an answer about which build this is, handed to a
// caller who has shown nothing. `guardAccessOnly` admits the fixture dev server
// without a header (`devOpen()` in lib/apiAuth.ts: a non-production build with
// NEXT_PUBLIC_DEV_AUTH=1, which `npm run dev:fixtures` sets), so the seeding
// fetch in lib/fixtures/seedBrowser.ts needs no credential it does not have -
// dev-auth sessions hold no ID token (lib/sessionToken.ts).
export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  if (!FIXTURE_MODE) return new Response(null, { status: 404 });
  try {
    return new Response(await readFile(outPath("browser.json"), "utf8"), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return Response.json({ error: "no fixtures generated yet — run `npm run fixtures`" }, { status: 503 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
