"use client";

// The packaging stage behind a lazy boundary (spark studio-to-release): the studio is /audio's default section and
// already in its first-load chunk, so the release's steps load only when the URL names package or release.
import { lazy, Suspense, type ComponentProps } from "react";

import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import type { Packaging as PackagingT } from "./Packaging.tsx";

const PackagingIsland = lazy(() => import("./Packaging.tsx").then((m) => ({ default: m.Packaging })));

export const LazyPackaging = (p: ComponentProps<typeof PackagingT>) => (
  <Suspense fallback={<Ghost count={3} label="release loading" />}>
    <PackagingIsland {...p} />
  </Suspense>
);
