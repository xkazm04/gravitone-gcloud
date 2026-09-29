"use client";

// THE ROOT OF THE ALMANAC WORLD. One per route.
//
// Declares `data-world="almanac"` (so tokens.ts's `--al-*` resolve), supplies the
// world to the shared parts through context (components/ui/world.tsx — that is
// what re-skins Button, Tally, TabRail, StackBar, Hint and the portalled Modal),
// and lays the night sky behind everything.

import { WorldProvider } from "@/components/ui/world";

import "./kit.css";
import "./workbench.css";
import { Sky } from "./Sky";

export function WorldRoot({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <WorldProvider world="almanac">
      <div data-world="almanac" className={`k-world ${className}`}>
        <Sky />
        {children}
      </div>
    </WorldProvider>
  );
}
