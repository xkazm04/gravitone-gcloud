"use client";

// Last-resort reporter for a failure that reaches neither a try/catch nor a
// React error boundary: an unhandled promise rejection.
//
// This app fires background storage work and forgets it ON PURPOSE — `void
// saveStep(...)` on every keystroke, `void reportPhase(...)` on progress (see
// stepStore's header). Component fetches, by contrast, are awaited inside
// try/catch. So routing what is left to the app's one operator-visible channel —
// the same storage-trouble bell stepStore already feeds — turns "a background
// task is silently failing" into a thing the creator can see, rather than one
// they discover by closing the tab.
//
// THIS HEADER USED TO ARGUE THE RESIDUAL POPULATION IS "DOMINATED BY those
// fire-and-forget storage writes", and reported every rejection as a failed
// save on the strength of it. The premise is false, and stepStore says so in
// its own words: `saveStep` "never rejects: an ignored `void saveStep(...)`
// must not become an unhandled rejection". Neither does `loadStep`, nor
// `reportPhase`. So the population that actually reaches here is the opposite
// of what the paragraph claimed — a `void fetch(...)` whose network dropped, an
// AbortError, a TypeError thrown in fire-and-forget code — and every one of
// them was announced as "Not saved: the browser refused the operation. a
// background task was not written." A wrong cause and a wrong remedy, voiced
// assertively, interrupting the creator to send them at a quota that is fine.
//
// `reportTaskTrouble` is the honest route: it still recognises the three
// storage kinds a rejection genuinely can be (a real QuotaExceededError
// arriving this way is still a quota), and everything else becomes
// `non-storage`, which the bell reads out with the reason's own message.
//
// It does not preventDefault: the browser's own console logging stays intact.
// The `error` event is deliberately NOT listened to — it also fires for resource
// (img/script) load failures and opaque cross-origin script errors, which would
// only add noise to the bell. Render throws are already covered by error.tsx /
// global-error.tsx; this closes the async gap those cannot see.

import { useEffect } from "react";

import { reportTaskTrouble, type StorageTrouble } from "@/app/_phases/_shared/stepStore";

/** WHERE the routing decision lives, out of the effect so it can be driven.
 *
 *  A listener registered inside `useEffect` is reachable by neither test lane —
 *  the Node probe lane has no `window` to dispatch a `PromiseRejectionEvent` at,
 *  and the live lane's header refuses claims a probe could witness. Extracting
 *  the one line the handler runs makes the SENTENCE A CREATOR HEARS a probeable
 *  property (tests/golden-path/unhandled-rejection-route.probe.spec.ts) instead
 *  of one that could only be read and argued about, which is how the wrong
 *  sentence survived here in the first place. */
export function routeUnhandledRejection(reason: unknown): StorageTrouble {
  return reportTaskTrouble("a background task", reason);
}

export default function GlobalErrorBridge() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      routeUnhandledRejection(e.reason);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return null;
}
