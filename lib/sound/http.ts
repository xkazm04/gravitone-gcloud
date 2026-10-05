// The sound routes' shared moves: the error shape and the gate re-spoken in it.
// Server-only. lib/publish/http.ts's twin, for its reason:
//
// ONE ERROR SHAPE. The round-4 contract says errors are `{ error }` (and the
// browser client, lib/sound/client.ts, reads exactly `json.error`). apiAuth's
// denial is `{ detail, code }`, so it is re-spoken here rather than reaching a
// client that would show "HTTP 401" instead of the gate's own sentence.
//
// Each route calls its lib/apiAuth door ITSELF and hands the result here —
// tests/golden-path/imaging-auth.probe.spec.ts reads every route FILE for a
// door call, and a wrapper that called it on the route's behalf would hide it.

import { MusicError, statusFor as musicStatus } from "@/lib/music/errors";
import { TextError, statusFor as textStatus } from "@/lib/text/errors";

import { SoundError } from "./store";

export function errorResponse(message: string, status: number, code?: string): Response {
  return Response.json(code ? { error: message, code } : { error: message }, { status });
}

/** Re-speak a gate denial as `{ error, code }`, keeping its status and its
 *  retry-after; null (proceed) passes through. */
export async function asContractDenial(denied: Response | null): Promise<Response | null> {
  if (!denied) return null;
  const body = (await denied.json().catch(() => ({}))) as { detail?: string; code?: string };
  const headers: Record<string, string> = {};
  const retry = denied.headers.get("retry-after");
  if (retry) headers["retry-after"] = retry;
  return Response.json({ error: body.detail ?? "unauthorized", code: body.code ?? "unauthorized" }, { status: denied.status, headers });
}

/** Map anything a sound route can throw to `{ error }` with its status. A
 *  vendor's sentence (MusicError / TextError) is passed through verbatim with
 *  its kind as `code` — "over-budget" and "no-key" are different remedies, and
 *  the operator should read which one it is. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof SoundError) return errorResponse(e.message, e.status);
  if (e instanceof MusicError) return errorResponse(e.message, musicStatus(e.kind), e.kind);
  if (e instanceof TextError) return errorResponse(e.message, textStatus(e.kind), e.kind);
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[sound] ${msg}`);
  return errorResponse(msg, 500);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new SoundError("body is not valid JSON", 400);
  }
}
