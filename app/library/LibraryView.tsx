"use client";

// /library — theme onboarding. A locked style is the prerequisite every
// project stands behind, so this page is where a look is commissioned,
// proofed and locked.
//
// Prototype round 1 ran two shelves behind a switcher: Atelier (a wall of
// commissioned looks, worked through a dossier) and Specimen (a foundry book
// of full-width sheets). Atelier won and Specimen is gone — the wall puts the
// commission rail, the looks and the lock verdict on one screen, where the
// book spent its width restating the spec per sheet.

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";

import LibraryAtelier from "./LibraryAtelier";

export default function LibraryView() {
  return (
    <StudioFrame>
      <main className="pb-16">
        <header className="pt-6">
          <Eyebrow>library</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Styles</h1>
          <p className="font-hanken mt-2 max-w-xl text-sm text-slate-400">
            Every project starts from a locked style — a look you commissioned, proofed and approved.
            Nothing renders in a project until one exists here.
          </p>
        </header>

        <section className="mt-6">
          <LibraryAtelier />
        </section>
      </main>
    </StudioFrame>
  );
}
