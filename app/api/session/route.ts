// /api/session - the bridge from the browser's Firebase sign-in to the
// server's renders (app/_server/session.ts holds the reasoning).
//
//   POST   {idToken}  verify the token with v1's verifier and set the httpOnly
//                     session cookie for exactly the token's remaining life.
//                     The client posts on sign-in and again on every Firebase
//                     token change; a refused token clears the cookie.
//   GET              who the cookie says is here: {kind, uid, exp?}, or
//                     {kind: "none", reason} - "nobody" is an answer, not an
//                     error. Only a JWKS outage (cannot tell) is the envelope.
//                     Both carry `local: true` when this request may enter locally.
//   PUT              enter locally (lib/localEntry.ts): on a loopback, unmanaged, legacy-mode
//                     server, set the local choice and drop any token cookie; else 403 with the
//                     condition that failed. The landing's "Enter locally" calls it.
//   DELETE           sign-out: clear the cookie (and the local choice) and answer {evict: "identity"},
//                     the client's cue to run the storage adapter's identity
//                     eviction (@gt/ui/storage). The local wipe must not wait on
//                     this call: the client evicts on both outcomes.
//
// Public by necessity - it is the door a session is made at - so it guards
// itself: writes only from this origin (a cross-site POST of an attacker's
// token would sign the victim in as the attacker), and a token is judged
// before any cookie is set.

import { z } from "zod";

import { AppError, ok } from "@gt/domain/errors";

import { localEntryAvailable, localEntryCookie, localEntryGranted } from "../../../lib/localEntry.ts";
import { LOCAL_ENTRY_COOKIE } from "../../../lib/localMode.ts";
import { isRefusal, type Resolution } from "../../../lib/principal.ts";
import { envelope, sameOrigin } from "../../_server/http.ts";
import { route } from "../../_server/route.ts";
import { clearedCookie, cookieValue, MAX_TOKEN_CHARS, resolveSession, secureFor, SESSION_COOKIE, sessionCookie, verifySession } from "../../_server/session.ts";

const crossOrigin = new AppError("refused", "The session is set only from this origin.", { detail: "cross-origin" });

function summary(who: Exclude<Resolution, { kind: "refused" }>): Record<string, string | number> {
  if (who.kind === "firebase") return { kind: who.kind, uid: who.uid, exp: who.exp };
  if (who.kind === "shared-secret") return { kind: who.kind };
  return { kind: who.kind, uid: who.uid };
}

function refusal(who: Extract<Resolution, { kind: "refused" }>, headers: HeadersInit = {}): Response {
  const code = who.status === 503 ? "unavailable" : "unauthenticated";
  return envelope(new AppError(code, who.detail, { detail: who.code }), "session", headers);
}

export const POST = route({ guard: "public", bodyCap: 8192, input: z.object({ idToken: z.string().min(1).max(MAX_TOKEN_CHARS) }) }, async ({ req, input }) => {
  if (!sameOrigin(req)) return envelope(crossOrigin, "session");
  const secure = secureFor(req);
  const who = await verifySession(input.idToken, "read");
  if (isRefusal(who)) return refusal(who, { "set-cookie": clearedCookie(secure) });
  if (who.kind !== "firebase") return envelope(new AppError("internal", `session: the verifier answered ${who.kind}`), "session");
  const body = { uid: who.uid, exp: who.exp };
  return Response.json(body, { headers: { "set-cookie": sessionCookie(input.idToken, who.exp, Date.now(), secure), "cache-control": "no-store" } });
});

export const GET = route({ guard: "public", bodyCap: 0 }, async ({ req }) => {
  const jar = req.headers.get("cookie");
  const host = req.headers.get("host");
  const who = await resolveSession(cookieValue(jar, SESSION_COOKIE), "read", undefined, localEntryGranted(cookieValue(jar, LOCAL_ENTRY_COOKIE), host));
  const local = localEntryAvailable(host) ? { local: true } : {};
  if (isRefusal(who)) return who.status === 503 ? refusal(who, { "retry-after": "30" }) : ok({ kind: "none", reason: who.code, ...local });
  return ok({ ...summary(who), ...local });
});

const notLocal = new AppError("refused", "Entering locally needs this studio served on localhost, off a managed platform, in legacy principal mode, with LOCAL_ENTRY not off.", { detail: "not-local" });

export const PUT = route({ guard: "public", bodyCap: 0 }, async ({ req }) => {
  if (!sameOrigin(req)) return envelope(crossOrigin, "session");
  if (!localEntryAvailable(req.headers.get("host"))) return envelope(notLocal, "session");
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", localEntryCookie(true));
  headers.append("set-cookie", clearedCookie(secureFor(req)));
  return Response.json({ kind: "local-owner", local: true }, { headers });
});

export const DELETE = route({ guard: "public", bodyCap: 0 }, async ({ req }) => {
  if (!sameOrigin(req)) return envelope(crossOrigin, "session");
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", clearedCookie(secureFor(req)));
  headers.append("set-cookie", localEntryCookie(false));
  return Response.json({ signedOut: true, evict: "identity" }, { headers });
});
