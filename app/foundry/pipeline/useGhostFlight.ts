"use client";

// THE GHOST — the one element that travels, and the springs that carry it.
//
// WHAT TRAVELS IS NOT THE CARD. The card stays where the layout put it, drawn
// `away`; the ghost is a single element following two spring values. That is why
// dragging a selection of thirty costs the same as dragging one, and why a drop
// can be ANIMATED to a verdict that has not arrived yet without the board
// committing to it.
//
//   `gx/gy`  the raw target, set by the pointer or by a slot
//   `sx/sy`  the springs that chase it — what is actually drawn
//   `cx/cy`  the callout, in SCREEN space, following the pointer directly
//
// `settle` resolves when the spring has arrived, with a 700ms escape hatch: a
// spring that is interrupted or never quite converges must not leave a promise
// nobody resolves, because `decide` awaits it before submitting.
//
// `goHome` is the refusal's animation, and the word for it is RETURNED rather
// than glitched: the ghost travels back on the same spring it left on and the
// home slot lights up, so a card that was not allowed to move is seen to come
// back rather than to vanish and reappear.

import { useState } from "react";

import { useMotionValue, useSpring } from "motion/react";

import type { Flight, Live } from "./canvasTypes";
import { cardPos } from "./geometry";

export interface Ghost {
  gx: ReturnType<typeof useMotionValue<number>>;
  gy: ReturnType<typeof useMotionValue<number>>;
  sx: ReturnType<typeof useSpring>;
  sy: ReturnType<typeof useSpring>;
  cx: ReturnType<typeof useMotionValue<number>>;
  cy: ReturnType<typeof useMotionValue<number>>;
}

export interface GhostFlight {
  ghost: Ghost;
  flight: Flight | null;
  setFlight: React.Dispatch<React.SetStateAction<Flight | null>>;
  /** Put the ghost on a slot; resolves when it has arrived (or given up). */
  settle(tx: number, ty: number): Promise<void>;
  goHome(f: { ids: string[]; lead: string }): Promise<void>;
  /** The landing is accepted: hold the "done" frame, then drop the ghost. */
  landDone(): void;
}

export function useGhostFlight({ liveRef, deadRef, calm }: { liveRef: React.RefObject<Live | null>; deadRef: React.RefObject<boolean>; calm: boolean }): GhostFlight {
  const [flight, setFlight] = useState<Flight | null>(null);

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const sx = useSpring(gx, { stiffness: 520, damping: 42, mass: 0.7 });
  const sy = useSpring(gy, { stiffness: 520, damping: 42, mass: 0.7 });
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);

  const settle = (tx: number, ty: number): Promise<void> => {
    gx.set(tx);
    gy.set(ty);
    if (calm) {
      sx.jump(tx);
      sy.jump(ty);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const t0 = performance.now();
      const poll = () => {
        if (deadRef.current || performance.now() - t0 > 700 || (Math.abs(sx.get() - tx) < 0.6 && Math.abs(sy.get() - ty) < 0.6)) return resolve();
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  };

  const goHome = async (f: { ids: string[]; lead: string }) => {
    const L = liveRef.current!;
    const home = cardPos(L.layout, f.lead);
    if (!home) {
      setFlight(null);
      return;
    }
    setFlight({ ids: f.ids, lead: f.lead, phase: "back", kind: "none" });
    await settle(home.x, home.y);
    if (!deadRef.current) setFlight(null);
  };

  const landDone = () => {
    setFlight((f) => (f ? { ...f, phase: "done" } : f));
    window.setTimeout(() => !deadRef.current && setFlight(null), calm ? 0 : 200);
  };

  return { ghost: { gx, gy, sx, sy, cx, cy }, flight, setFlight, settle, goHome, landDone };
}
