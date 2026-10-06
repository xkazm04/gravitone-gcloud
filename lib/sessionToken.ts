// THE BROWSER'S COPY OF ITS FIREBASE ID TOKEN — a cache, read synchronously.
//
// WHY THIS EXISTS. lib/apiAuth.ts can now verify a Firebase ID token itself
// (lib/principal.ts, card AUP-A stage 1), so the money routes can know WHO is
// calling instead of trusting a secret that shipped in the bundle. But every
// client door builds its headers with `accessHeader()` (lib/imagingClient.ts),
// which is synchronous and spread inline into a dozen `fetch` calls — and
// `User.getIdToken()` is async. Rather than make every call site await, this
// module holds the current token, fed by lib/useAuth.tsx's `onIdTokenChanged`
// subscription, and `accessHeader()` reads it without waiting.
//
// IT NEVER EVICTS. That is the lib/identityEviction.ts trigger rule, restated
// here because this module is exactly where someone would break it: a token
// change is NOT an identity change. Firebase refreshes the token about hourly;
// the bearer changes, the person does not. So this file does one thing with a
// token event — replace or clear the cached string — and imports nothing that
// could wipe a store. The identity transitions stay on `onAuthStateChanged`, in
// useAuth, compared by uid.
//
// THE FIXTURE AND LOCAL IDENTITIES ARE NAMED, NOT DISCOVERED. lib/devAuth.ts and
// lib/localMode.ts hand out users whose `getIdToken` throws on purpose (there is
// no session to speak for). They never reach this module through Firebase's
// listener, and if one is handed here anyway it is recognised by its uid and
// never asked — a throw is not how this module finds out what kind of user it
// holds.
//
// CLIENT MODULE. No secret, no server env name, no node: import. The server
// names the same header in lib/principal.ts (it does not import this file,
// which would drag the Firebase client SDK into every route), and
// principal.probe.spec.ts pins the two spellings equal.

import { onIdTokenChanged, type Auth } from "firebase/auth";

import { DEV_UID } from "./devAuth";
import { LOCAL_UID } from "./localMode";

/** The header the ID token rides in when Authorization is already taken by the
 *  legacy shared secret. A bundle with no public secret sends the token as
 *  `Authorization: Bearer <idToken>` instead; the server reads either. */
export const ID_TOKEN_HEADER = "x-gravitone-id-token";

/** The slice of a Firebase `User` this module touches. */
export interface TokenUser {
  uid: string;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

/** Refresh this long before expiry. Firebase's own refresh runs ~5 minutes
 *  ahead; this only matters for a tab that slept through it. */
const NEAR_EXPIRY_MS = 5 * 60_000;

let held: { token: string; expMs: number; user: TokenUser } | null = null;
/** Bumped on every event, so a slow `getIdToken` for a user who has since
 *  signed out cannot land after the clear. */
let generation = 0;
let refreshing = false;

/** `exp` (ms) from a JWT's payload, or 0 when it cannot be read — an unreadable
 *  exp is not treated as expired; the server is the one that judges. */
function expiryOf(token: string): number {
  try {
    const part = token.split(".")[1] ?? "";
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * The token listener's whole job. Called with the user from `onIdTokenChanged`
 * (or null when signed out). Replaces or clears the cached token and does
 * nothing else.
 */
export async function cacheSessionToken(user: TokenUser | null): Promise<void> {
  const mine = ++generation;
  if (!user || user.uid === DEV_UID || user.uid === LOCAL_UID) {
    held = null;
    return;
  }
  try {
    const token = await user.getIdToken();
    if (mine === generation) held = { token, expMs: expiryOf(token), user };
  } catch {
    // No token is an honest state: the server answers 401 by name.
    if (mine === generation) held = null;
  }
}

/**
 * THE subscription: Firebase's token listener, wired to the cache and to
 * nothing else. lib/useAuth.tsx calls this once beside its onAuthStateChanged
 * (which owns identity transitions and eviction). Returns the unsubscribe.
 */
export function subscribeSessionToken(auth: Auth): () => void {
  const stop = onIdTokenChanged(auth, (u) => {
    void cacheSessionToken(u);
  });
  return () => {
    stop();
    __resetSessionToken();
  };
}

/**
 * The current ID token, synchronously, or `undefined` when there is none or it
 * has expired. Near expiry it asks Firebase for a fresh one in the background;
 * the listener delivers it, so the NEXT call carries it.
 */
export function currentIdToken(now: number = Date.now()): string | undefined {
  if (!held) return undefined;
  if (held.expMs && now >= held.expMs - NEAR_EXPIRY_MS && !refreshing) {
    refreshing = true;
    const { user } = held;
    void user
      .getIdToken()
      .then((t) => {
        if (held && held.user === user) held = { token: t, expMs: expiryOf(t), user };
      })
      .catch(() => {})
      .finally(() => {
        refreshing = false;
      });
  }
  if (held.expMs && now >= held.expMs) return undefined;
  return held.token;
}

/** Test hook — forget the cached token. */
export function __resetSessionToken(): void {
  held = null;
  generation++;
  refreshing = false;
}
