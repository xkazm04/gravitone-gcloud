// DEVELOPMENT AUTH BYPASS — for test automation only.
//
// ─────────────────────────────────────────────────────────────────────────────
//  This signs a fake user in without Google. It exists because the studio is
//  gated, Firebase's session is origin-scoped and lives in Chrome's own
//  IndexedDB, and a headless browser therefore cannot reach any of the gated
//  surface — so nothing behind the gate could be driven or regression-tested.
//
//  It is gated TWICE, and the first gate is the one that matters:
//
//    1. `process.env.NODE_ENV !== "production"`
//       Next sets NODE_ENV=production for `next build`. This branch is therefore
//       DEAD CODE in any production bundle — the constant folds to false and the
//       fake user is compiled out. The bypass cannot ship, even if somebody sets
//       the env var on a deploy by mistake.
//
//    2. `NEXT_PUBLIC_DEV_AUTH === "1"`
//       Explicit opt-in, so an ordinary `next dev` session is still gated and a
//       developer does not silently work as a fake account.
//
//  Both must hold. Drive with:  NEXT_PUBLIC_DEV_AUTH=1 npx next dev -p 3183
//
//  When active the app shows a permanent banner (see StudioFrame). A bypassed
//  session must never be mistakable for a real one.
// ─────────────────────────────────────────────────────────────────────────────

import type { Profile } from "./useAuth";

/** True only in a non-production build with the flag explicitly set. */
export const DEV_AUTH =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_AUTH === "1";

/** The automation account. A STABLE uid, because projects are scoped by uid and
 *  the seeded fixtures have to be found again on the next run. */
export const DEV_UID = "dev-automation-user";

export const DEV_PROFILE: Profile = {
  uid: DEV_UID,
  displayName: "Development User",
  email: "dev@localhost",
  photoURL: null,
};

/** Shaped like a Firebase User for the small surface the app actually reads:
 *  `uid` (project scoping) and `metadata.lastSignInTime` (session age, now
 *  unused since the ceiling was removed). Deliberately NOT a real User — it has
 *  no token, so anything that tried to call a backend with it would fail loudly
 *  rather than appear to work. */
export const DEV_USER = {
  uid: DEV_UID,
  displayName: DEV_PROFILE.displayName,
  email: DEV_PROFILE.email,
  photoURL: DEV_PROFILE.photoURL,
  emailVerified: true,
  isAnonymous: false,
  metadata: { creationTime: undefined, lastSignInTime: new Date().toISOString() },
  providerData: [],
  getIdToken: async () => {
    throw new Error("dev-auth user has no ID token — it is a local fixture, not a session");
  },
} as unknown as import("firebase/auth").User;
