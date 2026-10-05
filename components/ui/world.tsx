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
// "obsidian" is also the DEFAULT, so the world alone cannot tell a route that
// opted into WorldRoot world="obsidian" (the kit drawn in Obsidian's palette)
// from one that never set a world. This can: true only under a WorldProvider.
const ScopedContext = createContext(false);

export function WorldProvider({ world, children }: { world: World; children: React.ReactNode }) {
  return (
    <WorldContext.Provider value={world}>
      <ScopedContext.Provider value={true}>{children}</ScopedContext.Provider>
    </WorldContext.Provider>
  );
}

export function useWorld(): World {
  return useContext(WorldContext);
}

/** Whether this subtree sits inside an explicit WorldProvider. */
export function useWorldScoped(): boolean {
  return useContext(ScopedContext);
}

/** The `data-world` a portal root must re-declare: the world it was opened in
 *  when that world was declared, none on a route that never set one. kit.css
 *  scopes every rule under `[data-world]` and names "the root of a portalled
 *  Modal" as part of that scope; a portal mounts on <body>, outside the route's
 *  attribute, so without this a kit part inside an Obsidian-kit dialog drew
 *  unstyled. (Moonshot backlog Q8, 2026-10-05.) */
export function portalWorld(world: World, scoped: boolean): World | undefined {
  return scoped ? world : undefined;
}
