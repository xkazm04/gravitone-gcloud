"use client";

// THE CARD ELEMENTS — built once per change of what they depend on, and not once
// per frame of anything.
//
// This memo is the engine's whole bet on React: while a drag moves over cells,
// or the status is read, or a callout is drawn, none of these inputs change, the
// SAME element objects come back, and React skips the entire subtree without
// comparing a single card's props. A pan does not appear in the dependency list
// at all — the container owns the transform.
//
// WHAT A CARD RECEIVES is world coordinates and booleans. Never the camera,
// never a callback: the pointer handlers are delegated (./usePointerVerbs), so a
// card that re-renders re-binds nothing.

import { useMemo } from "react";

import { Card } from "./Card";
import type { Layout, Placed } from "./geometry";
import type { PipelineSkin } from "./types";

/** The DOM id of a card, which `aria-activedescendant` has to be able to quote.
 *  The scheme lives with the thing that writes it. */
export const domIdOf = (uid: string, id: string) => `${uid}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

export function useCards({
  mounted,
  layout,
  selected,
  active,
  away,
  pending,
  flagged,
  glide,
  enters,
  posLabel,
  skin,
  uid,
}: {
  mounted: readonly Placed[];
  layout: Layout;
  selected: ReadonlySet<string>;
  active: string | null;
  away: ReadonlySet<string>;
  pending: ReadonlySet<string>;
  flagged: ReadonlySet<string>;
  glide: boolean;
  enters: Map<string, number> | null;
  posLabel: string | null;
  skin: PipelineSkin;
  uid: string;
}) {
  return useMemo(
    () =>
      mounted.map((p) => {
        const entry = layout.entryOf.get(p.id);
        if (!entry) return null;
        return (
          <Card
            key={p.id}
            entry={entry}
            x={p.x}
            y={p.y}
            lane={layout.lanes[p.lane].label}
            selected={selected.has(p.id)}
            active={active === p.id}
            away={away.has(p.id)}
            busy={pending.has(p.id)}
            flagged={flagged.has(p.id)}
            glide={glide}
            enter={enters?.get(p.id) ?? null}
            pos={active === p.id ? posLabel : null}
            skin={skin}
            domId={domIdOf(uid, p.id)}
          />
        );
      }),
    [mounted, layout, selected, active, away, pending, flagged, glide, enters, posLabel, skin, uid],
  );
}
