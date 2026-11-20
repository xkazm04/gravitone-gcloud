"use client";

// THE KEYMAP AS THE TABLE IT IS - the app keymap's canvas modes (the map, the gallery, the desk) read through keyTable,
// three columns as the winner drew them (chrome.js toggleKeys), plus the pointer's three gestures. A press anywhere
// closes it; Esc is the keymap's own `up`.

import { KEYMAP } from "@gt/ui/keymap/bindings";
import { keyTable, type KeyRow } from "@gt/ui/keymap/keymap";

import type { CanvasStore } from "../store.ts";
import { useCanvas } from "../useCanvas.ts";
import ks from "./keys.module.css";

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** At most four caps; a longer run of keys draws as its first and last. */
const capsOf = (keys: readonly string[]): readonly string[] => {
  const first = keys[0];
  const last = keys[keys.length - 1];
  return keys.length > 4 && first !== undefined && last !== undefined ? [`${first}–${last}`] : keys;
};

function Rows({ rows }: { readonly rows: readonly KeyRow[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className={ks.k}>
          <span>
            {capsOf(r.keys).map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </span>
          <span>{cap(r.does)}</span>
        </div>
      ))}
    </>
  );
}

const POINTER: readonly KeyRow[] = [
  { keys: ["right-click"], does: "Note · actions here" },
  { keys: ["long-press"], does: "The same, on touch" },
  { keys: ["double-click"], does: "Zoom in" },
];

/** Opens or closes the keys sheet (the header's button, `?`, Esc). */
export function setKeysOpen(st: CanvasStore, on: boolean): void {
  st.ui.keysOpen = on;
  st.changed("ui");
}

export function KeysSheet() {
  const st = useCanvas();
  if (!st.ui.keysOpen) return null;
  const close = (): void => setKeysOpen(st, false);
  return (
    <div data-role="keys" className={ks.keys} role="dialog" aria-label="Keys" onClick={close}>
      <div className={ks.card}>
        <div>
          <h4>Map</h4>
          <Rows rows={keyTable(KEYMAP, "canvas")} />
        </div>
        <div>
          <h4>Gallery</h4>
          <Rows rows={keyTable(KEYMAP, "canvas-gallery")} />
        </div>
        <div>
          <h4>Desk</h4>
          <Rows rows={keyTable(KEYMAP, "canvas.desk")} />
          <h4 className={ks.next}>Pointer</h4>
          <Rows rows={POINTER} />
        </div>
      </div>
    </div>
  );
}
