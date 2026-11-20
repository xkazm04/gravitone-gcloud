"use client";

// THE GALLERY'S TOP BAR - where in the gallery (the crumb, each part a way back up), the kind (outputs or seeds, each
// with what waits), the tally of kept, rejected and left, the left count that falls with every verdict, and close.

import { Fragment } from "react";

import { cut } from "../../scene/geo.ts";
import { scopeName } from "../../scene/scopes.ts";
import s from "../gallery.module.css";
import { cx, Gl, kit, StackBar } from "../kit.tsx";
import { cur, KINDS, kindOf, left, riverName, verdictOf, waiting, type G, type Kind } from "./model.tsx";

export type CrumbKey = "root" | "wall" | "river" | "one" | "frame";

function crumbs(g: G): readonly (readonly [string, CrumbKey])[] {
  const it = cur(g);
  const parts: [string, CrumbKey][] = [[scopeName(g.scope), "root"]];
  if (g.narrow !== null) parts.push([g.narrow.type === "river" ? riverName(g.narrow.ref) : g.narrow.ref.name, "wall"]);
  else if (g.mode !== "wall" && it !== undefined && !(g.scope.type === "river" && g.scope.ref === it.river) && g.scope.type !== "item") parts.push([riverName(it.river), "river"]);
  if (g.mode !== "wall" && it !== undefined) parts.push([cut(it.short ?? it.label, 46), "one"]);
  if (g.mode === "frame" && it !== undefined && it.media !== null) parts.push([`frame ${g.frame + 1} of ${it.media.files.length}`, "frame"]);
  return parts;
}

export function Top({ g, fall, onCrumb, onKind, onClose }: { readonly g: G; readonly fall: number; readonly onCrumb: (k: CrumbKey) => void; readonly onKind: (k: Kind) => void; readonly onClose: () => void }) {
  const n = left(g.list);
  const dec = g.list.length - n;
  const kept = g.list.filter((it) => verdictOf(it) === "kept").length;
  return (
    <div className={s.top}>
      <nav className={s.crumb} aria-label="Where in the gallery">
        {crumbs(g).map(([t, k], i) => (
          <Fragment key={k}>
            {i > 0 && <span className={s.sep}>›</span>}
            <button type="button" data-crumb={k} onClick={() => onCrumb(k)}>
              {t}
            </button>
          </Fragment>
        ))}
      </nav>
      <div className={kit.seg} role="tablist" aria-label="Kind">
        {KINDS.map(([k, w]) => {
          if (!g.all.some((it) => kindOf(it) === k)) return null;
          const c = g.all.filter((it) => kindOf(it) === k && waiting(it)).length;
          return (
            <button key={k} type="button" role="tab" aria-selected={g.kind === k} data-kind={k} className={cx(g.kind === k && kit.on)} onClick={() => onKind(k)}>
              {w} {c}
            </button>
          );
        })}
      </div>
      <div className={s.tally}>
        <StackBar
          parts={[
            [kept, "emerald"],
            [dec - kept, "rose"],
            [n, "amber", 0.5],
          ]}
          label={`${kept} kept, ${dec - kept} rejected, ${n} left`}
        />
      </div>
      <div className={s.left}>
        <b key={fall} data-role="left-count" className={cx(n === 0 && s.zero, fall > 0 && s.fall)}>
          {n}
        </b>
        left
      </div>
      <button type="button" className={s.iconbtn} data-x aria-label="Close" onClick={onClose}>
        <Gl name="x" size={14} />
      </button>
    </div>
  );
}
