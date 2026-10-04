"use client";

// THE ROOT OF A KIT WORLD. One per route.
//
// Declares `data-world={world}` (so tokens.ts's `--al-*` resolve — WORLD_ALMANAC
// for "almanac", WORLD_OBSIDIAN_KIT for "obsidian", both under the same variable
// names, see kit.css's own header), supplies the world to the shared parts
// through context (components/ui/world.tsx — that is what re-skins Button, Tally,
// TabRail, StackBar, Hint and the portalled Modal), and — Almanac only — lays the
// night sky behind everything. `world` defaults to "almanac" so every existing
// caller (the landing page's kinship, /kit, the five-world StudioFrame branch)
// keeps its exact current behaviour with no call-site change.
//
// Obsidian gets no sky: Foundry's "legacy palette" revert (2026-10-04) has no
// starfield to recreate, so `.k-world`'s `background: var(--al-sky) fixed`
// resolves to a flat ink instead (WORLD_OBSIDIAN_KIT's own `--al-sky`) and `<Sky/>`
// — an Almanac-specific canvas element — simply never mounts for that world.

import { WorldProvider, type World } from "@/components/ui/world";

import "./kit.css";
import "./workbench.css";
import { Sky } from "./Sky";

export function WorldRoot({
  children,
  className = "",
  world = "almanac",
}: {
  children: React.ReactNode;
  className?: string;
  world?: World;
}) {
  return (
    <WorldProvider world={world}>
      <div data-world={world} className={`k-world ${className}`}>
        {world === "almanac" && <Sky />}
        {children}
      </div>
    </WorldProvider>
  );
}
