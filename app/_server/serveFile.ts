import { open, stat } from "node:fs/promises";

import { AppError } from "@gt/domain/errors";

import { envelope } from "./http.ts";

// serveFile() - FILE BYTES, WITH RANGES, ONCE.
//
// v1 served ranged files in four places, each a copy of the one before with a
// different subset of the edge cases:
//   app/api/foundry/file/route.ts           strict `^bytes=a-b$`, buffered whole range in memory
//   app/api/video/clips/[id]/file/route.ts  same copy, the one the foundry lifted from
//   app/api/sound/takes/[id]/file/route.ts  streamed, first range of a multi-range, 416 on junk
//   app/api/sound/mv/jobs/[id]/file/route.ts  the takes copy again
// KEPT, from all four: `bytes=a-b`, open-ended `bytes=a-`, suffix `bytes=-n`;
// an end past the file clamped to the last byte; a start at or past the end,
// and any range over an empty file, answered 416 with `Content-Range: bytes */size`;
// `Accept-Ranges: bytes` on every answer; the first range of a multi-range
// request (an <audio>/<video> never asks for more, and the Content-Range says
// what was sent); a per-call Cache-Control, because the four disagreed for real
// reasons (a take never changes; an MV render is replaced under its name).
// UPGRADED:
//   - streamed with backpressure, never buffered: the foundry/clips copies
//     allocated the whole range, so a `bytes=0-` on a 2 GB render was 2 GB of heap;
//   - a SYNTACTICALLY invalid Range (wrong unit, `bytes=-`, garbage) is ignored
//     and the whole file served (RFC 9110 14.2: a server MAY ignore Range). The
//     sound copies answered 416 there, which tells a client its range missed a
//     file it never addressed;
//   - validators: a strong ETag from size and mtime (nginx's) and Last-Modified,
//     and If-Range honoured - a client resuming a file that changed underneath
//     it gets the new file whole, not a splice of two versions. None of v1's had it;
//   - HEAD answers the headers with no body;
//   - a missing file is the envelope's `not-found`, and the absolute path stays
//     on the server (v1's foundry copy relayed its store's sentence).
// DROPPED: v1's `?k=` access secret in the URL (route() reads the session cookie).
// Path safety is the caller's: `abs` must already be resolved inside its root.

export type ServeOptions = {
  readonly mime: string;
  /** Honour Range (default true). Off for files a client never seeks. */
  readonly ranges?: boolean;
  /** Default "private, max-age=3600": immutable-by-name, held for a session. */
  readonly cache?: string;
};

export type RangeAsk = { readonly kind: "whole" } | { readonly kind: "part"; readonly start: number; readonly end: number } | { readonly kind: "unsatisfiable" };

const SPEC = /^(\d*)-(\d*)$/;
const CHUNK = 64 * 1024;

/** The first range of a Range header against `size` bytes (RFC 9110 14.1.2). */
export function parseRange(header: string | null, size: number): RangeAsk {
  if (header === null) return { kind: "whole" };
  const m = /^\s*bytes\s*=\s*(.+)$/i.exec(header);
  const first = m?.[1]?.split(",")[0]?.trim();
  const spec = first === undefined ? null : SPEC.exec(first);
  const a = spec?.[1] ?? "";
  const b = spec?.[2] ?? "";
  if (spec === null || (a === "" && b === "")) return { kind: "whole" };
  if (a === "") {
    const n = Number(b);
    if (n === 0 || size === 0) return { kind: "unsatisfiable" };
    return { kind: "part", start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  if (b !== "" && Number(b) < start) return { kind: "whole" };
  if (start >= size) return { kind: "unsatisfiable" };
  return { kind: "part", start, end: b === "" ? size - 1 : Math.min(Number(b), size - 1) };
}

/** A strong validator from what changes when the bytes do. */
export const etagOf = (size: number, mtimeMs: number): string => `"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;

/** If-Range: the range applies only to the representation the client already holds. */
export function ifRangeHolds(ifRange: string | null, etag: string, lastModified: string): boolean {
  if (ifRange === null) return true;
  const v = ifRange.trim();
  if (v.startsWith('"') || v.startsWith("W/")) return v === etag;
  return v === lastModified;
}

/** The bytes [start, end] of `abs`, read on demand: the reader's pace sets the reads. */
function byteStream(abs: string, start: number, end: number): ReadableStream<Uint8Array> {
  let pos = start;
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  const done = async (): Promise<void> => {
    const h = fh;
    fh = undefined;
    await h?.close();
  };
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          fh ??= await open(abs, "r");
          const want = Math.min(CHUNK, end - pos + 1);
          const buf = new Uint8Array(want);
          const { bytesRead } = await fh.read(buf, 0, want, pos);
          // A file that shrank under the read ends the body short; the client
          // sees a length mismatch, which is the truth.
          if (bytesRead > 0) controller.enqueue(buf.subarray(0, bytesRead));
          pos += bytesRead;
          if (bytesRead === 0 || pos > end) {
            await done();
            controller.close();
          }
        } catch (e) {
          await done();
          controller.error(e);
        }
      },
      cancel: done,
    },
    { highWaterMark: 1 },
  );
}

/** Serve one file, honouring a single byte range. */
export async function serveFile(req: Request, abs: string, opts: ServeOptions): Promise<Response> {
  const where = `serveFile ${new URL(req.url).pathname}`;
  let size: number;
  let mtimeMs: number;
  try {
    const s = await stat(abs);
    if (!s.isFile()) return envelope(new AppError("not-found", "No such file."), where);
    size = s.size;
    mtimeMs = s.mtimeMs;
  } catch (e) {
    const code = e instanceof Error && "code" in e ? e.code : undefined;
    if (code === "ENOENT" || code === "ENOTDIR") return envelope(new AppError("not-found", "No such file."), where);
    return envelope(new AppError("unavailable", `cannot stat a served file: ${String(code)}`, { cause: e }), where);
  }
  const etag = etagOf(size, mtimeMs);
  const lastModified = new Date(Math.floor(mtimeMs / 1000) * 1000).toUTCString();
  const base: Record<string, string> = {
    "content-type": opts.mime,
    // Served bytes are generated or third-party: the declared type is the type.
    "x-content-type-options": "nosniff",
    "cache-control": opts.cache ?? "private, max-age=3600",
    etag,
    "last-modified": lastModified,
  };
  const ranged = opts.ranges ?? true;
  if (ranged) base["accept-ranges"] = "bytes";
  const ask = ranged && ifRangeHolds(req.headers.get("if-range"), etag, lastModified) ? parseRange(req.headers.get("range"), size) : { kind: "whole" as const };
  if (ask.kind === "unsatisfiable") return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${size}` } });
  const [start, end, status] = ask.kind === "part" ? [ask.start, ask.end, 206] : [0, size - 1, 200];
  const headers: Record<string, string> = { ...base, "content-length": String(Math.max(0, end - start + 1)) };
  if (ask.kind === "part") headers["content-range"] = `bytes ${start}-${end}/${size}`;
  const body = req.method === "HEAD" || size === 0 ? null : byteStream(abs, start, end);
  return new Response(body, { status, headers });
}
