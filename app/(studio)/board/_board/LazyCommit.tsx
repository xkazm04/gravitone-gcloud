"use client";

// The commit dialogs behind a lazy boundary. A commit is never the first view, so the panel's
// chunk is not first-load JS; it is requested once the desk has painted and the browser is idle,
// so it is already there when the operator presses Commit. The Ghost holds the place only if
// the press comes first.
import { lazy, Suspense, useEffect } from "react";

import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import type { CommitFlow } from "./commitFlow.tsx";

const load = () => import("./CommitLayer.tsx");
const Layer = lazy(load);

/** Warm the chunk after paint; the import is cached, so the lazy boundary resolves at once. */
export function useWarmCommit(): void {
  useEffect(() => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric !== undefined) ric(() => void load());
    else setTimeout(() => void load(), 200);
  }, []);
}

export const LazyCommitLayer = ({ flow }: { readonly flow: CommitFlow }) => (
  <Suspense fallback={<Ghost count={3} label="commit loading" />}>
    <Layer flow={flow} />
  </Suspense>
);
