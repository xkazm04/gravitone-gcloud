"use client";

// THE SHEET'S HEAD - its crumbs (each one flies there and opens its sheet), the title, locate and close, the chips,
// and the action bar: what can be done at this point (triage, audio → calendar, schedule, a note, a pause). Port of
// the winner's sheet.js head / actions / crumbsFor.

import { Fragment, type ReactNode } from "react";

import * as acts from "../../acts.ts";
import { locate } from "../../render/camera.ts";
import { cut } from "../../scene/geo.ts";
import { anchorOf, blocksUnder, scopeOf } from "../../scene/scopes.ts";
import type { Hit, River, Scope } from "../../scene/types.ts";
import type { CanvasStore } from "../../store.ts";
import { useCanvasStore } from "../../useCanvas.ts";
import { cx, Gl, Kbd, kit } from "../kit.tsx";
import { focusMap, gate, openMenuFor } from "../Menu.tsx";
import s from "../sheet.module.css";
import { go, stageName } from "./shared.tsx";

export type Crumb = { readonly t: string; readonly go?: Exclude<Scope, { type: "all" }> };

/** The river a place flows in. */
export function riverOfSel(st: CanvasStore, sel: Hit): River | null {
  switch (sel.type) {
    case "river":
      return sel.ref;
    case "town":
    case "item":
    case "port":
      return sel.ref.river;
    case "ship":
      return st.scene.riverBy.get(`chan:${sel.ref.chan.id}`) ?? null;
    default:
      return null;
  }
}

export function crumbsFor(st: CanvasStore, sel: Hit): Crumb[] {
  const out: Crumb[] = [{ t: "Studio" }];
  const r = riverOfSel(st, sel);
  const p = r?.province ?? null;
  if (r !== null && p !== null) {
    out.push({ t: p.basin.name, go: { type: "basin", ref: p.basin } });
    out.push({ t: p.name, go: { type: "prov", ref: p } });
    if (sel.type !== "river") out.push({ t: cut(r.name, 30), go: { type: "river", ref: r } });
  }
  if (sel.type === "item") out.push({ t: stageName(sel.ref.si), go: { type: "town", ref: sel.ref.town } });
  const port = sel.type === "ship" ? sel.ref.chan.port : null;
  if (sel.type === "ship" && port !== null) out.push({ t: `port ${sel.ref.chan.id}`, go: { type: "port", ref: port } });
  return out;
}

/** Where the locate button flies: a station's basin, else the place itself. */
function locScope(st: CanvasStore, sel: Hit): Scope | null {
  if (sel.type === "station") {
    const b = st.scene.basins.find((x) => x.key === sel.ref.fam);
    return b === undefined ? null : { type: "basin", ref: b };
  }
  return sel.type === "block" || sel.type === "note" ? null : sel;
}

function Actions({ sel }: { readonly sel: Hit }) {
  const st = useCanvasStore();
  const sc = scopeOf(sel);
  const b = blocksUnder(st.scene, sc);
  const tri = b.verdict.length + b.seeds.length;
  const r = sel.type === "river" ? sel.ref : null;
  const hasNote = anchorOf(sel) !== null;
  if (tri === 0 && b.audio.length === 0 && b.slot.length === 0 && !hasNote && (r === null || r.synthetic)) return null;
  return (
    <div className={s.act}>
      {tri > 0 && (
        <button type="button" className={cx(kit.btn, kit.amberBtn)} onClick={() => st.openSurface({ kind: "gallery", scope: sc, block: null, focus: null })}>
          <Gl name="eye" />
          {`Triage ${tri}`}
          <Kbd verb="triage" />
        </button>
      )}
      {b.audio.length > 0 && (
        <button type="button" className={cx(kit.btn, kit.amberBtn)} onClick={() => st.openSurface({ kind: "audio", scope: sc })}>
          <Gl name="mute" />
          {`Audio → calendar ${b.audio.length}`}
          <Kbd verb="audio" />
        </button>
      )}
      {b.slot.length > 0 && (
        <button type="button" className={cx(kit.btn, kit.amberBtn)} onClick={() => st.openSurface({ kind: "audio", scope: sc })}>
          <Gl name="cal" />
          {`Schedule ${b.slot.length}`}
        </button>
      )}
      {hasNote && (
        <button
          type="button"
          className={cx(kit.btn, kit.violetBtn)}
          onClick={(e) => {
            const rc = e.currentTarget.getBoundingClientRect();
            openMenuFor(st, sel, rc.left - 340, rc.bottom);
          }}
        >
          <Gl name="flag" size={13} />
          Note
          <Kbd verb="note" />
        </button>
      )}
      {r !== null && !r.synthetic && (
        <button type="button" className={kit.btn} onClick={() => {
          if (gate(st, "steer")) void acts.pause(st, r);
        }}>
          <Gl name={r.paused ? "play" : "pause"} size={13} />
          {r.paused ? "Resume" : "Pause"}
          <Kbd verb="pause" />
        </button>
      )}
    </div>
  );
}

export function Head({ sel, crumbs, title, small = false, chips }: { readonly sel: Hit; readonly crumbs: readonly Crumb[]; readonly title: string; readonly small?: boolean; readonly chips?: ReactNode }) {
  const st = useCanvasStore();
  const loc = locScope(st, sel);
  return (
    <div className={s.head}>
      <div className={s.crumb}>
        {crumbs.map((c, i) => {
          const to = c.go;
          return (
            <Fragment key={i}>
              {i > 0 && <span>›</span>}
              {to !== undefined ? (
                <button type="button" onClick={() => go(st, to)}>{c.t}</button>
              ) : (
                <span>{c.t}</span>
              )}
            </Fragment>
          );
        })}
      </div>
      <div className={s.top}>
        <h2 className={cx(s.title, small && s.small)}>{title}</h2>
        <button type="button" className={s.iconbtn} aria-label="Locate on the map" onClick={() => loc !== null && locate(st, loc)}>
          <Gl name="loc" size={16} />
        </button>
        <button
          type="button"
          className={s.iconbtn}
          aria-label="Close"
          onClick={(e) => {
            focusMap(e.currentTarget);
            st.closeSheet();
          }}
        >
          <Gl name="x" size={14} />
        </button>
      </div>
      {chips !== undefined && <div className={kit.chips}>{chips}</div>}
      <Actions sel={sel} />
    </div>
  );
}
