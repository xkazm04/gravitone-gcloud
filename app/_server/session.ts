import { DEV_AUTH } from "../../lib/devAuth.ts";
import { LOCAL_MODE } from "../../lib/localMode.ts";
import { DEV_FIXTURE, LOCAL_OWNER, principalMode, refuse, verifyIdToken, type KeyUse, type Resolution } from "../../lib/principal.ts";

// THE SESSION BRIDGE - how a Server Component learns who is signed in.
//
// The browser signs in with Firebase, and that session lives in the browser's
// own IndexedDB, where a server render cannot see it. v1 never needed to: every
// page was a client component behind a client `AuthGate`, and the server saw an
// identity only on the API calls that carried a token (lib/principal.ts). Pages
// now render on the server (plan §3.3), so the identity has to arrive with the
// page request, and the only thing a browser attaches to a navigation by itself
// is a cookie.
//
// THE COOKIE CARRIES THE FIREBASE ID TOKEN ITSELF, and every read re-verifies
// it with v1's verifier (RS256 over WebCrypto against Google's JWKS - REUSED,
// not copied: one verifier, so a fix to it fixes the cookie too). The server
// mints nothing and extends nothing: the cookie's Max-Age is the token's own
// remaining life, so the cookie dies when the token does. Refresh is the
// client's: Firebase rotates the ID token about hourly and fires its
// token-change event, and the client re-posts (L9 wires that beside
// lib/sessionToken.ts's subscription, which already listens there). A tab that
// slept through the rotation sends an expired token and is refused as
// `expired`, which the page reads as "sign in again", never as a different user.
//
// WHAT THIS IS NOT. It is not a Firebase Admin session cookie (createSession
// Cookie: up to two weeks, revocable server-side) - firebase-admin is not a
// dependency (lib/apiAuth.ts records why), and a two-week bearer is a larger
// thing to lose than a one-hour one. The price: revocation reaches a page only
// when the token expires (<= 1 h), and a page cannot render signed-in past the
// hour without the client's re-post. For one operator on their own machine
// that is the right trade; a hosted multi-tenant posture needs the Admin SDK's
// revocation check and is a later change through PRINCIPAL_MODE (plan §5.6).
//
// THE COOKIE IS httpOnly (no script reads the bearer back out), SameSite=Lax
// (sent on top-level navigations, withheld from cross-site POSTs and
// subresources), Path=/, and Secure everywhere but loopback - a dev server on
// http://localhost would otherwise never receive it.
//
// RESOLUTION ORDER is the v1 server's (lib/apiAuth.ts resolvePrincipal): the
// dev fixture first (non-production only - DEV_AUTH folds to false in a
// production build), then a presented credential judged on its own, then the
// local owner (legacy mode only; verified mode cannot vouch for a person it
// never saw). A bad cookie is refused for itself: it never falls through to the
// local owner, as a bad token never falls through to the shared secret in v1.

export const SESSION_COOKIE = "gt_session";

/** The longest ID-token cookie accepted: a Firebase ID token is ~1 KB; a cookie caps at 4 KB. */
export const MAX_TOKEN_CHARS = 4096;

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** Secure unless the request reached us on loopback. */
export const secureFor = (req: Request): boolean => !isLoopbackHost(new URL(req.url).hostname);

function attributes(maxAgeS: number, secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(maxAgeS))}${secure ? "; Secure" : ""}`;
}

/** The Set-Cookie for a verified token: it lives exactly as long as the token. */
export function sessionCookie(token: string, expS: number, nowMs: number, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; ${attributes(expS - nowMs / 1000, secure)}`;
}

/** The Set-Cookie that ends the session in this browser. */
export function clearedCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; ${attributes(0, secure)}`;
}

/** One cookie's value from a Cookie header, or undefined. */
export function cookieValue(header: string | null, name: string): string | undefined {
  if (header === null) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const v = part.slice(eq + 1).trim();
    return v === "" ? undefined : v;
  }
  return undefined;
}

/** Verify a session token with v1's verifier. `use` decides only what a JWKS outage means. */
export async function verifySession(token: string, use: KeyUse, now?: number): Promise<Resolution> {
  if (token.length > MAX_TOKEN_CHARS) return refuse("malformed");
  return verifyIdToken(token, now === undefined ? { use } : { use, now });
}

/** Who the session cookie (or the posture) says is here. Never throws; a refusal is a value. */
export async function resolveSession(token: string | undefined, use: KeyUse, now?: number): Promise<Resolution> {
  if (DEV_AUTH) return DEV_FIXTURE;
  if (token !== undefined) return verifySession(token, use, now);
  if (LOCAL_MODE) return principalMode() === "legacy" ? LOCAL_OWNER : refuse("local-owner-unverifiable");
  return refuse("missing-token");
}
