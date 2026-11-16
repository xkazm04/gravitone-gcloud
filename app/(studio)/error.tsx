"use client";

// A section that failed to render, inside the shell (Next's error.js for the `(studio)` group: it
// wraps every section below the layout, so the header, its keys and its Jump dialog survive).
// Before this file a render failure anywhere in the studio unwound to app/error.tsx, which replaced
// the whole app with v1's card. app/error.tsx and global-error.tsx stay as they are: a throw in
// the studio's own layout (the header) still reaches them.
//
// The error's own message, in full, through ErrorLine - a real error explains itself. In a
// production build Next replaces a Server Component's message with a generic one and keeps the
// `digest` that matches the server log, so the digest is drawn beside it.
//
// `retry` (stable since Next 16.3) re-fetches and re-renders the segment; `reset` only re-renders
// it, which cannot clear a failed server read.
//
// Focus moves to the region, as app/error.tsx does: the subtree that held it is gone.
import { useEffect, useRef } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import p from "./_shell/frames/frames.module.css";

export default function StudioError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
  useEffect(() => {
    // A door: the throw reaches the console as well as the screen.
    console.error(error);
    box.current?.focus();
  }, [error]);
  return (
    <div ref={box} className={p.failed} tabIndex={-1} data-state="failed">
      <ErrorLine message={message} live />
      {digest !== undefined && <Chip label="digest" value={digest} casing="lower" />}
      <Button label="retry" tone="cyan" onPress={retry} />
    </div>
  );
}
