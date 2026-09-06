// LANE — UNHANDLED-REJECTION ROUTING (dynamic).
//
// WHAT WAS WRONG. lib/GlobalErrorBridge is the app's last-resort reporter: it
// listens for `unhandledrejection` and pushes what it catches into stepStore's
// trouble channel, which the bell reads and the announcer speaks. It pushed
// EVERY rejection through `reportStorageTrouble("write", "app", ...)`, and
// stepStore's `classify` maps anything it does not recognise to `failed`, whose
// spoken form is "Not saved: the browser refused the operation. a background
// task was not written." — announced ASSERTIVELY, because a store that has
// stopped accepting writes is the one thing worth interrupting a creator for.
//
// The bridge's header justified that with a population claim: the residual
// unhandled rejections are "dominated by" fire-and-forget storage writes. The
// claim is false, and stepStore contradicts it in its own words — `saveStep`
// "never rejects", by construction, precisely so `void saveStep(...)` cannot
// become an unhandled rejection. What actually reaches the bridge is a dropped
// `void fetch(...)`, an AbortError, a TypeError thrown in fire-and-forget code:
// none of them storage, all of them reported as a failed save, all of them
// sending the creator to check a quota that is fine.
//
// WHAT THIS PROBE DRIVES. The real route, end to end, in the Node lane: the
// bridge's own `routeUnhandledRejection` (the line its listener runs, lifted
// out of the effect so it is reachable at all), the classification stepStore
// performs on it, the trouble the channel publishes, and the sentence
// NotificationBell would speak over it. No DOM, no renderer — the listener
// registration is the only part left unwitnessed here, and it is one
// `addEventListener` a reader can check.
//
// WHAT IT DOES NOT COVER, stated rather than implied: the announcer's politeness
// grade for this kind, and the tray card's heading, are read out of the bell's
// render tree and need a DOM. The copy they consume is asserted here; where it
// is placed is not.
import { test, expect } from "@playwright/test";

import { routeUnhandledRejection } from "@/lib/GlobalErrorBridge";
import { clearStorageTrouble, lastStorageTrouble } from "@/app/_phases/_shared/stepStore";
import { troubleAnnouncement } from "@/components/ui/NotificationBell";

/** The four rejection shapes the finding walked, as REJECTIONS rather than as
 *  descriptions of them. Three are not storage; the fourth is, and is here to
 *  prove the fix did not buy its correctness by making the channel blind to the
 *  expensive failure it exists for. */
function abortError(): unknown {
  // Duck-typed the way stepStore's own classifier reads errors: `name` is what
  // survives, and constructing a real DOMException is not portable across the
  // runtimes this module is merely imported into.
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return e;
}

function quotaError(): unknown {
  const e = new Error("The quota has been exceeded.");
  e.name = "QuotaExceededError";
  return e;
}

const NON_STORAGE: [label: string, reason: unknown][] = [
  // A `void fetch(...)` whose network dropped. The commonest shape by far, and
  // the one the browser gives no `name` worth reading.
  ["fetch dropped", new TypeError("Failed to fetch")],
  // An in-flight request abandoned by an AbortController.
  ["aborted request", abortError()],
  // Anything thrown inside a promise nobody awaited.
  ["thrown TypeError", new TypeError("Cannot read properties of undefined (reading 'id')")],
];

/** Drive the bridge's route and read back what the channel published — the
 *  same two calls the bell makes, in the same order. */
function routeAndRead(reason: unknown) {
  clearStorageTrouble();
  const returned = routeUnhandledRejection(reason);
  const published = lastStorageTrouble();
  expect(published).not.toBeNull();
  // The route must PUBLISH, not merely classify: a reporter that returns a
  // verdict nobody stored is a reporter nobody hears.
  expect(published).toEqual(returned);
  return returned;
}

test.beforeEach(() => clearStorageTrouble());
test.afterAll(() => clearStorageTrouble());

