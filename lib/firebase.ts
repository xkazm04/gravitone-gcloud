"use client";

// Firebase client init — ported from dolla/arm/gravitone/web/lib/firebase.ts,
// the project this studio was extracted from. Same Firebase project, same
// Google-only posture, same session ceiling.
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
  onIdTokenChanged,
  setPersistence,
  signOut,
} from "firebase/auth";

// Minimal init (apiKey/authDomain/projectId) — the proven shape from the
// sibling apps on this same Firebase project.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

/** Firebase config is present. NOT "the user is signed in" — see useAuth. */
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Keep users signed in across reloads/sessions via local storage. Firebase on
// its own would never expire that — see the session policy below, which puts a
// ceiling on it.
if (firebaseReady) void setPersistence(auth, browserLocalPersistence).catch(() => {});

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
// with the ceiling they enforced. `browserLocalPersistence` (set where `auth` is
// created) is now the whole of the policy: the refresh token survives restarts,
// and only an explicit sign-out or Google-side revocation ends the session.

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");
