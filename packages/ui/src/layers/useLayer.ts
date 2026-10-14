"use client";

// BE ON THE LAYER STACK WHILE OPEN - the only door a sheet, dialog, popover or zoom
// uses (v1 `useLayer`, components/ui/layers.ts).
//
// Options are latched through a ref and read at event time, so an inline onClose
// (every consumer passes one) does not re-push the layer on each render - the v1
// Modal lock effect learned that the hard way.
//
// FOCUS RETURN has exactly one exit: the effect cleanup. A layer closes either by
// its flag flipping or by its owner unmounting (the Board sheet's route changing);
// React runs this cleanup on both, so both branches restore focus exactly once,
// which a restore wired to the flag alone silently misses (focus-and-scroll-
// containment). The opener is captured when the layer opens.
//
// Navigation is the reaper: a layer is a component, a route change unmounts it, the
// cleanup removes its entry. Nothing has to remember to clear the stack on route
// change.
//
// Not verifiable in node (no DOM is installed for Vitest): the wave-2 shell drives
// this hook live. Its decisions - push/remove, policy, focus target - are the pure
// functions in stack.ts and containment.ts, which are tested.

import { useEffect, useId, useRef, type RefObject } from "react";

import { focusAfterClose } from "./containment.ts";
import { pushLayer } from "./live.ts";
import { POLICY, type DismissReason, type LayerKind } from "./stack.ts";
import { ensureDispatcher } from "../keymap/dispatch.ts";

export type UseLayerOptions = {
  readonly kind: LayerKind;
  /** The keymap mode this layer's keys resolve in while it is on top. */
  readonly mode?: string;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly anchorRef?: RefObject<HTMLElement | null>;
  /** The layer's close: flip the flag that owns it, or navigate back for a URL layer. */
  readonly onClose: (reason: DismissReason) => void;
  /** Read at key time; a /kit specimen seeded open answers false until it is toggled. */
  readonly claimsKeys?: () => boolean;
  /** Where focus lands when the opener is gone by close time (the list, the section). */
  readonly landmark?: () => HTMLElement | null;
};

const within = (r: RefObject<HTMLElement | null> | undefined, n: unknown): boolean =>
  r?.current != null && n instanceof Node && r.current.contains(n);

export function useLayer(open: boolean, opts: UseLayerOptions): void {
  const id = useId();
  const ref = useRef(opts);
  useEffect(() => {
    ref.current = opts;
  });
  const { kind, mode } = opts;
  useEffect(() => {
    if (!open) return;
    ensureDispatcher();
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const remove = pushLayer({
      id,
      kind,
      ...(mode !== undefined ? { mode } : {}),
      close: (reason) => ref.current.onClose(reason),
      contains: (n) => within(ref.current.panelRef, n),
      anchorContains: (n) => within(ref.current.anchorRef, n),
      claimsKeys: () => ref.current.claimsKeys?.() ?? POLICY[kind].claimsKeys,
    });
    return () => {
      remove();
      focusAfterClose(opener, ref.current.landmark?.() ?? null)?.focus({ preventScroll: true });
    };
  }, [open, id, kind, mode]);
}
