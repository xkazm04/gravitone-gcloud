"use client";

// THE DOCKS OVER THE MAP (port of the winner's chrome.js Ladder, Legend, Minimap and the projection dock). The ladder
// is the four levels with zoom out / in and the whole studio; the legend is every state as the lens that isolates it,
// with its count; the minimap is the continent with the viewport, dragged to move; the projection dock holds the two
// illustrative assumptions the fans are drawn from. The right-side docks move aside for the sheet; the bottom docks
// rise over a desk, and the legend gives way to it.

import { useEffect, useRef, useState } from "react";

import { Field } from "@gt/ui/components/field/Field.tsx";

import { shortNight } from "../scene/geo.ts";
import type { CanvasStore } from "../store.ts";
import { LEVELS, levelOf, type LevelIx, type Lens, type Tone } from "../tables.ts";
import { readPalette } from "../tokens.ts";
import { useCanvas } from "../useCanvas.ts";
import { flyBox, goLevel, home, locate, zoomBy } from "../render/camera.ts";
import { drawMini, miniGo, newMini } from "../render/minimap.ts";
import { lensOk } from "../render/prims.ts";
import { onFrame } from "../render/state.ts";
import { cx, kit } from "./kit.tsx";
import d from "./docks.module.css";

const deskOpen = (st: CanvasStore): boolean => st.ui.surface !== null && (st.ui.surface.kind === "audio" || st.ui.surface.kind === "brief");

/* ---------- Ladder: the four levels ---------- */

export function Ladder() {
  const st = useCanvas();
  const L = levelOf(st.ui.cam.z);
  return (
    <div className={cx(d.dock, d.ladder, deskOpen(st) && d.deskOpen)} role="group" aria-label="Zoom level" data-role="ladder">
      <button type="button" className={d.zb} aria-label="Zoom out" onClick={() => zoomBy(st, 1 / 1.8)}>
        −
      </button>
      {LEVELS.map((l, i) => (
        <button key={l.key} type="button" className={cx(L === i && d.on)} aria-pressed={L === i} onClick={() => goLevel(st, i as LevelIx)}>
          <kbd className={kit.kbd}>{i + 1}</kbd>
          {l.name}
        </button>
      ))}
      <button type="button" className={d.zb} aria-label="Zoom in" onClick={() => zoomBy(st, 1.8)}>
        +
      </button>
      <span className={d.div} />
      <button type="button" className={d.zb} aria-label="Whole studio" onClick={() => home(st)}>
        ⌂
      </button>
    </div>
  );
}

/* ---------- Legend: each state is also the lens that isolates it ---------- */

type LensRow = readonly [Exclude<Lens, null>, Tone, string];

export function Legend() {
  const st = useCanvas();
  const s = st.scene;
  const rows: readonly LensRow[] = [
    ["waits", "amber", "waits on you"],
    ["kept", "emerald", "kept"],
    ["open", "amber", "undecided"],
    ["pending", "cyan", "rendering"],
    ["dead", "rose", "failed · rejected"],
    ["outline-kept", "violet", "outlined"],
    ["paused", "faint", "paused"],
    ["night", "cyan", `night ${shortNight(s.latest)}`],
  ];
  const count = (k: Lens): number => s.items.filter((it) => lensOk(k, s.latest, it)).length;
  const pick = (k: Exclude<Lens, null>): void => {
    st.setLens(k);
    if (st.ui.lens !== "night") return;
    const its = s.items.filter((it) => it.at === s.latest);
    if (its.length === 0) return;
    flyBox(st, Math.min(...its.map((i) => i.x)) - 80, Math.min(...its.map((i) => i.y)) - 80, Math.max(...its.map((i) => i.x)) + 120, Math.max(...its.map((i) => i.y)) + 80, 2.2);
  };
  const follow = (): void => {
    const r = s.rivers.find((x) => x.rank === 1);
    if (r === undefined) return;
    locate(st, { type: "river", ref: r });
    st.openSheet({ type: "river", ref: r });
  };
  const proj = (): void => {
    st.set("projOpen", !st.ui.projOpen);
  };
  return (
    <div className={cx(d.dock, d.legend, st.ui.sheetOpen && d.sheetOpen, deskOpen(st) && d.deskOpen)} role="group" aria-label="States" data-role="legend">
      {rows.map(([k, tone, word]) => (
        <button key={k} type="button" aria-pressed={st.ui.lens === k} onClick={() => pick(k)}>
          <i style={{ background: `var(--${tone})` }} />
          {word} <b>{count(k)}</b>
        </button>
      ))}
      <button type="button" className={d.follow} onClick={follow}>
        <i />
        kept most
      </button>
      <span className={`${d.key} ${d.dry}`}>
        <i />
        dry bed
      </span>
      <button type="button" className={d.proj} onClick={proj}>
        <i />
        projected
      </button>
    </div>
  );
}

/* ---------- Minimap: the continent, the viewport, where work waits ---------- */

export function MiniMap() {
  const st = useCanvas();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (cv === null) return;
    const pal = readPalette();
    const mini = newMini();
    const off = onFrame(st, () => drawMini(st, cv, pal, mini));
    let drag = false;
    const down = (e: PointerEvent): void => {
      drag = true;
      cv.setPointerCapture(e.pointerId);
      miniGo(st, cv, mini, e.clientX, e.clientY);
    };
    const move = (e: PointerEvent): void => {
      if (drag) miniGo(st, cv, mini, e.clientX, e.clientY);
    };
    const up = (): void => {
      drag = false;
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    return () => {
      off();
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
    };
  }, [st]);
  return (
    <div className={cx(d.dock, d.mini, st.ui.sheetOpen && d.sheetOpen, deskOpen(st) && d.deskOpen)} data-role="minimap">
      <canvas ref={ref} aria-label="Overview" />
    </div>
  );
}

/* ---------- Projection: the two assumptions the fans are drawn from (illustrative) ---------- */

export function ProjDock() {
  const st = useCanvas();
  return st.ui.projOpen ? <ProjForm /> : null;
}

/** The two assumptions as typed text (a half-typed "0." stays on screen), each number written through on change. */
function ProjForm() {
  const st = useCanvas();
  const [views, setViews] = useState(String(st.ui.assume.views));
  const [rpm, setRpm] = useState(String(st.ui.assume.rpm));
  const set = (k: "views" | "rpm", v: string): void => {
    (k === "views" ? setViews : setRpm)(v);
    st.set("assume", { ...st.ui.assume, [k]: Math.max(0, Number(v) || 0) });
  };
  return (
    <div className={cx(d.dock, d.projDock, d.on)} role="dialog" aria-label="Projection assumptions">
      <h4>Projected · illustrative</h4>
      <label>
        Views per published episode
        <Field skin="" type="number" min={0} step={100} label="Views per published episode" value={views} autoFocus onChange={(v) => set("views", v)} />
      </label>
      <label>
        Revenue per 1,000 views ($)
        <Field skin="" type="number" min={0} step={0.01} label="Revenue per 1,000 views" value={rpm} onChange={(v) => set("rpm", v)} />
      </label>
      <div className={d.basis}>kept + ½ made episodes per port · YouTube Analytics planned</div>
    </div>
  );
}
