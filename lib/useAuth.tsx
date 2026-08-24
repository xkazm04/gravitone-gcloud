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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
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
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      setAuthResolved(true);
    });
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    if (!firebaseReady) {
      setError("Firebase is not configured — see .env.example");
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
    // Unreachable without a config — a signed-in user implies a live client —
    // but the guard is stated rather than assumed, because the accessor throws
    // and a sign-out button is the last place anyone wants a stack trace.
    if (!firebaseReady) return;
    await fbSignOut(authClient());
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
      signIn,
      signOut,
      error,
    }),
    [user, profile, loading, authResolved, signIn, signOut, error],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
