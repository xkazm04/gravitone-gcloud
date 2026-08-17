"use client";

// Route-segment error boundary.
//
// Until this file existed there was NO React error boundary anywhere in the tree
// (grep for ErrorBoundary/componentDidCatch/getDerivedStateFromError/error.tsx
// returned nothing). React unwinds a render-time throw to the nearest boundary,
// and with none present the whole <StudioView> came down — the default Next
// overlay in dev, a blank document in production. The data layer is unusually
// throw-safe (every IndexedDB path in stepStore/studioDb classifies and reports
// rather than throwing into render), so the reachable surface for this is small,
// but small is not none, and the App Router closes it with one file.
//
// It renders a calm recovery card in the studio's own dark idiom and offers the
// two honest next steps: retry this segment (React re-mounts it via `reset`), or
// reload. The error is also sent to the console so a caught render throw reaches
// a door instead of vanishing.

import { useEffect } from "react";

import { Button } from "@/components/ui/Primitives";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // A door: the render throw reaches the console rather than only the overlay.
    console.error("A screen failed to render.", error);
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
        <p className="font-jetbrains text-[10px] tracking-[0.16em] text-rose-200 uppercase">
          something broke
        </p>
        <h1 className="font-instrument mt-3 text-2xl text-white">
          This screen failed to render.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          The rest of the studio is unaffected — your saved work is on disk. Try
          this screen again, or reload the app.
        </p>
        {error.digest && (
          <p className="font-jetbrains mt-3 truncate text-[10px] text-white/30">
            ref · {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="ghost" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}
