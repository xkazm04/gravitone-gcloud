"use client";

// THE MASTHEAD (direction "sleeve"): the release's identity as the front of the record - the sleeve large, the title in
// the display serif, the artist, the figures (kind, tracks, length) as chips, the state, and the catalogue line. While
// the sleeve side is open the sleeve travels there (a shared layoutId) and leaves its pocket behind.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import type { Release } from "@gt/domain/release";

import { STATUS_ENTRY } from "../../../../../_release/wizard/status.ts";
import { SleeveFace, SleevePocket } from "./Art.tsx";
import { catalogueOf, kindOf, lengthOf, phonogramOf } from "./liner.ts";
import { Printed, WriteIn } from "./Print.tsx";
import f from "./frame.module.css";

export const SLEEVE_LAYOUT = "liner-sleeve";

export function Masthead({ release: r, saving, sleeveOut, onLeave }: { readonly release: Release; readonly saving: boolean; readonly sleeveOut: boolean; readonly onLeave: () => void }) {
  const n = r.tracks.length;
  return (
    <header className={f.masthead}>
      {sleeveOut ? <SleevePocket /> : <SleeveFace release={r} width={420} layoutId={SLEEVE_LAYOUT} />}
      <div className={f.ident}>
        <h2 className={f.title}>
          {r.title.trim() === "" ? <WriteIn what="title" /> : <Printed text={r.title} strong />}
          {r.version !== null && <span className={f.version}>({r.version})</span>}
        </h2>
        <span className={f.artist}>{r.artist.trim() === "" ? <WriteIn what="artist" /> : r.artist}</span>
        <span className={f.figures}>
          <Chip label={kindOf(r)} casing="lower" />
          <Chip label={n === 1 ? "track" : "tracks"} value={n} casing="lower" />
          <Chip label={lengthOf(r)} casing="lower" />
          <EntryPill entry={STATUS_ENTRY[r.status]} />
          {saving && <Chip label="saving" tone="cyan" dot />}
        </span>
        <span className={f.catalogue}>{catalogueOf(r)}</span>
        <span className={f.catalogue}>{phonogramOf(r)}</span>
      </div>
      <span className={f.leave}>
        <Button label="All releases" size="sm" onPress={onLeave} />
      </span>
    </header>
  );
}
