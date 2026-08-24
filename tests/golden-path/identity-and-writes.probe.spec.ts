// LANE — ASYNC-RACE-GUARDS + IDENTITY-SCOPED-EVICTION (dynamic).
//
// Registry: client-state / async-race-guards, client-state / identity-scoped-eviction.
//
// TWO DEFECTS, both about data the user can lose or leak, neither of which had
// anything guarding it.
//
//  1. NO LATEST-WINS. Every caller fires `void saveStep(...)` on a keystroke.
//     Nothing decided which of two in-flight writes for one `${projectId}:${phase}`
//     key was allowed to land, so they settled in ARRIVAL order — and arrival
//     order is not issue order, because `openDb()` is awaited on every call. A
//     slow earlier write landed on top of a faster later one, the user's last
//     sentence vanished, and the store reported success.
//
//  2. NOTHING EVICTED A SIGNED-OUT IDENTITY. Projects, themes, assets and steps
//     are keyed by uid, so a second account never SAW the first one's rows — and
//     they stayed resident on the machine regardless, until someone cleared site
//     data by hand.
//
// WHAT IS DRIVEN HERE. Both fixes had their decision extracted out of the
// IndexedDB path on purpose, because this suite is Node-context and cannot open a
// database — the ordering rule and the trigger table are pure functions of call
// order and uid, and a rule that cannot be asserted is a rule nobody can trust.
// The localStorage half of the eviction IS driven end to end, against a stub.
// What is NOT covered is the IDB transaction itself; that is the open
// `data-access / repo-testing` item, and it is the same gap for both.
import { test, expect } from "@playwright/test";
import { claimSaveSlot, __resetSaveSlots } from "@/app/_phases/_shared/stepStore";
import {
  evictIdentity,
  transitionFor,
  userScopedLocalKeys,
} from "@/lib/identityEviction";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.beforeEach(() => __resetSaveSlots());

// ── 1. Latest-wins ──────────────────────────────────────────────────────────

test("latest-wins: of two saves for one key, only the NEWER may write", () => {
  const a = claimSaveSlot("p1", "script"); // issued first, slow
  const b = claimSaveSlot("p1", "script"); // issued second, fast

  // Whichever arrives at the store first, the OLDER ticket has lost its right.
  expect(a.stillNewest()).toBe(false);
  expect(b.stillNewest()).toBe(true);
  console.log(`[race] tickets a=${a.ticket} b=${b.ticket}; a may write? ${a.stillNewest()}`);
});

test("latest-wins: the newest is still newest when it is the ONLY one", () => {
  const only = claimSaveSlot("p1", "script");
  expect(only.stillNewest()).toBe(true);
});

test("latest-wins: the rule is PER KEY — one project's typing cannot cancel another's", () => {
  // The bug this forbids is the over-correction: a single global token would let
  // a save in the Frames step abandon an in-flight save in the Script step, and
  // the user would lose work for the opposite reason.
  const script = claimSaveSlot("p1", "script");
  const frames = claimSaveSlot("p1", "frames");
  const otherProject = claimSaveSlot("p2", "script");
  expect(script.stillNewest()).toBe(true);
  expect(frames.stillNewest()).toBe(true);
  expect(otherProject.stillNewest()).toBe(true);
});

test("latest-wins: a burst of keystrokes leaves exactly ONE writer", () => {
  const slots = Array.from({ length: 40 }, () => claimSaveSlot("p1", "script"));
  const survivors = slots.filter((s) => s.stillNewest());
  console.log(`[race] 40 keystrokes -> ${survivors.length} writer(s)`);
  expect(survivors.length).toBe(1);
  // And it is the LAST one — the user's most recent keystroke is what reaches
  // disk, which is the whole point.
  expect(survivors[0]).toBe(slots.at(-1));
});

test("latest-wins: tickets are monotonic, so a slow write cannot regain its right", () => {
  const a = claimSaveSlot("p1", "script");
  claimSaveSlot("p1", "script");
  // Time passes; `a`'s database finally opens. It must still be refused — the
  // check is not a snapshot taken at claim time.
  expect(a.stillNewest()).toBe(false);
  claimSaveSlot("p1", "script");
  expect(a.stillNewest()).toBe(false);
});

// ── 2. Identity-scoped eviction ─────────────────────────────────────────────

test("triggers: every identity FLIP is classified, and refresh is NOT one", () => {
  // A sign-out, a session that ended, a revocation, and a sign-out in another
  // tab all arrive here identically: a uid we held, and no uid now.
  expect(transitionFor("uid-a", null)).toBe("session-ended");
  // The dangerous one — a different uid with no signed-out moment in between.
  expect(transitionFor("uid-a", "uid-b")).toBe("account-switched");

  // THE DELIBERATE EXCLUSION. A plain credential refresh changes the bearer and
  // not the user. Evicting here would turn Firebase's own refresh cadence into a
  // periodic wipe of the user's work, on a schedule nobody would ever connect
  // back to it.
  expect(transitionFor("uid-a", "uid-a")).toBe(null);

  // First sign-in of the session: nothing was held, so there is nothing
  // illegitimate to remove — and wiping here would delete the work of the
  // account that is signing IN.
  expect(transitionFor(null, "uid-a")).toBe(null);
  expect(transitionFor(null, null)).toBe(null);
});

