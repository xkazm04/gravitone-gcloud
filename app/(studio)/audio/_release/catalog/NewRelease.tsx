"use client";

// A NEW RELEASE FROM THE SHELF (spark studio-to-release WP1): kept takes picked in shelf order (the release's track
// order), then started. The kind and length the pick makes ride on the button.
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { releaseKind, type ShelfTake } from "@gt/domain/release";

import { clock, KIND_LABEL } from "../wizard/fmt.ts";
import { Shelf } from "../wizard/Shelf.tsx";
import s from "./catalog.module.css";

export function NewRelease({ shelf, fixture, onStart }: { readonly shelf: readonly ShelfTake[]; readonly fixture: boolean; readonly onStart: (takes: readonly ShelfTake[]) => void }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const takes = shelf.filter((t) => picked.has(t.takeId));
  const total = takes.reduce((a, t) => a + t.durationS, 0);
  return (
    <section className={s.shelf} aria-label="new release from the shelf">
      <div className={s.startBar}>
        <Button
          label="Start release"
          tone="emerald"
          disabled={takes.length === 0}
          badge={takes.length === 0 ? undefined : { label: KIND_LABEL[releaseKind(takes)], value: `${takes.length} · ${clock(total)}`, tone: "emerald" }}
          onPress={() => onStart(takes)}
        />
        {picked.size > 0 && <Button label="Clear" size="sm" onPress={() => setPicked(new Set())} />}
      </div>
      <Shelf takes={shelf} label="shelf" mode={{ kind: "pick", picked, onToggle: toggle }} importing={{ fixture }} />
    </section>
  );
}
