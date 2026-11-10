// /api/suno/connect - the studio's sign-in to Suno's official API (lib/suno/api/oauth.ts).
//
//   GET     302 to Suno's authorize URL. The redirect URI is this request's origin +
//           /api/suno/callback; the PKCE verifier waits in the sound store's pending.json under
//           the state. A discovery or registration failure is the envelope, in the vendor's words.
//   DELETE  revoke the grant where Suno allows it, forget the tokens (the registered client
//           stays), answer {connected: false}. A cookie-carried DELETE must be same-origin -
//           route()'s guard holds that for every write.

import { beginAuthorization, disconnect } from "../../../../lib/suno/api/oauth.ts";
import { envelope } from "../../../_server/http.ts";
import { route } from "../../../_server/route.ts";

export const maxDuration = 60;

export const GET = route({ guard: "access", bodyCap: 0, maxDuration }, async ({ req }) => {
  const redirectUri = `${new URL(req.url).origin}/api/suno/callback`;
  const r = await beginAuthorization(redirectUri);
  if (!r.ok) return envelope(r.error, "GET /api/suno/connect");
  return new Response(null, { status: 302, headers: { location: r.value.url, "cache-control": "no-store" } });
});

export const DELETE = route({ guard: "access", bodyCap: 0, maxDuration }, async () => {
  const r = await disconnect();
  if (!r.ok) return r;
  return Response.json({ connected: false }, { headers: { "cache-control": "no-store" } });
});
