// The publish routes' two shared moves: the access gate and the error shape.
// Server-only.
//
// GATED LIKE THE FOUNDRY. These routes write the calendar on this machine's
// disk, and a slot they create is what a tick later uploads under the
// operator's channel — so they sit behind lib/apiAuth.ts like every other
// route that acts for the operator. `guardAccessOnly`, not `guardRequest`:
// nothing here spends per request, and the Calendar polls (the same reason
// apiAuth.ts:422 gives for the foundry). Open in dev with
// NEXT_PUBLIC_DEV_AUTH=1; a browser caller presents
// NEXT_PUBLIC_IMAGING_ACCESS_SECRET exactly as app/foundry/foundryClient.ts:74.
//
// ONE ERROR SHAPE. The HTTP contract (platform-consolidation brief, "Data &
// API") says errors are `{ error: string }`. apiAuth's denial is
// `{ detail, code }`, so it is re-spoken here rather than leaking a second
// shape to the two clients coding against the contract.

import { guardAccessOnly } from "@/lib/apiAuth";

import { PublishConfigError } from "./channels";
import { PublishError } from "./schedule";
import { StoreError } from "./store";

export function errorResponse(message: string, status: number, code?: string): Response {
  return Response.json(code ? { error: message, code } : { error: message }, { status });
}

/** null = proceed; otherwise the 401 to return, in the contract's shape. */
export async function guardPublish(req: Request): Promise<Response | null> {
  const denied = guardAccessOnly(req);
  if (!denied) return null;
  const body = (await denied.json().catch(() => ({}))) as { detail?: string; code?: string };
  return errorResponse(body.detail ?? "unauthorized", denied.status, body.code);
}

/** Map anything a publish route can throw to `{ error }` with its status. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof PublishError) return errorResponse(e.message, e.status);
  if (e instanceof PublishConfigError) return errorResponse(e.message, 500, "config");
  if (e instanceof StoreError) return errorResponse(e.message, 500, "store");
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[publish] ${msg}`);
  return errorResponse(msg, 500);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new PublishError("body is not valid JSON", 400);
  }
}
