"use client";

// THE DETAIL SHEET - the right-hand sheet that walks into the selected place: one view per kind of place (a lot, a
// town, a river, a province, a basin, a port, a moored episode, a station, the Songs lane). While it is open it
// covers st.ui.inset.r of the map (measured), so the camera centres on what is left; opening one closes a desk
// docked under the map, as the winner's sheet.js did. A new place remounts the view (scrolled to the top, its
// "+ N more" folded again); a change in the same place re-renders it where it stands.

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Hit } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { useCanvas } from "../useCanvas.ts";
import { cx } from "./kit.tsx";
import { ItemSheet } from "./sheet/ItemSheet.tsx";
import { BasinSheet, ProvSheet, RiverSheet, TownSheet } from "./sheet/PlaceSheets.tsx";
import { PortSheet, ShipSheet, StationSheet } from "./sheet/PortSheets.tsx";
import s from "./sheet.module.css";

/** One key per place, so the view remounts when the place changes. */
function keyOf(h: Hit): string {
  switch (h.type) {
    case "item":
      return `item:${h.ref.id}`;
    case "town":
      return `town:${h.ref.river.key}@${h.ref.si}`;
    case "river":
      return `river:${h.ref.key}`;
    case "prov":
      return `prov:${h.ref.basin.key}/${h.ref.key}`;
    case "bundle":
      return `prov:${h.ref.prov.basin.key}/${h.ref.prov.key}`;
    case "basin":
      return `basin:${h.ref.key}`;
    case "port":
      return `port:${h.ref.chan?.id ?? "song"}`;
    case "ship":
      return `ship:${h.ref.ep.id}`;
    case "station":
      return `station:${h.ref.fam}/${h.ref.s.id}`;
    case "block":
    case "note":
      return h.type;
  }
}

function View({ h }: { readonly h: Hit }): ReactNode {
  switch (h.type) {
    case "item":
      return <ItemSheet it={h.ref} />;
    case "town":
      return <TownSheet t={h.ref} />;
    case "river":
      return <RiverSheet rv={h.ref} />;
    case "prov":
      return <ProvSheet p={h.ref} />;
    case "bundle":
      return <ProvSheet p={h.ref.prov} />;
    case "basin":
      return <BasinSheet b={h.ref} />;
    case "port":
      return <PortSheet p={h.ref} />;
    case "ship":
      return <ShipSheet sh={h.ref} />;
    case "station":
      return <StationSheet at={h.ref} />;
    case "block":
    case "note":
      return null;
  }
}

const sheetable = (h: Hit | null): h is Hit => h !== null && h.type !== "block" && h.type !== "note";

/** What the sheet covers of the map's right edge, for the camera. */
function setInset(st: CanvasStore, r: number): void {
  st.ui.inset.r = r;
}

export function Sheet() {
  const st = useCanvas();
  const el = useRef<HTMLElement>(null);
  const sel = st.ui.sel;
  const open = st.ui.sheetOpen && sheetable(sel);
  // What the sheet last showed, kept while it slides out.
  const [shown, setShown] = useState<Hit | null>(null);
  if (open && sel !== shown) setShown(sel);
  const h = open ? sel : shown;
  const key = h === null ? "" : keyOf(h);

  useEffect(() => {
    const e = el.current;
    if (!open || e === null) {
      setInset(st, 0);
      return;
    }
    const measure = (): void => setInset(st, e.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(e);
    return () => {
      ro.disconnect();
      setInset(st, 0);
    };
  }, [open, st]);

  useEffect(() => {
    const k = st.ui.surface?.kind;
    if (open && (k === "audio" || k === "brief")) st.closeSurface();
  }, [open, key, st]);

  return (
    <aside ref={el} data-role="sheet" className={cx(s.sheet, open && s.open)} aria-label="Detail" aria-hidden={!open} inert={!open}>
      {h !== null && <View key={key} h={h} />}
    </aside>
  );
}
