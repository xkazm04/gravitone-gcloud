"use client";

// /library — theme onboarding. A locked style is the prerequisite every
// project stands behind, so this page is where a look is commissioned,
// proofed and locked.
//
// PROTOTYPE SWITCHER (throwaway — consolidation deletes it): two directional
// variants of the same nouns. Atelier walks a wall; Specimen reads a book.

import { useState } from "react";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";

import LibraryAtelier from "./LibraryAtelier";
import LibrarySpecimen from "./LibrarySpecimen";

const VARIANTS = [
  { id: "atelier", label: "Atelier", line: "a wall of commissioned looks — pick one up, work its dossier" },
  { id: "specimen", label: "Specimen", line: "a foundry book — full-width sheets with spec, plates and provenance" },
] as const;

type VariantId = (typeof VARIANTS)[number]["id"];

export default function LibraryView() {
  const [variant, setVariant] = useState<VariantId>("atelier");

  return (
    <StudioFrame>
      <main className="pb-16">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-6">
          <div>
            <Eyebrow>library</Eyebrow>
            <h1 className="font-instrument mt-3 text-4xl text-white">Styles</h1>
            <p className="font-hanken mt-2 max-w-xl text-sm text-slate-400">
              Every project starts from a locked style — a look you commissioned, proofed and approved.
              Nothing renders in a project until one exists here.
            </p>
          </div>
          <div className="font-jetbrains flex gap-2 text-[12px]">
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                onClick={() => setVariant(v.id)}
                title={v.line}
                className={`rounded-full border px-3 py-1.5 transition ${
                  v.id === variant
                    ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                    : "border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </header>

        <section className="mt-6">{variant === "atelier" ? <LibraryAtelier /> : <LibrarySpecimen />}</section>
      </main>
    </StudioFrame>
  );
}
