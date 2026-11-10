// /api/suno/callback - where Suno's authorization server sends the browser back.
//
// PUBLIC BY NECESSITY: the redirect from suno.com carries no credential of this studio's. The
// binding is the `state` - single use, ten minutes, minted by /api/suno/connect behind the access
// guard and held with its PKCE verifier in the sound store's pending.json - so a request with an
// unknown state is refused and spends nothing (the token endpoint is never called).
//
//   ?code&state             exchange, save the tokens, 302 /audio?suno=connected
//   ?error[&error_description]   Suno's refusal, 302 /audio?suno=error&reason=<its sentence>
//   neither                 400: not a return from Suno
//
// A failure's reason is the vendor's sentence (or the store's, opaque when `internal`), at most
// 200 characters.

import { z } from "zod";

import { AppError } from "@gt/domain/errors";

import { completeAuthorization } from "../../../../lib/suno/api/oauth.ts";
import { envelope, publicError } from "../../../_server/http.ts";
import { route } from "../../../_server/route.ts";

export const maxDuration = 60;

const REASON_CHARS = 200;
const WHERE = "GET /api/suno/callback";

const Query = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().min(1).max(256).optional(),
  error_description: z.string().max(2000).optional(),
  iss: z.string().max(2048).optional(),
});

function back(req: Request, q: Record<string, string>): Response {
  const to = new URL("/audio", req.url);
  for (const [k, v] of Object.entries(q)) to.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: to.href, "cache-control": "no-store" } });
}

const failed = (req: Request, reason: string) => back(req, { suno: "error", reason: reason.slice(0, REASON_CHARS) });

export const GET = route({ guard: "public", bodyCap: 0, maxDuration, input: Query }, async ({ req, input }) => {
  if (input.error !== undefined) return failed(req, input.error_description ?? input.error);
  if (input.code === undefined || input.state === undefined) {
    return envelope(new AppError("invalid", "not a return from suno: no code and state, and no error", { detail: "not-a-callback" }), WHERE);
  }
  const r = await completeAuthorization(input.state, input.code);
  if (!r.ok) return failed(req, publicError(r.error, WHERE).error);
  return back(req, { suno: "connected" });
});
