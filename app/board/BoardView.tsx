"use client";

// /board — every human gate in the app, decided in one vocabulary: one state
// (./useBoard.ts), one keymap (lib/board/keys.ts), one loupe, drawn as a
// contact sheet (./ContactSheet.tsx) — numbered frames by run, batch select,
// batch decide.
//
// The sheet is the round-2 winner of three directional prototypes (a triage
// desk and a spotlight were the other two; the operator's pick, 2026-10-05,
// .vault/Spark/briefs/platform-consolidation/). Drawn in the app's own idiom
// over StudioFrame's aurora — the idiom of /projects and /library — and NOT
// under the kit's WorldRoot, whose opaque ink slab and Almanac print parts made
// round 1 read as wireframes (10-r2-ui-pass.md). No page title on screen: the
// nav names the place.

import { useState } from "react";

import ContactSheet from "./ContactSheet";
import { Loupe } from "./Loupe";
import { BoardToasts } from "./parts";
import { useBoard } from "./useBoard";

export default function BoardView() {
  const api = useBoard();
  const [loupe, setLoupe] = useState(false);

  return (
    <>
      <main tabIndex={-1} className="pt-2 pb-20 outline-none">
        <h1 className="sr-only">Board</h1>
        <ContactSheet api={api} openLoupe={() => setLoupe(true)} loupeOpen={loupe} closeLoupe={() => setLoupe(false)} />
      </main>
      {loupe && <Loupe api={api} entry={api.selected} onClose={() => setLoupe(false)} />}
      <BoardToasts api={api} />
    </>
  );
}
