"use client";

// THE DESK - the surface docked under the map (port of the winner's audio.js WS.desk): audio → calendar, or the next
// night. While it is open the map's bottom inset is the desk's height, so the camera keeps what it frames above it;
// closing it gives the height back. The desk's keys (⏎ run, Esc close) are bound by whichever desk is mounted.

import { useEffect, useRef } from "react";

import { clampCam, flyBox } from "../render/camera.ts";
import { COAST_X, FAN_X0, sx } from "../scene/geo.ts";
import { blocksUnder } from "../scene/scopes.ts";
import type { CanvasStore, Surface } from "../store.ts";
import { useCanvas } from "../useCanvas.ts";
import { AudioDesk } from "./AudioDesk.tsx";
import { BriefDesk } from "./BriefDesk.tsx";
import { cx } from "./kit.tsx";
import d from "./desk.module.css";

/** A fresh audio desk per opening: the rows and the picks are the opening's, as the winner's `open(scope)` made them. */
const openings = new WeakMap<object, number>();
let seq = 0;
const openingOf = (o: object): number => {
  const k = openings.get(o);
  if (k !== undefined) return k;
  seq++;
  openings.set(o, seq);
  return seq;
};

/** The map's bottom inset is the desk's height; answers whether it moved. */
const setInset = (st: CanvasStore, h: number): boolean => {
  if (st.ui.inset.b === h) return false;
  st.ui.inset.b = h;
  return true;
};

/** The map above shows the road (the winner's audio.js / brief.js open): the reels' town down to the release lane; or the
 *  video basin's highlands, where the next night's seeds will land. */
function frame(st: CanvasStore, s: NonNullable<Surface>): void {
  if (s.kind === "brief") {
    const b = st.scene.basins.find((x) => x.key === "video");
    if (b !== undefined) flyBox(st, -200, b.y0 - 60, sx(3.2), b.y0 + 900, 1);
    return;
  }
  if (s.kind !== "audio") return;
  const under = blocksUnder(st.scene, s.scope);
  const rows = [...under.audio, ...under.slot];
  const its = rows.length > 0 ? rows : st.scene.reels.filter((it) => it.state === "kept");
  if (its.length === 0) return;
  const xs = its.map((it) => it.x);
  const ys = its.map((it) => it.y);
  flyBox(st, Math.min(...xs) - 300, Math.min(...ys) - 160, COAST_X + FAN_X0, Math.max(...ys) + 160, 1.4);
}

export function Desk() {
  const st = useCanvas();
  const s = st.ui.surface;
  const kind = s !== null && (s.kind === "audio" || s.kind === "brief") ? s.kind : null;
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (kind === null || el === null) return;
    const fit = (): void => {
      if (setInset(st, el.offsetHeight)) st.changed("camera");
    };
    fit();
    if (s !== null) frame(st, s);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setInset(st, 0);
      clampCam(st);
    };
    // Framed once per opening (`s` is a new surface each time the desk opens), not on every surface change inside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, kind]);

  if (s === null || (s.kind !== "audio" && s.kind !== "brief")) return null;
  return (
    <section ref={ref} data-role="desk" aria-label="Desk" className={cx(d.desk, s.kind === "audio" ? d.audio : d.brief)}>
      {s.kind === "audio" ? <AudioDesk key={openingOf(s)} scope={s.scope} /> : <BriefDesk />}
    </section>
  );
}

