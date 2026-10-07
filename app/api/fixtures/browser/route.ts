// GET /api/fixtures/browser -> BrowserBundle   (fixture mode only)
//
// Serves <fixtures-out>/browser.json, written by `npm run fixtures`. Outside
// fixture mode this route does not exist: it answers 404 exactly as an unbuilt
// route would, so a real deployment advertises nothing.

import { readFile } from "node:fs/promises";

import { FIXTURE_MODE } from "@/lib/fixtures/mode";
import { outPath } from "@/lib/fixtures/roots";

export const runtime = "nodejs";

export async function GET() {
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
