// THE STREET'S ACTS - the production basin's moves over the store and the canvas port (spark character-cores S1):
// open a production's street, cycle its variant, open the cores tray, ask a swap's preview, accept it (the cast
// changes, what the port names goes stale, the ripple plays once) or keep the current cast. A refusal lands in the
// street as the side's own sentence (ErrorLine), never reworded.

import type { ActionResult } from "../../../../../_server/actionCore.ts";
import { flyTo } from "../render/camera.ts";
import type { CanvasStore } from "../store.ts";
import { LEVELS } from "../tables.ts";
import { becameStale, nextVariant, type Variant } from "./model.ts";

/** Long enough for the slowest variant's ripple to run downstream and settle. */
const RIPPLE_MS = 3200;

/** The production the street is open on, as the store holds it now. */
export function streetOf(st: CanvasStore) {
  const s = st.ui.surface;
  if (s === null || s.kind !== "street") return null;
  return st.prod.productions.find((p) => p.id === s.production) ?? null;
}

/** Fly to the production's river at street zoom, centred on its cast station. */
export function frameStreet(st: CanvasStore, production: string): void {
  const r = st.scene.rivers.find((x) => x.prod?.id === production);
  const cast = r?.stationPts.find((p) => p.s.id === "cast");
  if (r === undefined || cast === undefined) return;
  flyTo(st, cast.x, r.cy, LEVELS[3].z, 600);
}

export function openStreet(st: CanvasStore, production: string): void {
  st.openSurface({ kind: "street", production });
}

export function setVariant(st: CanvasStore, v: Variant): void {
  st.ui.street.variant = v;
  st.changed("ui");
}

export const cycleVariant = (st: CanvasStore): void => setVariant(st, nextVariant(st.ui.street.variant));

/** A node's own words under the drawing; the same node again closes them. */
export function focusNode(st: CanvasStore, id: string): void {
  st.ui.street.focus = st.ui.street.focus === id ? null : id;
  st.changed("ui");
}

export function setTray(st: CanvasStore, open: boolean): void {
  st.ui.street.tray = open;
  st.changed("ui");
}

/** Esc inside the street: the preview, then the core picker, then the street itself. Answers whether it closed anything. */
export function streetBack(st: CanvasStore): boolean {
  const s = st.ui.street;
  if (st.ui.surface?.kind !== "street") return false;
  if (s.preview !== null || s.asking !== null) keepCast(st);
  else if (s.tray) setTray(st, false);
  else st.closeSurface();
  return true;
}

async function ask<T>(st: CanvasStore, call: () => Promise<ActionResult<T>>): Promise<T | null> {
  st.ui.busy++;
  st.ui.street.error = null;
  try {
    const r = await call();
    if (r.ok) return r.value;
    st.ui.street.error = r.error.error;
    return null;
  } catch (e) {
    st.ui.street.error = e instanceof Error ? e.message : String(e);
    return null;
  } finally {
    st.ui.busy--;
    st.changed("ui");
  }
}

/** Pick a core for the cast: the port redraws 2-3 frames with it and names what would go stale. */
export async function previewCore(st: CanvasStore, core: string): Promise<void> {
  const p = streetOf(st);
  if (p === null) return;
  st.ui.street.asking = core;
  st.ui.street.preview = null;
  st.ui.street.tray = false;
  st.changed("ui");
  const got = await ask(st, () => st.port.swapPreview({ production: p.id, core }));
  if (st.ui.street.asking !== core) return;
  st.ui.street.asking = null;
  st.ui.street.preview = got;
  st.changed("ui");
}

export function keepCast(st: CanvasStore): void {
  st.ui.street.preview = null;
  st.ui.street.asking = null;
  st.changed("ui");
}

/** Accept the previewed swap: the production as the port now holds it replaces the store's, and the ripple starts. */
export async function acceptSwap(st: CanvasStore): Promise<void> {
  const pv = st.ui.street.preview;
  const before = streetOf(st);
  if (pv === null || before === null) return;
  const got = await ask(st, () => st.port.swapAccept({ production: pv.production, core: pv.to }));
  if (got === null) return;
  const after = got.production;
  st.prod.productions = st.prod.productions.map((p) => (p.id === after.id ? after : p));
  for (const r of st.scene.rivers) if (r.prod?.id === after.id) r.prod = after;
  st.ui.street.preview = null;
  const ripple = { ids: becameStale(before, after), t0: Date.now() };
  st.ui.street.ripple = ripple;
  st.changed("ui");
  // The ripple plays once; then only the stale state holds (a redraw of the street does not replay it).
  setTimeout(() => {
    if (st.ui.street.ripple !== ripple) return;
    st.ui.street.ripple = null;
    st.changed("ui");
  }, RIPPLE_MS);
}
