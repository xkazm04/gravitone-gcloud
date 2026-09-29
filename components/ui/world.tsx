"use client";

// WHICH WORLD A SUBTREE IS DRAWN IN.
//
// The Almanac world (tokens.ts `WORLD_ALMANAC`) is scoped by `data-world` on a
// route's root, but a scoped CSS variable does not reach a React portal: Modal
// mounts on <body>. A React CONTEXT does cross a portal, so the world is also
// carried here, and the shared parts that used to hard-code the Obsidian palette
// (Button, Modal, Tally, TabRail, StackBar) read it instead of growing a `skin`
// prop at every call site. Outside a <WorldProvider> everything is Obsidian, so a
// surface that has not migrated draws exactly what it drew before.

import { createContext, useContext } from "react";

export type World = "obsidian" | "almanac";

const WorldContext = createContext<World>("obsidian");

export function WorldProvider({ world, children }: { world: World; children: React.ReactNode }) {
  return <WorldContext.Provider value={world}>{children}</WorldContext.Provider>;
}

export function useWorld(): World {
  return useContext(WorldContext);
}
