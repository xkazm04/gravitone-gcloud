"use client";

// A CAP'S TEXT ON THIS PLATFORM. The keymap declares the primary modifier as `⌘` (chord.ts: Ctrl
// on Windows/Linux, ⌘ on macOS - one binding, both presses), and a reference renders the modifier
// the operator's keyboard carries (keyboard-shortcuts: per-platform modifier rendering): ⌘K on a
// Mac, Ctrl+K anywhere else.
//
// The server cannot know the platform, so it renders the cap as declared and the first client
// render agrees with it (useSyncExternalStore's server snapshot is used while hydrating - no
// mismatch); the platform's spelling follows on the next commit. A cap drawn after hydration (the
// key sheet, Jump) reads the platform on its first render.
import { useSyncExternalStore } from "react";

import { platformCap } from "./caps.ts";

let mac: boolean | undefined;
function isMacNow(): boolean {
  if (mac !== undefined) return mac;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  mac = /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
  return mac;
}
// A browser does not change platform while it is open: nothing to subscribe to.
const unchanging = (): (() => void) => () => undefined;
const declared = (): boolean => true;

export function CapText({ cap }: { readonly cap: string }) {
  return <>{platformCap(cap, useSyncExternalStore(unchanging, isMacNow, declared))}</>;
}
