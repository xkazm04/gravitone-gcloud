// GET /api/ads/render/<id>/file — a finished ad export's mp4, as a download.
//
// `k=` QUERY FALLBACK, same reason and shape as /api/music-video/export/file: a
// plain `<a href download>` cannot carry an Authorization header, so the
// (already PUBLIC, per lib/apiAuth.ts's own header) access secret may arrive as
// `k=`. Access-checked, not rate-limited — re-downloading a file is not spend.

import { guardAccessOnly } from "@/lib/apiAuth";
import { AD_EXPORT_ID_RE, readAdExportFile, readAdRenderRecord } from "@/lib/adRender";
import type { AdErrorBody } from "@/lib/ads/types";

export const runtime = "nodejs";

const fail = (status: number, error: string, message: string) =>
  Response.json({ error, message } satisfies AdErrorBody, { status });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await guardAccessOnly(probe);
  if (denied) return denied;

  const { id } = await params;
  if (!AD_EXPORT_ID_RE.test(id)) return fail(400, "bad-request", "That is not an ad export id.");
  const bytes = await readAdExportFile(id);
  if (!bytes) return fail(404, "not-found", `No finished ad export ${id} on this machine.`);
  const rec = await readAdRenderRecord(id);
  const tag = rec ? `-${rec.aspect.replace(":", "x")}` : "";

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `attachment; filename="ad${tag}-${id}.mp4"`,
      // A fresh uuid per render, never reused.
      "cache-control": "private, max-age=86400",
    },
  });
}
