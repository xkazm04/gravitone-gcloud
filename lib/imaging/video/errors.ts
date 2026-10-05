// THE VIDEO HOP'S ERRORS, AND THE ONE BODY EVERY /api/video ROUTE ANSWERS WITH.
//
// Server-only. A refusal or a failure of the CLIP itself is not an error here:
// it is a terminal `ClipStatus` on the stored record ("refusal is a state"),
// reached by polling. What this file covers is the request — a body that cannot
// be read, a server with no vendor key, a spend ceiling, an id the store never
// minted.
//
// THE BODY CARRIES BOTH SPELLINGS, deliberately. lib/ads/types.ts declares
// `AdErrorBody { error, message }` for "every ads/video route", and the imaging
// routes — whose client wrapper (lib/imagingClient.ts) and over-budget handling
// every studio surface already reads — answer `{ detail, code }`. Answering one
// would break a reader of the other, so a video failure answers both, with the
// same words: `error` = `code`, `message` = `detail`.

import type { AdErrorBody } from "@/lib/ads/types";
import { scrub } from "@/lib/imaging/log";

export type VideoErrorKind = "bad-request" | "no-key" | "over-budget" | "not-found" | "invalid";

const STATUS: Record<VideoErrorKind, number> = {
  "bad-request": 400,
  // 503, not 401: the CALLER is fine; this server simply has no vendor to call.
  "no-key": 503,
  // 402, as imaging's over-budget is (lib/imaging/api.ts errorResponse).
  "over-budget": 402,
  "not-found": 404,
  invalid: 400,
};

export class VideoError extends Error {
  constructor(
    message: string,
    readonly kind: VideoErrorKind,
  ) {
    super(message);
    this.name = "VideoError";
  }
  get status(): number {
    return STATUS[this.kind];
  }
}

export type VideoErrorBody = AdErrorBody & { code: string; detail: string };

export function videoErrorBody(code: string, message: string): VideoErrorBody {
  const m = scrub(message);
  return { error: code, message: m, code, detail: m };
}

export function videoErrorResponse(e: unknown): Response {
  if (e instanceof VideoError) return Response.json(videoErrorBody(e.kind, e.message), { status: e.status });
  // Not one of ours: a bug. The message is scrubbed, never the raw object.
  console.error(`[video] unexpected ${scrub(e instanceof Error ? e.message : String(e)).slice(0, 240)}`);
  return Response.json(videoErrorBody("failed", "The video request failed on the server."), { status: 500 });
}
