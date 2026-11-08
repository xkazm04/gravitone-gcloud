"use client";

// PROTOTYPE VARIANT v1 of the cover desk: CONSOLE (TODO(prototype, 2026-11-08): consolidate the cover desk switcher).
// A mixing console's channel strip: everything at hand, nothing decorative. The covers so far are the rack on the
// left (./History.tsx), grouped by where they stand; the cover in hand is a column of strips (./Console.tsx), the
// step the work stands at open and every other step folded to one line of its facts. Dense mono labels, values
// right-aligned, state as marks. Handed exactly what the baseline is handed (../Layouts.tsx DeskProps).
//
// Differs from the baseline: the history is a grouped rack, not a row of chips; a finished step keeps a line of its
// facts instead of its whole body; the takes are one line each and answer the keyboard.
import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import type { DeskProps } from "../Layouts.tsx";
import { SourceDrop } from "../Source.tsx";
import { Console } from "./Console.tsx";
import { History } from "./History.tsx";
import c from "./console.module.css";

export function DeskV1({ desk, view }: DeskProps) {
  if (view === null) return null;
  const current = view.current;
  return (
    <div className={c.desk}>
      {view.covers.length > 0 && <History desk={desk} view={view} />}
      <div className={c.main}>
        {current === undefined ? (
          <>
            {view.covers.length === 0 && <Empty label="no covers yet" />}
            <SourceDrop desk={desk} />
          </>
        ) : (
          <Console key={current.record.id} card={current} desk={desk} />
        )}
      </div>
    </div>
  );
}