test("keys: the eviction list covers EVERY module that writes a uid-scoped key", () => {
  // The failure this catches is the one the technique names: a store added later
  // whose key nobody added to the owner. Nothing fails, no test notices, and the
  // defect surfaces when two accounts share one machine. So the list is held
  // against the modules that actually build those keys.
  const uid = "uid-a";
  const listed = new Set(userScopedLocalKeys(uid));

  const writers = [
    ["lib/useProjects.ts", `gravitone.seeded.${uid}`],
    ["lib/useAssets.ts", `gravitone.assets.seeded.${uid}`],
    ["lib/jobs.tsx", "gravitone.jobs.v1"],
  ] as const;

  for (const [file, expected] of writers) {
    const src = readFileSync(resolve(__dirname, "../..", file), "utf8");
    // The key template really is still written in that file...
    const template = expected.replace(uid, "${uid}");
    expect(
      src.includes(template) || src.includes(expected),
      `${file} no longer builds ${expected} — the eviction list is describing a key that moved`,
    ).toBe(true);
    // ...and the owner evicts it.
    expect(listed.has(expected), `${file} writes ${expected} and the eviction list misses it`).toBe(
      true,
    );
  }
  console.log(`[identity] eviction covers ${listed.size} local key(s): ${[...listed].join(", ")}`);
});

test("eviction: it actually removes the keys, and only this uid's", async () => {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const g = globalThis as { localStorage?: unknown };
  const had = "localStorage" in g;
  g.localStorage = stub;
  try {
    store.set("gravitone.seeded.uid-a", "1");
    store.set("gravitone.assets.seeded.uid-a", "1");
    store.set("gravitone.jobs.v1", "{}");
    // Another account's flag, and something that is not ours at all.
    store.set("gravitone.seeded.uid-b", "1");
    store.set("unrelated.app.key", "keep me");

    const report = await evictIdentity("uid-a", "signed-out");
    console.log(`[identity] report local=${report.local} failed=${report.failed} remaining=${[...store.keys()].join(",")}`);

    expect(report.local).toBe(3);
    expect(report.reason).toBe("signed-out");
    expect(store.has("gravitone.seeded.uid-a")).toBe(false);
    expect(store.has("gravitone.assets.seeded.uid-a")).toBe(false);
    expect(store.has("gravitone.jobs.v1")).toBe(false);
    // The other account's own state is not this eviction's business, and neither
    // is anything that is not ours.
    expect(store.has("gravitone.seeded.uid-b")).toBe(true);
    expect(store.get("unrelated.app.key")).toBe("keep me");
  } finally {
    if (had) g.localStorage = undefined;
    delete g.localStorage;
  }
});

test("eviction: it NEVER rejects, and it is idempotent", async () => {
  // It runs in a `finally` after a network call that may have failed, so a throw
  // here would take the sign-out with it. And running twice — the settlement path
  // and the auth listener both see one sign-out — must be harmless.
  const first = await evictIdentity("uid-nothing-stored", "session-ended");
  const second = await evictIdentity("uid-nothing-stored", "session-ended");
  expect(first.failed).toBe(false);
  expect(second.local).toBe(0);
  // An empty uid is not an identity and must not start a wipe.
  const none = await evictIdentity("", "signed-out");
  expect(none.local).toBe(0);
});

test("eviction: the local wipe does not depend on the remote sign-out succeeding", () => {
  // STRUCTURAL — there is no Firebase in this process to fail. The property is
  // that the call lives in a settlement path that runs on BOTH outcomes: a
  // sign-out which leaves this machine's copies intact because a request failed
  // is the worst outcome available, since the user has been told they are signed
  // out and the screen agrees.
  const src = readFileSync(resolve(__dirname, "../../lib/useAuth.tsx"), "utf8");
  const tryAt = src.indexOf("await fbSignOut(");
  const finallyAt = src.indexOf("} finally {", tryAt);
  const evictAt = src.indexOf("evictIdentity(uid,", finallyAt);
  console.log(`[identity] fbSignOut at ${tryAt}, finally at ${finallyAt}, evict at ${evictAt}`);
  expect(tryAt).toBeGreaterThan(-1);
  expect(finallyAt).toBeGreaterThan(tryAt);
  expect(evictAt).toBeGreaterThan(finallyAt);
});

test("eviction: the identity layer subscribes to auth STATE, not to the token", () => {
  // The subscription IS the refresh exclusion. onIdTokenChanged fires on every
  // background credential refresh; onAuthStateChanged does not.
  const src = readFileSync(resolve(__dirname, "../../lib/useAuth.tsx"), "utf8");
  expect(src).toContain("onAuthStateChanged(auth,");
  // The word appears in the comment that explains WHY it is not used; what must
  // not appear is a call to it, or an import of it.
  expect(src.includes("onIdTokenChanged(")).toBe(false);
  expect(/^\s*onIdTokenChanged,\s*$/m.test(src)).toBe(false);
});
