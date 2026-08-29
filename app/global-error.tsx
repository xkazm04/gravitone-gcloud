"use client";

// Root error boundary — the last one there is.
//
// `app/error.tsx` catches throws inside the rendered tree, but it renders WITHIN
// the root layout, so a throw in the layout itself (or in a provider it mounts)
// escapes it. `global-error.tsx` is the App Router's boundary for exactly that:
// it REPLACES the root layout, which is why it has to bring its own <html> and
// <body>. For the same reason it depends on nothing from the design system —
// GravitoneTokens may be the thing that failed, so the styling here is inline and
// self-contained rather than reading a --gt-* variable that might never have been
// emitted.
//
// ── IT CANNOT USE THE ANNOUNCER, SO IT CARRIES ITS OWN ALERT ────────────────
//
// app/error.tsx announces through lib/announcer.tsx, whose provider sits above
// it in the shell. This boundary REPLACES that shell, so there is no provider
// above it and no live region anywhere in the document — reaching for
// `useAnnounce()` here would return the silent no-op fallback and look correct
// in review. The dependency-free equivalent is `role="alert"` on the card:
// an alert inserted into the document is announced on insertion, which is what
// mounting this boundary does, and it needs nothing but the platform.
//
// Focus is handed over for the same reason as next door: the tree that held it
// is gone, so without this the user is on <body> in a document whose content
// was replaced.

import { useEffect, useRef } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.error("The app shell failed to render.", error);
    card.current?.focus();
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#080a10",
          color: "#e5e7eb",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div
          ref={card}
          role="alert"
          tabIndex={-1}
          style={{ maxWidth: "28rem", textAlign: "center", outline: "none" }}
        >
          <p
            style={{
              fontSize: "10px",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#fecdd3",
              fontFamily: "ui-monospace, monospace",
            }}
          >
            the app could not start
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 400 }}>
            Gravitone hit an error it could not recover from.
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.6, color: "rgba(229,231,235,0.55)" }}>
            Your saved work is stored in this browser and is not affected. Reload
            to start the app again.
          </p>
          {error.digest && (
            <p style={{ marginTop: "0.75rem", fontSize: "10px", color: "rgba(229,231,235,0.3)", fontFamily: "ui-monospace, monospace" }}>
              ref · {error.digest}
            </p>
          )}
          {/* TWO WAYS OUT, AND THE LABELS ARE THE ACTIONS.
              This was one button that said "Reload" and called `reset()`, under
              copy that says "Reload to start the app again". `reset()` does not
              reload: it re-renders the tree that just threw. This is the ROOT
              boundary, so what threw is the layout or a provider it mounts —
              deterministic on a fresh render more often than not — and the one
              affordance offered was a button that visibly did nothing, twice,
              while naming the recovery it was not performing. app/error.tsx, one
              file over, already offers both and labels each correctly; this is
              that decision applied to the boundary that needs it more. */}
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                borderRadius: "9999px",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#020617",
                background: "linear-gradient(to right, #67e8f9, #a5f3fc)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
            <button
              onClick={() => reset()}
              style={{
                borderRadius: "9999px",
                padding: "0.75rem 1.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "rgba(229,231,235,0.75)",
                background: "transparent",
                border: "1px solid rgba(229,231,235,0.18)",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
