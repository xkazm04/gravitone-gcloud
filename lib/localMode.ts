// LOCAL MODE — the self-hosted, single-user posture the README promised.
//
// The studio's DATA is local: projects, parts, jobs and the Library live in the
// kernel store on this machine (foundry-out/gravitone.sqlite, lib/kernelStore.ts
// - no Firestore). v1 kept them in the browser's IndexedDB (lib/studioDb.ts),
// which is read now only by the archive import that moves a v1 shelf into the
// kernel. The ONLY thing Firebase does in this app is authentication, so the
// only thing standing between an unconfigured checkout and a working studio is
// the auth gate failing closed. Local mode satisfies the gate with a fixed local
// identity instead of dropping it.
//
// HOW THIS DIFFERS FROM lib/devAuth.ts, which looks similar and is not:
//
//   · devAuth is a TEST-AUTOMATION bypass. It is compiled out of production
//     builds by design, wears a loud amber banner, and exists so a headless
//     browser can drive the gated surface.
//   · localMode is a DEPLOYMENT posture. It works in production builds on
//     purpose — "my machine, my studio" is a legitimate way to run this app —
//     and it wears a quiet badge, because it is not a warning, it is a mode.
//
// WHAT IT DOES NOT DO. It does not turn off the money door: a spending act -
// a Server Action through `principal("money")` (app/_server/principal.ts), a
// guarded route through app/_server/route.ts - still requires
// IMAGING_ACCESS_SECRET (+ the NEXT_PUBLIC_ twin) and still fails closed
// without it — being local changes who you are, not what spending requires.
// (That secret is the BROWSER's: a script on the same machine presents its own
// CLI token, pipeline/token.mts, and under SHARED_SECRET_CALLERS=browser the
// secret is refused to it - lib/apiAuth.ts.) And it does not sync anything
// anywhere: a local studio's work lives on this machine and nowhere else,
// which is the point, and also the caveat.
//
// The uid is STABLE across sessions — projects are scoped by uid, and a local
// owner must find yesterday's shelf. It is also distinct from devAuth's uid,
// so automation fixtures and a real local shelf never interleave.

import type { Profile } from "./useAuth";

/** Explicit opt-in, any build. Set NEXT_PUBLIC_LOCAL_MODE=1 to run the studio
 *  without Firebase. */
export const LOCAL_MODE = process.env.NEXT_PUBLIC_LOCAL_MODE === "1";

export const LOCAL_UID = "local-owner";

export const LOCAL_PROFILE: Profile = {
  uid: LOCAL_UID,
  displayName: "Local Studio",
  email: null,
  photoURL: null,
};

/** Shaped like a Firebase User for the surface the app reads (uid, names,
 *  metadata) — see DEV_USER for the precedent. No token on purpose: anything
 *  that tried to call an authenticated backend with this identity should fail
 *  loudly, because there is no backend it could honestly speak for. */
export const LOCAL_USER = {
  uid: LOCAL_UID,
  displayName: LOCAL_PROFILE.displayName,
  email: LOCAL_PROFILE.email,
  photoURL: LOCAL_PROFILE.photoURL,
  emailVerified: true,
  isAnonymous: false,
  metadata: { creationTime: undefined, lastSignInTime: new Date().toISOString() },
  providerData: [],
  getIdToken: async () => {
    throw new Error("local-mode user has no ID token — there is no remote session to speak for");
  },
} as unknown as import("firebase/auth").User;
