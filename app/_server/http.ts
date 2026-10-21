import { randomUUID } from "node:crypto";

import type { z } from "zod";

import { parseJsonAt, type Parsed } from "@gt/domain/door";
import { AppError, err, errorMessage, type ErrorEnvelope, httpStatus, isAppError, type Result, toEnvelope } from "@gt/domain/errors";

// THE WIRE'S HALF OF THE ERROR TAXONOMY - one envelope, one body reader, one
// answer for a caller who left. Pure over Request and Response, so the route
// wrapper, the session route and the Server Action wrapper share it, and
// tests/next-server drives it without Next.
//
// ONE ENVELOPE, `{error, code, detail?}`, its status derived from the code by
// @gt/domain's `httpStatus` and never passed through from anywhere else. v1
// answered `{detail}` in 37 routes and `{error, code}` in 7 (plan §3.4), and
// each client door guessed which it was talking to.
//
// `internal` IS THE ONE OPAQUE CODE. Every other code's message is written for
// the caller and goes out verbatim (a real error explains itself in full,
// CLAUDE.md). An `internal` message is whatever broke - a store path, a SQLite
// sentence, a stack's first line - and names the machine behind the origin
// (browser-credential-boundary: opaque-upstream-errors). So it is logged in
// full under a reference, and the caller gets the reference: the operator can
// join the two, nobody else learns the topology. It is also the only code
// logged as a defect (errors.ts), so the log line is the door it reaches
// (error-handling: error-doors) - never a swallowed failure.

/** What a request the client abandoned gets: nginx's "client closed request".
 *  No body (nobody is reading), and no log line: a navigation is not an outage
 *  (stream-proxy-hop: abort-versus-unreachable). */
export const CLIENT_GONE = 499;

/** The caller-facing shape of an error, with `internal` made opaque and logged. */
export function publicError(e: AppError, where: string): ErrorEnvelope {
  if (e.code !== "internal") return toEnvelope(e);
  const ref = randomUUID().slice(0, 8);
  console.error(`[server] internal ${where} ref=${ref}: ${e.message}`, e.cause ?? "");
  return { error: `internal error (ref ${ref})`, code: "internal" };
}

/** Any throw, classified: an AppError keeps its code, anything else is `internal`. */
export function asAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  return new AppError("internal", errorMessage(e), { cause: e });
}

/** The one error response. */
export function envelope(e: AppError, where: string, headers: HeadersInit = {}): Response {
  return Response.json(publicError(e, where), { status: httpStatus(e.code), headers });
}

export function clientGone(): Response {
  return new Response(null, { status: CLIENT_GONE });
}

/**
 * The request body as JSON, through the door, read no further than `cap`
 * bytes. A declared Content-Length over the cap is refused before a byte is
 * read; a body that lies about its length (or sends none and streams) is cut
 * off at the cap. An empty body is the JSON value `null`, so a schema decides
 * whether "nothing" is acceptable.
 */
export async function readJson<S extends z.ZodType>(req: Request, cap: number, schema: S, door: string): Promise<Result<Parsed<z.output<S>>>> {
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  const tooBig = (): Result<never> => err("invalid", `${door}: body exceeds ${cap} bytes`, { detail: "body-too-large" });
  if (Number.isFinite(declared) && declared > cap) return tooBig();
  if (req.body === null) return parseJsonAt(door, schema, "null");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel();
      return tooBig();
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return parseJsonAt(door, schema, text.trim() === "" ? "null" : text);
}

/** The query string as a flat object (a repeated key keeps its last value), for a GET's schema. */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

/**
 * Did this request come from a page on this origin? The check Next applies to
 * Server Actions (Origin against Host / X-Forwarded-Host), applied to the
 * cookie-authenticated writes it does not cover. A request with no Origin and
 * no Sec-Fetch-Site is not a browser's (browsers send Origin on every POST),
 * and carries no ambient cookie worth forging.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return req.headers.get("sec-fetch-site") !== "cross-site";
  let from: string;
  try {
    from = new URL(origin).host;
  } catch {
    // An Origin that is not a URL ("null" from a sandboxed frame) is not ours.
    return false;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return from === host.split(",")[0]?.trim();
}

/** A Result as the route answers it: the value as JSON, or the envelope. */
export function resultResponse<T>(r: Result<T>, where: string): Response {
  return r.ok ? Response.json(r.value) : envelope(r.error, where);
}
