"use client";

// Auth context — ported from dolla/arm/gravitone/web/lib/useAuth.tsx. Google
// sign-in via Firebase popup, with the full-page-redirect fallback that app
// learned the hard way (popups get blocked, closed, and killed by COOP).
//
// What was DROPPED in the port: the Firestore `users/{uid}` upsert and the
// first-sign-in API-key minting, with its forced `location.assign("/playground")`.
// Both belonged to the TTS backend. Everything the studio needs about a person
// — name, email, avatar — is already on the Firebase User object, so a
// round-trip to Firestore would buy a second failure surface and no fact.
//
// The two flags stay separate and both matter:
//   ready        — Firebase is configured at all
//   authResolved — onAuthStateChanged has fired once (or config is absent)
// Gated routes wait for authResolved and then fail CLOSED, so a missing config
// bounces visitors to the landing rather than rendering the studio to everyone.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  browserLocalPersistence,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type AuthError,
  type User,
} from "firebase/auth";
// `authClient()` is a guarded accessor, not a constant — see lib/firebase.ts.
// Every call below sits behind the `firebaseReady` predicate from that same
// module, which is what makes the throw unreachable here rather than merely
// unlikely.
import { authClient, firebaseReady, googleProvider } from "./firebase";
import { DEV_AUTH, DEV_USER } from "./devAuth";
import { LOCAL_MODE, LOCAL_USER } from "./localMode";
// The eviction OWNER. It imports every user-scoped store; nothing it clears
// imports it, and this context does not own the list — see lib/identityEviction.ts
// for the enumerated triggers and the one deliberate exclusion.
import { evictIdentity, transitionFor, type EvictionReason } from "./identityEviction";

// Popup can fail (blocked, closed, COOP, internal-error) — fall back to a
// full-page redirect, which always works. getRedirectResult (on mount) then
// completes that path.
const REDIRECT_FALLBACK = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/internal-error",
  "auth/operation-not-supported-in-this-environment",
]);

export type Profile = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  ready: boolean;
  authResolved: boolean;
  /** Why the last identity transition happened, or null if none has. */
  lastTransition: EvictionReason | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** WHY the last identity transition happened, or null if none has. Carried so a
   *  surface can tell "you signed out" from "your session ended" — the eviction is
   *  identical either way, the narration is not, and treating them alike is what
   *  produces the familiar report of being "randomly logged out". */
  const [lastTransition, setLastTransition] = useState<EvictionReason | null>(null);
  /** The uid we currently believe we are. A ref, not state: the auth listener
   *  compares against it inside a callback registered once, and a state read there
   *  would be the value captured at subscribe time — always null. */
  const heldUid = useRef<string | null>(null);

  useEffect(() => {
    // LOCAL MODE — the self-hosted single-user posture (lib/localMode.ts).
    // Resolves immediately as the stable local owner; no Firebase involved,
    // in any build. Checked FIRST so a checkout that sets both flags runs as
    // the mode a real person opted into, not as the automation fixture.
    if (LOCAL_MODE) {
      heldUid.current = LOCAL_USER.uid;
      setUser(LOCAL_USER);
      setLoading(false);
      setAuthResolved(true);
      return;
    }
    // DEV BYPASS — non-production builds only, and only with the flag set.
    // Resolves immediately as a fixed fake account so the gated surface can be
    // driven. See lib/devAuth.ts for why this cannot reach production.
    if (DEV_AUTH) {
      setUser(DEV_USER);
      setLoading(false);
      setAuthResolved(true);
      return;
    }
    // No Firebase config: auth is definitively unresolvable, so treat it as
    // resolved-and-signed-out. Consumers that gate on authResolved then fail
    // CLOSED instead of rendering the studio to all.
    if (!firebaseReady) {
      setLoading(false);
      setAuthResolved(true);
      return;
    }
    const auth = authClient();
    // Complete a redirect-based sign-in if we came back from one.
    getRedirectResult(auth).catch((e) =>
      setError(e instanceof Error ? e.message : "sign-in failed"),
    );
    // onAuthStateChanged, NOT onIdTokenChanged. That is not an arbitrary choice
    // of subscription: a plain credential refresh fires the token listener and is
    // NOT an identity flip, so listening there would wipe the user's own work on
    // Firebase's refresh cadence. See lib/identityEviction.ts.
    return onAuthStateChanged(auth, (u) => {
      // IDENTITY IS COMPARED BY DURABLE IDENTIFIER. Never by display name or
      // email — those change without the person changing, and a reclaimed address
      // stays equal while pointing at somebody else.
      const was = heldUid.current;
      const now = u?.uid ?? null;
      // The trigger table lives at the owner, not here — including the case that
      // is NOT a flip. This context asks; it does not decide.
      const reason = transitionFor(was, now);
      if (was && reason) {
        setLastTransition(reason);
        void evictIdentity(was, reason);
      }
      heldUid.current = now;
      setUser(u);
      setLoading(false);
      setAuthResolved(true);
    });
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    // Local mode has no door to knock on — the owner is already in, and the
    // landing renders the way-through link rather than this handler. Guarded
    // anyway so a stray call cannot surface a misleading config complaint.
    if (LOCAL_MODE) return;
    if (!firebaseReady) {
      setError("Firebase is not configured — see .env.example. For a machine-local run with no Google account, set NEXT_PUBLIC_LOCAL_MODE=1.");
      return;
    }
    const auth = authClient();
    await setPersistence(auth, browserLocalPersistence);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = (e as AuthError)?.code ?? "";
      const coop = /Cross-Origin-Opener-Policy|window\.close/i.test(String(e));
      if (REDIRECT_FALLBACK.has(code) || coop) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : "sign-in failed");
          return;
        }
      }
      setError(e instanceof Error ? e.message : "sign-in failed");
    }
  }, []);

  const signOut = useCallback(async () => {
    // In local mode "sign out" would be a lie twice over: there is no session
    // to end, and the eviction that follows a real sign-out would wipe the
    // local shelf — the only copy of the owner's work. The menu's sign-out is
    // therefore a no-op here; leaving local mode is an env change, not a click.
    if (LOCAL_MODE) return;
    // Unreachable without a config — a signed-in user implies a live client —
    // but the guard is stated rather than assumed, because the accessor throws
    // and a sign-out button is the last place anyone wants a stack trace.
    if (!firebaseReady) return;
    const uid = heldUid.current;
    setLastTransition("signed-out");
    try {
      await fbSignOut(authClient());
    } finally {
      // THE SETTLEMENT PATH, deliberately. Telling Firebase to end the session
      // can fail — offline, timed out, an authority that is down — and the local
      // wipe has to happen anyway. A sign-out that leaves this machine's copies
      // intact because a request failed is the worst outcome available: the user
      // has been told they are signed out, the screen agrees, and the data is
      // still resident. Remote invalidation is best-effort; local eviction is the
      // guarantee.
      //
      // The onAuthStateChanged listener above ALSO sees this transition, and
      // evicting twice is harmless — the second pass finds nothing and reports
      // zeroes — while relying on the listener alone would make the guarantee
      // depend on the very call that just failed.
      if (uid) await evictIdentity(uid, "signed-out");
      heldUid.current = null;
    }
  }, []);

  const profile = useMemo<Profile | null>(
    () =>
      user
        ? {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
          }
        : null,
    [user],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      ready: firebaseReady,
      authResolved,
      lastTransition,
      signIn,
      signOut,
      error,
    }),
    [user, profile, loading, authResolved, lastTransition, signIn, signOut, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
