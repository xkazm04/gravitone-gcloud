// GET /api/sound/takes/[id]/file -> the take's bytes, its own content-type,
// and byte ranges (206) so an <audio> element can seek without downloading the
// whole file first.
//
// An <audio src> cannot carry an Authorization header, so the access secret
// may also arrive as `k=` — the same PUBLIC bundle value lib/apiAuth.ts
// documents, accepted the same way /api/foundry/file accepts it for an <img>.
// Access-checked, not rate-bucketed: a Triage queue of thirty takes is thirty
// of these at once, and seeking issues more.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, errorResponse, toErrorResponse } from "@/lib/sound/http";
import { filePathAbs } from "@/lib/sound/store";
import { getTake } from "@/lib/sound/takes";

export const runtime = "nodejs";

/** `bytes=a-b`, `bytes=a-`, `bytes=-n` against a file of `size` bytes, or
 *  "bad" for a range this file cannot satisfy. Multi-range is answered with
 *  the first range — an <audio> element never asks for more than one. */
function parseRange(h: string | null, size: number): { start: number; end: number } | null | "bad" {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)/.exec(h.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "bad";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "bad";
  return { start, end };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const k = new URL(req.url).searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await asContractDenial(guardAccessOnly(probe));
  if (denied) return denied;
  try {
    const { id } = await params;
    const take = await getTake(id);
    if (!take.file) return errorResponse(`take ${id} has no audio — it is an example row with no bytes`, 404);
    const abs = filePathAbs(take.file.path);
    const size = await stat(abs).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) return errorResponse(`take ${id}'s file is missing from the store (${take.file.path})`, 404);
    const base = {
      "content-type": take.file.mime,
      "accept-ranges": "bytes",
      // A take's bytes never change (a new version is a new take), so the
      // browser may keep them for the session.
      "cache-control": "private, max-age=3600",
    };
    const range = parseRange(req.headers.get("range"), size);
    if (range === "bad") return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    if (!range) {
      const body = Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>;
      return new Response(body, { status: 200, headers: { ...base, "content-length": String(size) } });
    }
    const body = Readable.toWeb(createReadStream(abs, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: {
        ...base,
        "content-range": `bytes ${range.start}-${range.end}/${size}`,
        "content-length": String(range.end - range.start + 1),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
