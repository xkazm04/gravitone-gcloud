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
//
// ── AND IT SAYS SO OUT LOUD, BECAUSE A CARD IS NOT AN ANNOUNCEMENT ──────────
//
// The two things a render failure does to a screen-reader user were both
// silent. React unmounts the subtree that threw, so whatever held focus is
// destroyed and focus falls to <body> — the same defect the studio's dialogs
// and its project rows already hand off for. And the replacement card is
// ordinary text: nothing marks it as news, so a reader that was mid-sentence
// somewhere else simply never learns the screen is gone.
//
// So the boundary does both. It ANNOUNCES through the app's one announcement
// channel (lib/announcer.tsx — its provider sits above this boundary in the
// shell, because this file renders WITHIN the root layout), assertively,
// because a screen that no longer exists blocks what the user is doing right
// now and hearing it after the current sentence is too late to act on. And it
// hands FOCUS to the card, so the next Tab is "Try again" rather than a crawl
// from the top of a document whose content is gone.
//
// The key is the error's own identity, not the render's: a boundary that
// re-renders while showing the same failure must not speak twice, and a
// DIFFERENT failure must not be silenced by the first one's key.
//
// app/global-error.tsx cannot do the first half — it REPLACES the root layout,
// so the announcer's provider is not above it — and carries `role="alert"`
// instead. See the note there.

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/Primitives";
import { useAnnounce } from "@/lib/announcer";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const announce = useAnnounce();
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A door: the render throw reaches the console rather than only the overlay.
    console.error("A screen failed to render.", error);
    announce({
      key: `boundary:${error.digest ?? error.message}`,
      text: "This screen failed to render. Your saved work is unaffected. Try this screen again, or reload the app.",
      assertive: true,
    });
    // The subtree that held focus is gone, so focus is on <body> and the reader
    // is nowhere. Put it on the card that replaced it.
    card.current?.focus();
  }, [error, announce]);

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div
        ref={card}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-xl outline-none"
      >
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
