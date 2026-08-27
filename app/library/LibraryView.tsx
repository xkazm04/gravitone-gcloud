"use client";

// /library — the cross-project shelf. Everything a project is BUILT FROM lives
// here, as opposed to the studio's own shelves (app/_library), which hold what
// one project PRODUCED.
//
// Three modules, two of which exist:
//   Styles      visual identities — the gate every project stands behind
//   Assets      reusable source material — the trial grid, and every plate
//               promoted off a style's proof sheet
//   Animations  reusable motion                                 (not yet)
//
// The empty one is named rather than hidden on purpose. This shelf is where
// Step 3 will reach for it, so the slot is part of the map now — and a tab that
// says what is coming is a smaller lie than a surface that pretends the library
// is only ever about styles.

import { useState } from "react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";

import AssetsBrowser from "./AssetsBrowser";
import LibraryAtelier from "./LibraryAtelier";

const MODULES = [
  { id: "styles", label: "Styles", blurb: "Visual identities. A locked one is required before any project." },
  { id: "assets", label: "Assets", blurb: "Reusable source material. Seeded from the trial grid — right-click a tile, or focus one and press Delete, to remove it." },
  { id: "animations", label: "Animations", blurb: "Reusable motion — entrance and ambient registers." },
] as const;

type ModuleId = (typeof MODULES)[number]["id"];

export default function LibraryView() {
  const [module, setModule] = useState<ModuleId>("styles");
  const active = MODULES.find((m) => m.id === module)!;

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it — a restore onto a
          detached node is silent, and focus falls to <body>. See
          components/ui/Modal.tsx#restoreFocus. */}
      <main tabIndex={-1} className="pb-16">
        <header className="pt-6">
          <Eyebrow>library</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Library</h1>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-white/8 pb-3">
            {MODULES.map((m) => (
              <button
                key={m.id}
                onClick={() => setModule(m.id)}
                className={`font-jetbrains rounded-full border px-3.5 py-1.5 text-[12px] transition ${
                  m.id === module
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="font-hanken mt-3 max-w-xl text-sm text-slate-400">{active.blurb}</p>
        </header>

        <section className="mt-6">
          {module === "styles" ? (
            <LibraryAtelier />
          ) : module === "assets" ? (
            // The shelf fills from Styles, so its empty state needs a way back
            // there. The module is this component's state, so the handler is
            // this component's to pass — an empty state that can only describe
            // the next step is half a surface.
            <AssetsBrowser onOpenStyles={() => setModule("styles")} />
          ) : (
            <ComingSoon label={active.label} blurb={active.blurb} />
          )}
        </section>
      </main>
    </StudioFrame>
  );
}

/** An honest placeholder: it says what will live here and that nothing does
 *  yet, rather than showing an empty grid that looks like a loading failure. */
function ComingSoon({ label, blurb }: { label: string; blurb: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <p className="font-instrument text-2xl text-white">{label} is not built yet</p>
      <p className="font-hanken mx-auto mt-2 max-w-sm text-sm leading-snug text-slate-400">{blurb}</p>
      <p className="font-jetbrains mx-auto mt-4 max-w-sm text-[11px] leading-snug text-white/30">
        the slot is here because Step 3 will reach for it — nothing is stored yet
      </p>
    </div>
  );
}
