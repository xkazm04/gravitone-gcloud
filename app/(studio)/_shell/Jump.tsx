"use client";

// THE STUDIO'S GLOBAL KEYS, bound once for the session (./Providers.tsx mounts this): ⌘K opens
// Jump, ⌘/ the key sheet for the screen beneath (@gt/ui keymap bindings.ts `studio`, heard after
// the screen declined the press - keymap/route.ts).
//
// Both dialogs are their own chunk, fetched on the first press (the shape of
// ../audio/_audio/Lazy.tsx): every studio page carries this file, and neither dialog is drawn
// until it is asked for. Nothing is held while the chunk arrives: the dialog is small (the Jump
// chunk measured 54 KB unminified on the dev build, 2026-11-09), and a placeholder would flash.
import { lazy, Suspense, useState } from "react";

import { keyContext, useKeys } from "@gt/ui/keymap/dispatch";
import { GLOBAL } from "@gt/ui/keymap/keymap";

const JumpLayer = lazy(() => import("./jump/JumpLayer.tsx"));
const KeySheet = lazy(() => import("@gt/ui/components/jump/KeySheet.tsx").then((m) => ({ default: m.KeySheet })));

type Open = { readonly kind: "jump" } | { readonly kind: "keys"; readonly mode: string | null; readonly facts: ReadonlySet<string> } | null;

export function Jump() {
  const [open, setOpen] = useState<Open>(null);
  const close = (): void => setOpen(null);
  useKeys(GLOBAL, {
    jump: () => setOpen({ kind: "jump" }),
    // The context is read at the press, before the sheet opens over it and becomes the top layer.
    keys: () => setOpen({ kind: "keys", ...keyContext() }),
  });
  if (open === null) return null;
  return (
    <Suspense fallback={null}>
      {open.kind === "jump" ? <JumpLayer onClose={close} /> : <KeySheet mode={open.mode} facts={open.facts} onClose={close} />}
    </Suspense>
  );
}
