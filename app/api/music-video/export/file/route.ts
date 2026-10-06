// GET /api/music-video/export/file?id=<uuid> — serve a finished export's mp4.
//
// Same shape as `app/api/foundry/file/route.ts`: the bytes live outside
// `public/` (a generated video is not a build asset) and this route is the
// only way to reach them. `id` is always a `randomUUID()` minted by
// `runExport` (never echoed from arbitrary user text), so there is no
// path-traversal surface the way a free-form run id would need guarding — see
// `lib/musicVideoExport.ts#exportFilePath`'s own comment on that.
//
// Access-checked, not rate-limited — a creator re-downloading or scrubbing the
// same export file is not the spend this app's rate bucket exists to bound,
// the same reasoning `foundry/file/route.ts` already states for its own gallery
// traffic.
//
// `k=` QUERY FALLBACK, same reason and same shape as `foundry/file/route.ts`:
// a plain `<a href>`/download click cannot carry an `Authorization` header, so
// the (already PUBLIC, per lib/apiAuth.ts's own header) access secret may also
// arrive as `k=`.

import { guardAccessOnly } from "@/lib/apiAuth";
import { readExportFile } from "@/lib/musicVideoExport";

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

  const bytes = await readExportFile(id);
  if (!bytes) return Response.json({ detail: "No export with that id (it may have been cleaned up).", code: "not-found" }, { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `attachment; filename="music-video-${id}.mp4"`,
      // Content-addressed by a fresh uuid per export, never reused — safe to
      // cache as long as a browser cares to.
      "cache-control": "private, max-age=86400",
    },
  });
}
