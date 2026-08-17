"use client";

// Last-resort reporter for a failure that reaches neither a try/catch nor a
// React error boundary: an unhandled promise rejection.
//
// This app fires background storage work and forgets it ON PURPOSE — `void
// saveStep(...)` on every keystroke, `void reportPhase(...)` on progress (see
// stepStore's header). Component fetches, by contrast, are awaited inside
// try/catch. So the residual population of TRULY unhandled rejections is
// dominated by those fire-and-forget storage writes, and routing them to the
// app's one operator-visible channel — the same storage-trouble bell stepStore
// already feeds — turns "a save is silently failing" into a thing the creator
// can see, rather than one they discover by closing the tab.
//
// It does not preventDefault: the browser's own console logging stays intact.
// The `error` event is deliberately NOT listened to — it also fires for resource
// (img/script) load failures and opaque cross-origin script errors, which would
// only add noise to the bell. Render throws are already covered by error.tsx /
// global-error.tsx; this closes the async gap those cannot see.

import { useEffect } from "react";

import { reportStorageTrouble } from "@/app/_phases/_shared/stepStore";

export default function GlobalErrorBridge() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      reportStorageTrouble("write", "app", "a background task", e.reason);
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return null;
}
