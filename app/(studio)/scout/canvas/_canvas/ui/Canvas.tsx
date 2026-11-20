"use client";

// THE SCOUT CANVAS ISLAND - builds the store from the server's view, mounts every surface over the map (the toolbar, the
// docks, the sheet, the desk, the gallery, the menu, the key sheet, the toast) and owns the map scope's keys: the
// winner's map.js and chrome.js commands, registered BY VERB with the app's one dispatcher (keys live in
// packages/ui/src/keymap/bindings.ts, modes `canvas`, `canvas.desk`, `canvas-gallery`).

import { useRef, useState } from "react";

import { useKeys, type KeyHit } from "@gt/ui/keymap/dispatch";

import type { CoreRef, Production, SwapPreview } from "@gt/domain/productionGraph";

import type { CanvasPort, CanvasView } from "../../_port/contract.ts";
import { pause } from "../acts.ts";
import { openNode, setTray, streetBack, streetOf } from "../production/acts.ts";
import { Street } from "../production/Street.tsx";
import { flyBox, flyTo, goLevel, home, levelUp, pan } from "../render/camera.ts";
import { blockPoints, blocksUnder, scopeName, scopeOf } from "../scene/scopes.ts";
import type { Hit, Scope } from "../scene/types.ts";
import { CanvasStore } from "../store.ts";
import type { LevelIx } from "../tables.ts";
import { CanvasContext } from "../useCanvas.ts";
import { Desk } from "./Desk.tsx";
import { Ladder, Legend, MiniMap, ProjDock } from "./Docks.tsx";
import { Gallery } from "./Gallery.tsx";
import { KeysSheet } from "./KeysSheet.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import { Menu, openMenuHere } from "./Menu.tsx";
import { Sheet } from "./Sheet.tsx";
import { Toast } from "./Toast.tsx";
import { openFind, Toolbar } from "./Toolbar.tsx";
import k from "./kit.module.css";
import c from "./canvas.module.css";

/** The place a hit stands for (chrome.js targetOf): a weir stands for its scope. */
const targetOf = (h: Hit | null): Scope | null => {
  if (h === null || h.type === "station" || h.type === "note") return null;
  return h.type === "block" ? h.scope : scopeOf(h);
};

function useMapKeys(st: CanvasStore): void {
  const here = (): Scope | null => targetOf(st.ui.hover) ?? targetOf(st.ui.sel);
  const bp = useRef(-1);
  const stepBlock = (d: number): void => {
    const pts = blockPoints(st.scene);
    if (pts.length === 0) {
      st.say("0 waiting");
      return;
    }
    bp.current = (bp.current + d + pts.length) % pts.length;
    const p = pts[bp.current];
    if (p === undefined) return;
    const t = p.scope.ref;
    flyBox(st, t.bx - 120, t.by - 90, t.bx + t.bw + 120, t.by + t.bh + 90, 3, 1.6);
    st.set("pulse", { x: t.x, y: t.y, t0: performance.now() + 500 });
    st.openSheet(p.scope);
  };
  const cam = st.ui.cam;
  useKeys("canvas", {
    level: (hit: KeyHit) => goLevel(st, Math.max(0, Math.min(3, Number(hit.cap) - 1)) as LevelIx),
    "zoom-in": () => flyTo(st, cam.x, cam.y, cam.z * 1.8, 300),
    "zoom-out": () => flyTo(st, cam.x, cam.y, cam.z / 1.8, 300),
    home: () => home(st),
    pan: (hit: KeyHit) => {
      const s = 120 / cam.z;
      const [dx, dy] = hit.cap === "←" ? [-s, 0] : hit.cap === "→" ? [s, 0] : hit.cap === "↑" ? [0, -s] : [0, s];
      pan(st, dx, dy);
    },
    "next-block": () => stepBlock(1),
    "prev-block": () => stepBlock(-1),
    triage: () => {
      const sc = here() ?? { type: "all" };
      const b = blocksUnder(st.scene, sc);
      if (b.verdict.length + b.seeds.length > 0) st.openSurface({ kind: "gallery", scope: sc, block: null, focus: null });
      else st.say(`0 awaiting a verdict · ${scopeName(sc)}`);
    },
    audio: () => {
      const sc = here() ?? { type: "all" };
      const b = blocksUnder(st.scene, sc);
      st.openSurface({ kind: "audio", scope: b.audio.length + b.slot.length > 0 ? sc : { type: "all" } });
    },
    note: () => {
      if (!openMenuHere(st)) st.say("point at a genre, a channel, an audience or a lot");
    },
    pause: () => {
      const t = here();
      const r = t === null ? null : t.type === "river" ? t.ref : t.type === "town" || t.type === "item" ? t.ref.river : null;
      if (r === null || r.synthetic) return;
      void pause(st, r).then(() => st.say(`${r.paused ? "paused" : "resumed"} · ${r.name}`));
    },
    brief: () => st.openSurface({ kind: "brief" }),
    find: () => openFind(st),
    cores: () => {
      // another device's production is shown, never recast: C opens its cast's overlay instead
      if (st.ui.surface?.kind === "street" && streetOf(st)?.readOnly === true) openNode(st, "cast");
      else if (st.ui.surface?.kind === "street") setTray(st, !st.ui.street.tray);
      else st.say("street zoom on a production");
    },
    keys: () => st.set("keysOpen", !st.ui.keysOpen),
    up: () => {
      if (st.ui.keysOpen) st.set("keysOpen", false);
      else if (st.ui.menu !== null) st.closeMenu();
      else if (st.ui.projOpen) st.set("projOpen", false);
      else if (st.ui.sheetOpen) st.closeSheet();
      else if (!streetBack(st)) levelUp(st);
    },
  }, { enabled: st.ui.surface?.kind !== "gallery" });
}

/** The production basin's server load: the productions, the cores, and a street to open on arrival (a link's state). */
export type CanvasProds = {
  readonly productions: readonly Production[];
  readonly cores: readonly CoreRef[];
  readonly open?: { readonly production: string; readonly tray: boolean; readonly preview: SwapPreview | null; readonly error: string | null };
};

function newStore(view: CanvasView, port: CanvasPort, prod: CanvasProds | undefined): CanvasStore {
  const st = new CanvasStore(view, port, prod);
  const o = prod?.open;
  if (o !== undefined && st.prod.productions.some((p) => p.id === o.production)) {
    st.ui.surface = { kind: "street", production: o.production };
    Object.assign(st.ui.street, { tray: o.tray, preview: o.preview, error: o.error });
  }
  return st;
}

export function Canvas({ view, port, prod }: { readonly view: CanvasView; readonly port: CanvasPort; readonly prod?: CanvasProds }) {
  const [st] = useState(() => newStore(view, port, prod));
  useMapKeys(st);
  return (
    <CanvasContext.Provider value={st}>
      <div className={`${k.root} ${c.canvas}`} data-role="canvas">
        <Toolbar />
        <div className={c.stage}>
          <MapCanvas />
          <Ladder />
          <Legend />
          <MiniMap />
          <ProjDock />
          <Sheet />
          <Desk />
          <Street />
          <Menu />
          <KeysSheet />
          <Toast />
        </div>
        <Gallery />
      </div>
    </CanvasContext.Provider>
  );
}
