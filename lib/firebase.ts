"use client";

// Firebase client init — ported from dolla/arm/gravitone/web/lib/firebase.ts,
// the project this studio was extracted from. Same Firebase project, same
// Google-only posture. The parent's 12-hour session ceiling did NOT survive the
// port past 2026-08-12 — see the policy note below, which is the one place that
// describes what this app's sessions actually do.
//
// What was DROPPED in the port, deliberately: Firestore (`getFirestore`) and
// the API-key vault (`clearStoredKey`). Both existed to serve the TTS backend
// that lived behind that app — there is no backend here and no credential to
// purge, so importing firebase/firestore would cost bundle weight and a rules
// dependency for nothing. Projects persist to IndexedDB instead (lib/studioDb).
//
// The web config is public by design — access is secured by Firebase Auth
// (Google provider) and its authorized-domain list, not by hiding these values.

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  type Auth,
} from "firebase/auth";

// Minimal init (apiKey/authDomain/projectId) — the proven shape from the
// sibling apps on this same Firebase project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

/** Firebase config is present. NOT "the user is signed in" — see useAuth.
 *
 *  EVERY field above is required, `authDomain` included, because every field
 *  above is load-bearing: the Google popup and its redirect fallback both go
 *  through `authDomain`, and Firebase resolves the auth endpoint from it. This
 *  check used to ask only for `apiKey` and `projectId`, so a deployment that had
 *  filled in two of three variables reported READY, skipped useAuth's friendly
 *  "Firebase is not configured — see .env.example", and failed at the popup with
 *  a raw `auth/…` code instead. A partial config is a missing config. */
export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

/** The three variables `firebaseReady` demands, named once so the error message
 *  and .env.example cannot drift apart. */
export const FIREBASE_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

/** "Not configured" as a distinguishable type, so a caller can tell it apart
 *  from Firebase being DOWN — the two demand different behaviour, and a generic
 *  Error collapses them. */
export class FirebaseNotConfiguredError extends Error {
  readonly code = "firebase/not-configured";
  constructor() {
    super(
      `Firebase auth is not configured. Set ${FIREBASE_VARS.join(", ")} in .env.local — ` +
        `see .env.example. A partial config is a missing config.`,
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

let cached: Auth | null = null;

/**
 * THE ONE DOOR to the Firebase Auth client.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A CONSTANT (fixed 2026-08-24) ────────────
 *
 * This file used to build the client at module scope:
 *
 *     const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
 *     export const auth = getAuth(app);
 *
 * `getAuth` validates the api key eagerly, so with the variables absent that line
 * threw `auth/invalid-api-key` while the module graph was still being evaluated —
 * at IMPORT time, in whatever surface happened to pull the chain. The observed
 * blast radius was total: `next build` with an empty environment died prerendering
 * `/_not-found`, a page with no relationship to authentication whatsoever, and the
 * whole build exited 1.
 *
 * The defect was invisible for as long as it existed because every developer
 * machine has a populated `.env.local`; only a clean room with no environment
 * could see it, and until 2026-08-24 this repo had no clean room. The gates
 * workflow's env-less `build` job found it on its first green install.
 *
 * The registry calls this shape out by name (optional-dependency-degradation /
 * guarded-singleton-accessor): "never construct a client at module scope from
 * configuration that may be absent." So:
 *
 *   · a factory, not a constant — absence costs nothing until sign-in is used;
 *   · SUCCESS is memoised, failure is not (it just throws again, cheaply);
 *   · it throws a TYPED error naming the variables, and never returns null and
 *     never returns a stub — a no-op auth client would report every visitor as
 *     signed out while looking like it worked;
 *   · `firebaseReady` is the companion predicate and reads THE SAME values from
 *     THIS module, so a yes from the predicate cannot be followed by a throw
 *     from the accessor.
 */
export function authClient(): Auth {
  if (!firebaseReady) throw new FirebaseNotConfiguredError();
  if (cached) return cached;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Keep users signed in across reloads/sessions via local storage. Firebase on
  // its own would never expire that — see the session policy below. Set here, at
  // the one place the client comes into existence, so it cannot be forgotten by a
  // caller and cannot run before there is a client to set it on.
  void setPersistence(auth, browserLocalPersistence).catch(() => {});
  cached = auth;
  return auth;
}

/* ---------------------------------------------------------------------------
   SESSION PERSISTENCE POLICY  (changed 2026-08-12, at the owner's instruction)

   Google is the ONLY sign-in provider. No passwords stored, no reset flow, no
   email-verification surface to harden — one identity path, and Google owns the
   credential.

   POLICY: the session PERSISTS INDEFINITELY. `browserLocalPersistence` keeps the
   refresh token across reloads, browser restarts and closed tabs, and nothing in
   this app expires it. Signing in once is signing in for good, until the user
   signs out or Google revokes the token.

   This replaces a 12-hour client-side ceiling. Stating the trade plainly, because
   it is a real one and a future reader should not have to rediscover it:

     · A session left on a SHARED machine never ends on its own. Anyone with the
       browser profile has the account, and there is no idle timeout to catch it.
     · The ceiling was the only thing standing between "closed the laptop" and
       "still signed in tomorrow". That was the point of removing it, and it is
       also the cost.
     · There is no server-side session to revoke either — this app is static +
       IndexedDB — so the only exits are the user signing out, or Google's own
       token revocation.

   Proportionate for a single-operator prototype. Re-introduce a ceiling before
   this holds anything that would matter if a second person opened the laptop.
--------------------------------------------------------------------------- */

/** Kept exported so the removal is greppable rather than silent. No longer
 *  enforced anywhere — see the policy note above. */
export const MAX_SESSION_MS = Number.POSITIVE_INFINITY;

/** Age of a session in ms, or null when the timestamp is absent/unparseable. */
export function sessionAgeMs(
  lastSignInTime: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!lastSignInTime) return null;
  const at = Date.parse(lastSignInTime);
  return Number.isNaN(at) ? null : now - at;
}

/**
 * True only when we can prove the session is too old. An unknown or
 * unparseable `lastSignInTime` fails OPEN on purpose: a missing timestamp is a
 * Firebase-metadata quirk, not evidence of staleness, and bouncing a working
 * user out of a live session is the worse failure of the two.
 */
export function sessionExpired(
  _lastSignInTime: string | null | undefined,
  _now: number = Date.now(),
): boolean {
  // Sessions no longer expire. Kept as a named function rather than deleted so
  // the policy has one obvious place to come back to, and so any caller that
  // still asks the question gets a truthful answer instead of a stale ceiling.
  return false;
}

// No enforcement loop. The previous build signed the user out on an ID-token
// refresh, on tab-visibility change and on a 5-minute tick; all three are gone
// with the ceiling they enforced. `browserLocalPersistence` (set inside
// authClient(), where the client is created) is now the whole of the policy: the
// refresh token survives restarts, and only an explicit sign-out or Google-side
// revocation ends the session.

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");
