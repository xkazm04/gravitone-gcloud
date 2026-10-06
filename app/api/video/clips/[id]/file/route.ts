// GET /api/video/clips/[id]/file[?k=<access secret>] — a finished clip's mp4.
//
// A <video src> cannot carry an Authorization header, so the (already PUBLIC,
// lib/apiAuth.ts) access secret may arrive as `k=` — the shape
// app/api/foundry/file/route.ts and app/api/music-video/export/file/route.ts
// already use. Access-checked, not rate-limited: a player seeking issues a run
// of Range requests for one file.
//
// RANGE: one `bytes=a-b` range is honoured with a 206; anything else gets the
// whole file. That is what a <video> element asks for and enough to seek.

import { open } from "node:fs/promises";

import { guardAccessOnly } from "@/lib/apiAuth";
import { VideoError, videoErrorResponse } from "@/lib/imaging/video/errors";
import { clipFileStat, isClipId } from "@/lib/imaging/video/store";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const k = url.searchParams.get("k");
  const probe = k ? new Request(req.url, { headers: { authorization: `Bearer ${k}` } }) : req;
  const denied = await guardAccessOnly(probe);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    if (!isClipId(id)) throw new VideoError("Not a clip id.", "not-found");
    const file = await clipFileStat(id);
    if (!file) throw new VideoError(`Clip ${id} has no file on this server (not finished, or never made).`, "not-found");

    const base = {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      // A clip id names one render forever; a re-animate is a new id.
      "cache-control": "private, max-age=86400",
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    let start = 0;
    let end = file.size - 1;
    let partial = false;
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), file.size - 1);
      } else {
        start = Math.max(0, file.size - Number(m[2])); // suffix: the last N bytes
      }
      if (start > end || start >= file.size)
        return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${file.size}` } });
      partial = true;
    }

    const len = end - start + 1;
    const buf = Buffer.alloc(len);
    const fh = await open(file.abs, "r");
    try {
      await fh.read(buf, 0, len, start);
    } finally {
      await fh.close();
    }
    return new Response(new Uint8Array(buf), {
      status: partial ? 206 : 200,
      headers: {
        ...base,
        "content-length": String(len),
        ...(partial ? { "content-range": `bytes ${start}-${end}/${file.size}` } : {}),
      },
    });
  } catch (e) {
    return videoErrorResponse(e);
  }
}
