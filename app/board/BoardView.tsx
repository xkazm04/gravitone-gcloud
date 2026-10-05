"use client";

// /board — every human gate in the app, decided in one vocabulary.
//
// Three directional prototypes behind `?v=` (components/ui/VariantSwitch.tsx),
// one state (./useBoard.ts), one keymap (lib/board/keys.ts), one loupe:
//   1 Triage desk    source rail with art · queue of rich cards · the stage
//   2 Spotlight      one item lit by its own picture, a dock, a filmstrip
//   3 Contact sheet  numbered frames by run, batch select, batch decide
//
// Drawn in the app's own idiom over StudioFrame's aurora — the idiom of
// /projects and /library — and NOT under the kit's WorldRoot, whose opaque
// ink slab and Almanac print parts made round 1 read as wireframes
// (.vault/Spark/briefs/platform-consolidation/10-r2-ui-pass.md). No page
// title on screen: the nav names the place.

import { useState } from "react";

import { useVariant, VariantSwitch } from "@/components/ui/VariantSwitch";

import DeskVariant from "./DeskVariant";
import { Loupe } from "./Loupe";
import { BoardToasts } from "./parts";
import SheetVariant from "./SheetVariant";
import type { VariantProps } from "./shared";
import SpotlightVariant from "./SpotlightVariant";
import { useBoard } from "./useBoard";

export default function BoardView() {
  const api = useBoard();
  const [v] = useVariant();
  const [loupe, setLoupe] = useState(false);
  const props: VariantProps = { api, openLoupe: () => setLoupe(true), loupeOpen: loupe, closeLoupe: () => setLoupe(false) };

  return (
    <>
      <main tabIndex={-1} className="pt-2 pb-20 outline-none">
        <h1 className="sr-only">Board</h1>
        {v === 1 ? <DeskVariant {...props} /> : v === 2 ? <SpotlightVariant {...props} /> : <SheetVariant {...props} />}
      </main>
      {loupe && <Loupe api={api} entry={api.selected} onClose={() => setLoupe(false)} />}
      <BoardToasts api={api} />
      <VariantSwitch labels={["Triage desk", "Spotlight", "Contact sheet"]} />
    </>
  );
}
