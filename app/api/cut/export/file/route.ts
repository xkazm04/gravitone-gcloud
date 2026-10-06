// GET /api/cut/export/file?id=<uuid> — serve a finished animatic's mp4.
//
// The animatic lands on the publish shelf (`exportsRoot()`), so this reads it
// back through the shelf's own lookup (`getExport`, which holds the id to its
// pattern) rather than rebuilding the path. Access-checked, not rate-limited,
// with the `k=` fallback for a plain download link — the same reasoning
// app/api/music-video/export/file/route.ts states for its own mp4s.

import { readFile } from "node:fs/promises";

import { guardAccessOnly } from "@/lib/apiAuth";
import { getExport } from "@/lib/publish/exports";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await guardAccessOnly(probe);
  if (denied) return denied;

  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ detail: "`id` is not a valid export id.", code: "bad-request" }, { status: 400 });
  }
  const ref = await getExport(id);
  const bytes = ref ? await readFile(ref.path).catch(() => null) : null;
  if (!bytes) return Response.json({ detail: "No export with that id (it may have been cleaned up).", code: "not-found" }, { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `attachment; filename="animatic-${id}.mp4"`,
      "cache-control": "private, max-age=86400",
    },
  });
}
