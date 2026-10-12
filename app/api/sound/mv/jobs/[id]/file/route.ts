// GET /api/sound/mv/jobs/[id]/file?kind=audio|still|video|thumb -> the file,
// its own content-type, and byte ranges (206) so a <video> can seek without
// downloading a whole render first.
//
// A <video src> or <img src> cannot carry an Authorization header, so the
// access secret may also arrive as `k=` - the same PUBLIC bundle value the
// take file route accepts (app/api/sound/takes/[id]/file/route.ts).
// Access-checked, not rate-bucketed: seeking issues a burst of range requests.
// A Regenerate replaces a render under the same name, so the browser is told
// to revalidate rather than keep it.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, errorResponse, toErrorResponse } from "@/lib/sound/http";
import { mvFileOf } from "@/lib/sound/mv/store";

export const runtime = "nodejs";

/** `bytes=a-b`, `bytes=a-`, `bytes=-n`, or "bad"; the first range only. */
function parseRange(h: string | null, size: number): { start: number; end: number } | null | "bad" {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "bad";
  let start: number;
  let end: number;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "bad";
  return { start, end };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await asContractDenial(await guardAccessOnly(probe));
  if (denied) return denied;
  try {
    const { id } = await params;
    const { abs, mime } = await mvFileOf(id, url.searchParams.get("kind"));
    const size = await stat(abs).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) return errorResponse(`job ${id}'s file is missing from the store`, 404);
    const base = { "content-type": mime, "accept-ranges": "bytes", "cache-control": "private, no-cache" };
    const range = parseRange(req.headers.get("range"), size);
    if (range === "bad") return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    if (!range) {
      const body = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 200, headers: { ...base, "content-length": String(size) } });
    }
    const body = Readable.toWeb(createReadStream(abs, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${range.start}-${range.end}/${size}`, "content-length": String(range.end - range.start + 1) },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
