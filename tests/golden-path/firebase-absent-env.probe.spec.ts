// LANE — OPTIONAL-DEPENDENCY-ABSENT (dynamic).
//
// Registry: optional-dependency-degradation / guarded-singleton-accessor,
// "test the unconfigured path by importing the surface with an empty
// environment. The assertion is that the page RENDERS, not that the feature
// works."
//
// WHAT THIS PINS, and why it exists at all. lib/firebase.ts used to construct the
// Firebase Auth client at module scope:
//
//     const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
//     export const auth = getAuth(app);
//
// `getAuth` validates the api key eagerly, so with the three NEXT_PUBLIC_FIREBASE_*
// variables absent that line threw `auth/invalid-api-key` while the module graph
// was still being evaluated — at IMPORT time, reaching whatever surface happened
// to pull the chain. Measured blast radius on 2026-08-24: `next build` with an
// empty environment died prerendering `/_not-found`, a page with no relationship
// to authentication, and the build exited 1.
//
// It survived that long because every developer machine has a populated
// `.env.local`, so the local build was a false green. This probe removes that
// asymmetry: the Playwright config loads no env file, so THIS PROCESS IS the
// empty environment, permanently, on every machine.
//
// Test 1 FAILS against the pre-fix module — the import itself threw, so the probe
// could not even reach an assertion. That is the point.
import { test, expect } from "@playwright/test";

const FIREBASE_ENV = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
];

test("absent config: importing lib/firebase does not throw, and reports NOT ready", async () => {
  // Assert the instrument before the result: if some other probe or a stray
  // .env loader has populated these, this test would pass for the wrong reason.
  const present = FIREBASE_ENV.filter((v) => process.env[v]);
  expect(present, `probe requires an EMPTY firebase env; found ${present.join(", ")}`).toEqual([]);

  const mod = await import("@/lib/firebase");
  console.log(`[firebase] imported with an empty env -> firebaseReady=${mod.firebaseReady}`);
  expect(mod.firebaseReady).toBe(false);
});

test("absent config: the accessor REFUSES, typed, and names every variable", async () => {
  const { authClient, FirebaseNotConfiguredError, FIREBASE_VARS } = await import("@/lib/firebase");

  let thrown: unknown = null;
  try {
    authClient();
  } catch (e) {
    thrown = e;
  }

  // Not null, not a stub, not a generic Error: a caller has to be able to tell
  // "never configured" apart from "Firebase is down", because the two demand
  // different behaviour.
  expect(thrown).toBeInstanceOf(FirebaseNotConfiguredError);
  const err = thrown as InstanceType<typeof FirebaseNotConfiguredError>;
  expect(err.code).toBe("firebase/not-configured");
  for (const v of FIREBASE_VARS) expect(err.message).toContain(v);
  console.log(`[firebase] authClient() refused -> code=${err.code}`);

  // Failure is NOT memoised — the second call throws again rather than returning
  // a cached poison value or, worse, a cached half-built client.
  expect(() => authClient()).toThrow(FirebaseNotConfiguredError);
});

test("absent config: the predicate and the accessor agree (one door, one answer)", async () => {
  const { firebaseReady, authClient } = await import("@/lib/firebase");
  // A predicate that says yes followed by an accessor that throws is the bug
  // that only appears in the deployments nobody tests. Here they are read from
  // the same values in the same module, so the implication holds in both
  // directions; this asserts the direction that is currently exercisable.
  expect(firebaseReady).toBe(false);
  expect(() => authClient()).toThrow();
});

test("Controlled counterfactual: the OLD module-scope shape really does throw at construction", async () => {
  // Synthetic control, not a repo site — the repo no longer contains this shape.
  // Without it, "the accessor prevents the crash" is an untested claim: the fix
  // and a Firebase version that had quietly stopped throwing are observationally
  // identical from the tests above alone.
  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");

  const app = initializeApp({ apiKey: undefined, authDomain: undefined, projectId: undefined }, "probe-counterfactual");
  let threw = false;
  try {
    getAuth(app); // <- the exact line that used to run at import time
  } catch (e) {
    threw = true;
    console.log(`[firebase] counterfactual: eager getAuth threw -> ${(e as { code?: string })?.code ?? String(e)}`);
  }
  await deleteApp(app).catch(() => {});

  expect(
    threw,
    "eager getAuth() on an empty config no longer throws — if this is a real Firebase " +
      "behaviour change, the guarded accessor is still correct, but this control has " +
      "stopped proving anything and should be re-derived rather than deleted.",
  ).toBe(true);
});
