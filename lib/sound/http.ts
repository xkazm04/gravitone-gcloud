// What a sound file route answers when the store throws. Server-only.
//
// ONE ERROR SHAPE for the sound store's own refusals: `{ error }`, the store's
// sentence verbatim with its status. Since Phase 6 L70 only the two kept file
// doors call it (app/api/sound/{takes/[id],mv/jobs/[id]}/file): their access
// refusal is route()'s envelope (app/_server/route.ts), so v1's re-speaking of
// apiAuth's `{ detail, code }` denial (`asContractDenial`) and the JSON body
// reader went with the JSON routes that used them.

import { errorMessage } from "@gt/domain/errors";

import { MusicError, statusFor as musicStatus } from "@/lib/music/errors";
import { TextError, statusFor as textStatus } from "@/lib/text/errors";

import { SoundError } from "./store";

function errorResponse(message: string, status: number, code?: string): Response {
  return Response.json(code ? { error: message, code } : { error: message }, { status });
}

/** Map anything a sound route can throw to `{ error }` with its status. A
 *  vendor's sentence (MusicError / TextError) is passed through verbatim with
 *  its kind as `code` — "over-budget" and "no-key" are different remedies, and
 *  the operator should read which one it is. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof SoundError) return errorResponse(e.message, e.status);
  if (e instanceof MusicError) return errorResponse(e.message, musicStatus(e.kind), e.kind);
  if (e instanceof TextError) return errorResponse(e.message, textStatus(e.kind), e.kind);
  const msg = errorMessage(e);
  console.error(`[sound] ${msg}`);
  return errorResponse(msg, 500);
}
