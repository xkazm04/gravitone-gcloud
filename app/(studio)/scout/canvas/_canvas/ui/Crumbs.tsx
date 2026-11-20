"use client";

// THE CRUMBS - where the camera stands: Studio › basin › province › river › town (› the coast), then the level chip.
// The camera moves every frame without a store change, so the crumbs read it on each animation frame and re-render
// only when the place changes (the winner's chrome.js placeAt / renderCrumbs). The place is also announced politely.

import { useEffect, useState } from "react";

import { flyBox, home, locate } from "../render/camera.ts";
import { COAST_X, SEA_X, SW } from "../scene/geo.ts";
import type { Basin, Province, River, Scene, Town } from "../scene/types.ts";
import type { CanvasStore } from "../store.ts";
import { LEVELS, levelOf, STAGE_NAME, STAGES, type LevelIx } from "../tables.ts";
import { useCanvasStore } from "../useCanvas.ts";
import { kit } from "./kit.tsx";
import t from "./toolbar.module.css";

type At = { readonly L: LevelIx; readonly b: Basin | null; readonly p: Province | null; readonly r: River | null; readonly t: Town | null; readonly sea: boolean };

function placeAt(sc: Scene, st: CanvasStore): At {
  const c = st.ui.cam;
  const L = levelOf(c.z);
  const b = sc.basins.find((x) => c.y >= x.y0 - 40 && c.y <= x.y1 + 40) ?? null;
  const p = b?.provs.find((x) => c.y >= x.y0 - 7 && c.y <= x.y1 + 7) ?? null;
  const r = p?.rivers.find((x) => c.y >= x.y0 && c.y <= x.y0 + x.h) ?? null;
  let town: Town | null = null;
  if (r !== null && L >= 2) {
    let best = 1e9;
    for (const tt of r.towns) {
      const d = Math.abs(tt.x - c.x);
      if (d < best && d < SW / 2) {
        best = d;
        town = tt;
      }
    }
  }
  return { L, b: L >= 1 ? b : null, p: L >= 1 ? p : null, r: L >= 1 ? r : null, t: town, sea: c.x > COAST_X - 20 };
}

const keyOf = (a: At): string => [a.L, a.b?.key, a.p?.key, a.r?.key, a.t?.si, a.sea].join("|");
const stageName = (si: number): string => {
  const s = STAGES[si];
  return s === undefined ? "" : STAGE_NAME[s];
};

export function Crumbs() {
  const st = useCanvasStore();
  const [at, setAt] = useState<At>(() => placeAt(st.scene, st));
  useEffect(() => {
    let raf = 0;
    let last = "";
    const frame = (): void => {
      const a = placeAt(st.scene, st);
      const k = keyOf(a);
      if (k !== last) {
        last = k;
        setAt(a);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [st]);

  const { b, p, r, t: town } = at;
  const sep = <span className={t.sep}>›</span>;
  const live = LEVELS[at.L].name + (r !== null ? ` · ${r.name}` : b !== null ? ` · ${b.name}` : "");
  return (
    <nav data-role="crumbs" className={t.crumbs} aria-label="Where on the map">
      <button type="button" onClick={() => home(st)}>Studio</button>
      {b !== null && (
        <>
          {sep}
          <button type="button" onClick={() => locate(st, { type: "basin", ref: b })}>{b.name}</button>
        </>
      )}
      {p !== null && (
        <>
          {sep}
          <button type="button" onClick={() => { locate(st, { type: "prov", ref: p }); st.openSheet({ type: "prov", ref: p }); }}>{p.name}</button>
        </>
      )}
      {r !== null && (
        <>
          {sep}
          <button type="button" onClick={() => { locate(st, { type: "river", ref: r }); st.openSheet({ type: "river", ref: r }); }}>{r.name}</button>
        </>
      )}
      {town !== null && (
        <>
          {sep}
          <button type="button" onClick={() => { locate(st, { type: "town", ref: town }); st.openSheet({ type: "town", ref: town }); }}>{stageName(town.si)}</button>
        </>
      )}
      {at.sea && at.L >= 1 && (
        <>
          {sep}
          <button type="button" onClick={() => flyBox(st, COAST_X - 100, st.ui.cam.y - 300, SEA_X, st.ui.cam.y + 300, 1.2)}>Coast &amp; calendar</button>
        </>
      )}
      <span className={t.lvl}>{LEVELS[at.L].name}</span>
      <span className={kit.sr} aria-live="polite">{live}</span>
    </nav>
  );
}