test("a non-storage rejection is not classified as a storage failure", () => {
  for (const [label, reason] of NON_STORAGE) {
    const t = routeAndRead(reason);
    console.log(`[route] ${label} -> kind=${t.kind}`);
    // `failed` is the storage-shaped catch-all and it is what every one of
    // these used to land in.
    expect(t.kind).toBe("non-storage");
  }
});

test("a non-storage rejection is not announced as a failed save", () => {
  for (const [label, reason] of NON_STORAGE) {
    const t = routeAndRead(reason);
    const text = troubleAnnouncement(t.kind, t.phase, t.message);
    console.log(`[route] ${label} -> ${text}`);
    // The sentence must not claim the user's work was lost. Nothing was being
    // written; saying so is a wrong cause AND a wrong remedy.
    expect(text.startsWith("Not saved:")).toBe(false);
    expect(text).not.toContain("was not written");
    expect(text).not.toContain("the browser refused the operation");
    // It must say what DID happen...
    expect(text).toContain("a background task failed");
    // ...and reassure on the point it no longer claims, so a creator who has
    // heard the old sentence is not left to wonder.
    expect(text).toContain("Your work is saved");
    // ...and still point at the tray, which holds the detail.
    expect(text).toContain("notifications");
    // One sentence, still. An announcement arrives into the middle of someone's
    // work and a paragraph read aloud is worse than silence.
    expect(text.length).toBeLessThan(180);
  }
});

test("a non-storage rejection carries the reason's own message", () => {
  for (const [label, reason] of NON_STORAGE) {
    const t = routeAndRead(reason);
    const said = (reason as Error).message;
    // The channel keeps it verbatim — the tray prints exactly this.
    expect(t.message).toBe(said);
    const text = troubleAnnouncement(t.kind, t.phase, t.message);
    // ...and the spoken form carries it too, which is the whole benefit: the
    // difference between "check your storage" and "the network dropped".
    // Capped, so a long message is truncated rather than dropped — assert on a
    // prefix so the cap can move without this test lying about it. The prefix
    // stops short of any trailing full stop, which the spoken form strips
    // because the message is embedded in a sentence.
    expect(text).toContain(said.replace(/\.+$/, "").slice(0, 40));
    console.log(`[route] ${label} message="${t.message}"`);
  }
});

test("a long message is truncated, not dropped, and the sentence stays one sentence", () => {
  const t = routeAndRead(new TypeError(`Failed to fetch ${"x".repeat(400)}`));
  const text = troubleAnnouncement(t.kind, t.phase, t.message);
  // The raw message survives on the channel for the tray to print in full...
  expect(t.message.length).toBeGreaterThan(400);
  // ...while the SPOKEN form stays inside the one-sentence budget.
  expect(text.length).toBeLessThan(180);
  expect(text).toContain("Failed to fetch");
  expect(text).toContain("Your work is saved");
});

test("a storage rejection arriving the same way is still a storage failure", () => {
  // The counter-case, and the reason the fix routes through `classify` rather
  // than around it. `saveStep` cannot produce this, but a direct IndexedDB user
  // in fire-and-forget code can, and a real quota reaching the bridge must not
  // be softened into "a background task failed" — quota IS the expensive one
  // and it IS blocking.
  const t = routeAndRead(quotaError());
  expect(t.kind).toBe("quota");
  const text = troubleAnnouncement(t.kind, t.phase, t.message);
  console.log(`[route] quota -> ${text}`);
  expect(text.startsWith("Not saved:")).toBe(true);
  expect(text).toContain("storage is full");
});

test("the two populations do not share a sentence", () => {
  // A taxonomy that collapses in the spoken channel is a taxonomy the assistive
  // user does not have — the same property announcement.probe already asserts
  // across the storage kinds, extended over the seam this route straddles.
  const spoken = new Set<string>();
  for (const [, reason] of [...NON_STORAGE, ["quota", quotaError()] as [string, unknown]]) {
    const t = routeAndRead(reason);
    spoken.add(troubleAnnouncement(t.kind, t.phase, t.message));
  }
  expect(spoken.size).toBe(NON_STORAGE.length + 1);
});
