"use client";

// THE STORE IN REACT - one context holding the CanvasStore, and a hook that re-renders a component when the store's
// revision moves. Every surface reads `useCanvas()`; the canvas itself reads the store every frame and never re-renders.

import { createContext, useContext, useSyncExternalStore } from "react";

import type { CanvasStore } from "./store.ts";

export const CanvasContext = createContext<CanvasStore | null>(null);

export function useCanvas(): CanvasStore {
  const st = useContext(CanvasContext);
  if (st === null) throw new Error("useCanvas outside the canvas");
  useSyncExternalStore(st.subscribe, st.snapshot, st.snapshot);
  return st;
}

/** The store without subscribing: for handlers and effects that read it at the moment they run. */
export function useCanvasStore(): CanvasStore {
  const st = useContext(CanvasContext);
  if (st === null) throw new Error("useCanvasStore outside the canvas");
  return st;
}
