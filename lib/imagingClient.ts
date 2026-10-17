"use client";

// The browser's credential door: the headers and the media-URL credential a v1
// client presented to the gated routes (lib/apiAuth.ts).
//
// WHAT IS LEFT, AND WHY (Phase 6 L70). This module was the browser's half of
// lib/imaging - typed fetches to /api/imaging/{generate,edit,recognize,budget}
// with an idempotency key and one same-key retry on a lost gateway. Those routes
// were deleted with the v1 pages that called them: the producers render
// in-process, and the receipt the client key earned (lib/imaging/receipts.ts) is
// the server's, keyed by the producer's own step. What stays is the credential
// door the remaining v1 clients still build their requests through, until they
// retire with their lots; nothing in the studio imports it (the studio's
// requests ride the session cookie).

import { ID_TOKEN_HEADER, currentIdToken } from "./sessionToken";

/**
 * The access headers the gated routes require (lib/apiAuth.ts). Synchronous:
 * it is spread inline into every client `fetch`.
 *
 * Two credentials, and the server's PRINCIPAL_MODE decides which one counts —
 * this side cannot know the mode, so it sends what it has, shaped so that
 * BOTH servers are satisfied by the same request:
 *
 *   · a bundle WITH `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` (the legacy deploy)
 *     sends `Authorization: Bearer <secret>` exactly as before, plus the
 *     cached Firebase ID token in its own header once there is one. A legacy
 *     server reads the secret and ignores the token; a verified server reads
 *     the token and ignores the secret.
 *   · a bundle WITHOUT it (the verified deploy, where a public secret buys
 *     nothing) sends `Authorization: Bearer <idToken>`.
 *
 * The token comes from lib/sessionToken.ts, fed by useAuth's onIdTokenChanged.
 * Empty when there is neither — the server then answers 401 by name.
 *
 * THE BUNDLE SECRET IS NOW THE BROWSER'S ALONE (Phase 2, 2026-10-15). Every
 * non-browser caller presents its own CLI token (pipeline/token.mts), and a
 * server set to SHARED_SECRET_CALLERS=browser accepts this secret on a money
 * route only from a request the browser's fetch marks same-origin - which
 * every call through here is. On a local-mode machine the browser has no other
 * credential (no Firebase, so no ID token and no session cookie), so this
 * path stays until the v1 screens retire (Phase 6).
 */
export function accessHeader(): Record<string, string> {
  const secret = bundleSecret();
  const token = currentIdToken();
  if (secret) return token ? { authorization: `Bearer ${secret}`, [ID_TOKEN_HEADER]: token } : { authorization: `Bearer ${secret}` };
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** The public bundle secret, trimmed, or "" — read HERE and nowhere else in the
 *  client (credential-door.probe walks the tree for a second reader). */
function bundleSecret(): string {
  const s = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET;
  return s && s.trim() ? s.trim() : "";
}

/** The query parameter the media/file routes read the credential from. */
export const ACCESS_QUERY_PARAM = "k";

/**
 * THE QUERY CREDENTIAL — the one value a media URL may carry, or `undefined`.
 *
 * <img>, <video>, <audio>, <iframe> and a plain <a download> cannot send a
 * header, so the routes that serve bytes to them (and only those — pinned by
 * credential-door.probe) read the credential from `?k=`. A URL has room for ONE
 * credential, so where `accessHeader()` can send both, this picks:
 *
 *   · a bundle WITH the public secret (legacy): the secret, exactly as the
 *     hand-built URLs sent it. A legacy server compares `k` to its secret, and
 *     a token there would be "wrong";
 *   · a bundle WITHOUT it (verified): the cached Firebase ID token;
 *   · the dev fixture, the local owner, or nobody signed in: nothing. Those
 *     users have no token (lib/sessionToken.ts never caches one for them).
 *
 * A TOKEN IN A URL CAN REACH ACCESS LOGS, browser history and a Referer. That
 * is accepted here because of what the token can do and for how long: a
 * Firebase ID token expires within the hour, and the server reads `k` only on
 * GET byte-serves behind the READ door (`guardAccessOnly`). The money door
 * (`guardRequest`) never reads a query credential, so a logged URL can, at
 * worst, re-fetch bytes its holder could already see — for minutes, not spend.
 */
export function accessQuery(): string | undefined {
  return bundleSecret() || currentIdToken() || undefined;
}

/** `url` with the query credential appended (`?k=` or `&k=`, before any
 *  `#fragment`), or `url` unchanged when there is none. INERT SINCE PHASE 6 L70:
 *  no route reads `k` any more (the four file doors are route()'s `access`
 *  guard, which reads headers and the session cookie), so the `k` this appends
 *  is ignored and the request is judged by its cookie. Kept only so the v1
 *  clients that still call it compile until they retire. */
export function withAccess(url: string): string {
  const k = accessQuery();
  if (!k) return url;
  const hash = url.indexOf("#");
  const [path, frag] = hash === -1 ? [url, ""] : [url.slice(0, hash), url.slice(hash)];
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${ACCESS_QUERY_PARAM}=${encodeURIComponent(k)}${frag}`;
}
