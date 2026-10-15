import "server-only";

import { cookies } from "next/headers";

import type { KeyUse, Resolution } from "../../lib/principal.ts";
import { resolveSession, SESSION_COOKIE } from "./session.ts";

// principal() - who is looking at this page, for a Server Component, a layout
// or a Server Action. Reads the session cookie the signed-in client posted to
// /api/session and RE-VERIFIES it on every call (session.ts says why nothing
// is cached: the token is the session, and it expires on its own clock).
//
// `use` is `read` for a render (a JWKS outage may verify against the last good
// key set for a day, so the studio stays readable) and `money` for anything
// that mutates (action.ts), which refuses on a key set it cannot confirm.
// Reading cookies() makes the caller dynamic, which a page holding signed-in
// data must be anyway.

export async function principal(use: KeyUse = "read"): Promise<Resolution> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value, use);
}
