"use client";

// THE PRODUCTION STREET (spark character-cores S1) - docked under the map at street zoom over a production's river,
// the way the desk docks: the map's bottom inset is its height, so the camera keeps the river framed above it. Its bar
// names the production, its cast and its states, and switches the drawing (A river of stations, B timeline street,
// C film strip; V cycles). The street is read-and-click: a node clicked opens its overlay over the whole page
// (NodeOverlay.tsx, S1.5 WP7 - a take's verdict is given there), and nothing grows under the drawing. The swap's
// preview floats inside it; the core picker (C) opens over the whole page.

import { useEffect, useRef } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { clampCam } from "../render/camera.ts";
import type { CanvasStore } from "../store.ts";
import { levelOf } from "../tables.ts";
import { Gl, Kbd, Seg } from "../ui/kit.tsx";
import { useCanvas } from "../useCanvas.ts";
import { acceptSwap, frameStreet, keepCast, openNode, openStreet, previewCore, setTray, setVariant, streetOf } from "./acts.ts";
import { FilmStrip } from "./FilmStrip.tsx";
import { countLine, counts, VARIANT_NAME, VARIANTS, type Variant } from "./model.ts";
import { NodeOverlay } from "./NodeOverlay.tsx";
import type { StreetProps } from "./parts.tsx";
import { RiverStreet } from "./RiverStreet.tsx";
import { CorePicker } from "./CorePicker.tsx";
import { SwapPanel } from "./Swap.tsx";
import { TimelineStreet } from "./TimelineStreet.tsx";
import s from "./street.module.css";

const DRAW: Readonly<Record<Variant, (p: StreetProps) => React.JSX.Element>> = { a: RiverStreet, b: TimelineStreet, c: FilmStrip };

const setInset = (st: CanvasStore, h: number): boolean => {
  if (st.ui.inset.b === h) return false;
  st.ui.inset.b = h;
  return true;
};

/** The production river the camera's centre is over, at street zoom. */
function riverHere(st: CanvasStore): string | null {
  if (levelOf(st.ui.cam.z) < 3) return null;
  const y = st.ui.cam.y;
  return st.scene.rivers.find((r) => r.prod !== null && y >= r.y0 && y <= r.y0 + r.h)?.prod?.id ?? null;
}

/** Street zoom over a production's river opens its street, once per arrival: closed there, it stays closed until the
 *  camera leaves street zoom or the river. */
function useArrival(st: CanvasStore): void {
  const dismissed = useRef<string | null>(null);
  const here = riverHere(st);
  const open = st.ui.surface;
  useEffect(() => {
    if (here === null) {
      dismissed.current = null;
      return;
    }
    if (open?.kind === "street") {
      dismissed.current = here;
      return;
    }
    if (open === null && dismissed.current !== here) openStreet(st, here);
  }, [st, here, open]);
}

export function Street() {
  const st = useCanvas();
  useArrival(st);
  const p = streetOf(st);
  const ref = useRef<HTMLElement>(null);
  const castRef = useRef<HTMLButtonElement>(null);
  const open = p?.id ?? null;

  useEffect(() => {
    const el = ref.current;
    if (open === null || el === null) return;
    const fit = (): void => {
      if (setInset(st, el.offsetHeight)) st.changed("camera");
    };
    fit();
    frameStreet(st, open);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setInset(st, 0);
      clampCam(st);
      // A street closed with an overlay open does not reopen on it.
      st.ui.street.focus = null;
    };
  }, [st, open]);

  if (p === null) return null;
  const u = st.ui.street;
  const focus = u.focus === null ? null : (p.nodes.find((n) => n.id === u.focus) ?? null);
  const rippling = u.ripple === null ? null : new Set(u.ripple.ids);
  // The cast's door is the core picker, from anywhere: an overlay's "from" too.
  const go = (id: string): void => {
    if (p.nodes.find((n) => n.id === id)?.station !== "cast") return openNode(st, id);
    openNode(st, null);
    setTray(st, true);
  };
  const props: StreetProps = {
    p,
    focus: u.focus,
    rippling,
    onPick: (n) => go(n.id),
    onSwap: () => setTray(st, true),
    onDropCore: (core) => void previewCore(st, core),
  };
  const Draw = DRAW[u.variant];
  return (
    <section ref={ref} data-role="street" data-variant={u.variant} aria-label={`${p.title}, street`} className={s.street}>
      <div className={s.bar}>
        <h2>{p.title}</h2>
        <button ref={castRef} type="button" className={s.cast} data-role="street-cast" onClick={() => setTray(st, true)} aria-label={`Cast ${p.cast.name}; cores`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.cast.portrait} alt="" />
          {p.cast.name}
          <Kbd verb="cores" />
        </button>
        <span className={s.facts}>{countLine(counts(p.nodes))}</span>
        <span className={s.grow} />
        <span className={s.switch}>
          <Seg label="Street" value={u.variant} options={VARIANTS.map((key) => ({ key, name: `${key.toUpperCase()} ${VARIANT_NAME[key]}` }))} onPick={(v) => setVariant(st, v)} />
          <Kbd verb="street-variant" />
        </span>
        <button type="button" className={s.iconbtn} onClick={() => st.closeSurface()} aria-label="Close street">
          <Gl name="x" />
        </button>
      </div>
      {u.error !== null && (
        <div className={s.err}>
          <ErrorLine message={u.error} live />
        </div>
      )}
      <div className={s.body}>
        <Draw {...props} />
        {u.tray && <CorePicker cores={st.prod.cores} cast={p.cast.id} castRef={castRef} onPick={(core) => void previewCore(st, core)} onClose={() => setTray(st, false)} />}
        {(u.preview !== null || u.asking !== null) && <SwapPanel p={p} cores={st.prod.cores} asking={u.asking} preview={u.preview} onAccept={() => void acceptSwap(st)} onKeep={() => keepCast(st)} />}
      </div>
      {focus !== null && !u.tray && <NodeOverlay st={st} p={p} n={focus} onGo={(id) => go(id)} onClose={() => openNode(st, null)} />}
    </section>
  );
}
