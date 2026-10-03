"use client";

// THE AUDIO WORKBENCH — the Library's audio module (ModuleId "audio").
//
// Page-local world state, by design (see .vault/Spark/ideas/
// library-audio-workbench-port.md, "Theme switcher scope"): this page lifts its
// own `world` rather than reaching for a global provider, because nothing else
// in the app needs a switcher yet and a bigger architectural change has no
// second consumer to justify it. `StudioFrame` (the shell this page renders
// inside) keeps its own hardcoded world untouched — this component's
// `WorldProvider` only reaches the signal components THIS page mounts below
// its own header strip.
//
// This is WP1's shell only: VocabSpine, Ledger and Inspector land in WP2/WP3.

import { useState } from "react";

import { WorldProvider, useWorld, type World } from "@/components/ui/world";

function WorldSwitch({ onChange }: { onChange: (w: World) => void }) {
  const active = useWorld();
  return (
    <div role="group" aria-label="world" className="flex gap-2">
      {(["obsidian", "almanac"] as const).map((w) => (
        <button
          key={w}
          type="button"
          aria-pressed={active === w}
          onClick={() => onChange(w)}
          className="rounded border border-white/20 px-2 py-1 text-xs capitalize"
          style={active === w ? { background: "var(--gt-accent, #8884)" } : undefined}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

export default function AudioWorkbench() {
  const [world, setWorld] = useState<World>("obsidian");

  return (
    <WorldProvider world={world}>
      <div>
        <header className="flex items-center justify-between pb-4">
          <h2 className="sr-only">Audio</h2>
          <WorldSwitch onChange={setWorld} />
        </header>
        <div>Audio Workbench — WP2/WP3 pending</div>
      </div>
    </WorldProvider>
  );
}
