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
// its own header strip. The root also carries `data-world` itself (not just
// context) when the switcher picks Almanac, because `kit/Table`'s colour comes
// from `--al-*` custom properties that only resolve under that attribute
// (components/ui/tokens.ts) — context alone re-skins the shared Primitives/
// signal components, not a raw CSS variable read.
//
// WP2 landed VocabSpine (left) and Ledger (center), wired to the real
// `lib/assets.ts` shelf. WP3 lands the right column (Inspector: Take+Recipe)
// and the Ledger's row expansion (TakeExpansion: Variations+Composer+Drafts),
// plus the one write path both of them need (`patchMeta` below).

import { useCallback, useEffect, useState } from "react";

import { listAssets, updateAssetMeta, type Asset, type AudioMeta } from "@/lib/assets";
import { useAuth } from "@/lib/useAuth";
import { WorldProvider, useWorld, type World } from "@/components/ui/world";

import Inspector from "./Inspector";
import Ledger, { type AudioAsset } from "./Ledger";
import TakeExpansion from "./TakeExpansion";
import VocabSpine from "./VocabSpine";

import "./audio-workbench.css";

const isAudioAsset = (a: Asset): a is AudioAsset => a.kind === "audio";

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
          className="rounded border border-white/20 px-2 py-1 text-label capitalize"
          style={active === w ? { background: "color-mix(in srgb, var(--gt-accent-cyan) 20%, transparent)" } : undefined}
        >
          {w}
        </button>
      ))}
    </div>
  );
}

export default function AudioWorkbench({ onCount }: { onCount?: (n: number) => void }) {
  const [world, setWorld] = useState<World>("obsidian");
  const { user } = useAuth();
  const [assets, setAssets] = useState<AudioAsset[]>([]);

  // The single expanded Ledger row, lifted HERE rather than kept inside
  // <Ledger>: <Inspector/> needs to know which take's Take+Recipe to show, and
  // the Ledger's own accordion selection is the only "current row" concept
  // this page has. One piece of state feeding both the inline expansion and
  // the right panel, rather than a second "selected" state that could drift
  // from the first.
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;
    let cancelled = false;
    listAssets(uid).then((rows) => {
      if (cancelled) return;
      const audio = rows.filter(isAudioAsset);
      setAssets(audio);
      onCount?.(audio.length);
    });
    return () => {
      cancelled = true;
    };
    // `onCount` in deps, same as LibraryAtelier's `onCounts` (LibraryAtelier.tsx
    // :118): LibraryView passes a fresh closure most renders, so this re-runs
    // more than strictly necessary, but each run's `setCounts` call is a
    // no-op once the count has not changed (LibraryView.tsx's own equality
    // check), which is what makes re-fetching idempotent rather than unsafe.
  }, [user?.uid, onCount]);

  // WP3's one write path: `lib/assets.ts#updateAssetMeta` persists the patch,
  // then the local `assets` snapshot is updated optimistically so the Ledger
  // and the Inspector read the same post-write state without a refetch — two
  // components reading `assets.find(...)` and `assets` itself must never
  // disagree about a take's verdict. `Ledger.tsx` reported no existing write
  // path (WP2 was a read-only pass over the shelf); this is that gap closed,
  // not a silent one left for the Director (see the WP3 report).
  const patchMeta = useCallback((id: string, patch: Partial<AudioMeta>) => {
    void updateAssetMeta(id, patch as Record<string, unknown>);
    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, meta: { ...(a.meta ?? {}), ...patch } } : a)),
    );
  }, []);

  return (
    <WorldProvider world={world}>
      <div className="aw" data-world={world === "almanac" ? "almanac" : undefined}>
        <header className="flex items-center justify-between pb-4">
          <h2 className="sr-only">Audio</h2>
          <WorldSwitch onChange={setWorld} />
        </header>
        <div className="aw__cols">
          <div className="aw__col">
            <VocabSpine assets={assets} />
          </div>
          <div className="aw__col">
            <Ledger
              assets={assets}
              expandedId={expandedId}
              onExpand={(id) => setExpandedId(id ?? undefined)}
              renderExpansion={(row) => <TakeExpansion asset={row} />}
            />
          </div>
          <div className="aw__col">
            <Inspector asset={assets.find((a) => a.id === expandedId) ?? null} onPatchMeta={patchMeta} />
          </div>
        </div>
      </div>
    </WorldProvider>
  );
}
