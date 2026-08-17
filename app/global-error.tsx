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

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("The app shell failed to render.", error);
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
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
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
          <button
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
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
        </div>
      </body>
    </html>
  );
}
