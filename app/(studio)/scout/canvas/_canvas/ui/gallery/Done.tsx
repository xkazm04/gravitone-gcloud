"use client";

// NOTHING LEFT - the kind is cleared under this point: commit what is uncommitted, go to the other kind when it
// still waits, or back to the map. `Empty` is a narrowing with nothing of this kind in it.

import { scopeName } from "../../scene/scopes.ts";
import s from "../gallery.module.css";
import { cx, Kbd, kit } from "../kit.tsx";
import { KINDS, kindOf, waiting, type G, type Kind } from "./model.tsx";

export function Empty({ g }: { readonly g: G }) {
  return (
    <div className={s.done} data-role="gallery-done">
      <div>
        <b>0</b>in {scopeName(g.narrow ?? g.scope)}
      </div>
    </div>
  );
}

export function Done({ g, un, onCommit, onKind, onClose }: { readonly g: G; readonly un: number; readonly onCommit: () => void; readonly onKind: (k: Kind) => void; readonly onClose: () => void }) {
  const other = KINDS.find(([k]) => k !== g.kind && g.all.some((it) => kindOf(it) === k && waiting(it)));
  return (
    <div className={s.done} data-role="gallery-done">
      <div>
        <b>0 left</b>
        {scopeName(g.narrow ?? g.scope)}
        <div>
          {un > 0 && (
            <button type="button" className={cx(kit.btn, kit.primary)} onClick={onCommit}>
              Commit {un}
              <Kbd mode="canvas-gallery" verb="commit" />
            </button>
          )}
          {other !== undefined && (
            <button type="button" className={cx(kit.btn, kit.amberBtn)} onClick={() => onKind(other[0])}>
              {other[1]} {g.all.filter((it) => kindOf(it) === other[0] && waiting(it)).length}
            </button>
          )}
          <button type="button" className={kit.btn} onClick={onClose}>
            Back to the map
            <Kbd cap="Esc" />
          </button>
        </div>
      </div>
    </div>
  );
}
