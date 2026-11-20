"use client";

// THE GALLERY'S RAIL - the point it opened on, then each basin and its rivers that hold this kind, north to south,
// each with what still waits there. A row narrows the wall to it.

import { cut } from "../../scene/geo.ts";
import { scopeName } from "../../scene/scopes.ts";
import type { Basin, Item, River, Scene } from "../../scene/types.ts";
import s from "../gallery.module.css";
import { cx } from "../kit.tsx";
import { kindOf, left, riverName, type G, type Narrow } from "./model.tsx";

function Count({ pool, f }: { readonly pool: readonly Item[]; readonly f: (it: Item) => boolean }) {
  const n = left(pool.filter(f));
  return <span className={cx(s.n, n === 0 && s.zero)}>{n}</span>;
}

export function Rail({ g, scene, onNarrow }: { readonly g: G; readonly scene: Scene; readonly onNarrow: (n: Narrow) => void }) {
  const pool = g.all.filter((it) => kindOf(it) === g.kind);
  const rows = scene.basins
    .map((b: Basin) => ({ b, rs: b.rivers.filter((r: River) => pool.some((it) => it.river === r)).sort((p, q) => p.y0 - q.y0) }))
    .filter((x) => x.rs.length > 0);
  return (
    <nav className={s.rail} aria-label="Basins and rivers" data-role="gallery-rail">
      <button type="button" className={cx(s.l0, g.narrow === null && s.on)} aria-pressed={g.narrow === null} onClick={() => onNarrow(null)}>
        {scopeName(g.scope)}
        <Count pool={pool} f={() => true} />
      </button>
      <hr />
      {rows.map(({ b, rs }) => [
        <button key={b.key} type="button" className={cx(s.l1, g.narrow !== null && g.narrow.ref === b && s.on)} aria-pressed={g.narrow !== null && g.narrow.ref === b} onClick={() => onNarrow({ type: "basin", ref: b })}>
          {b.name}
          <Count pool={pool} f={(it) => it.river.basin === b.key} />
        </button>,
        ...rs.map((r) => (
          <button key={r.key} type="button" className={cx(s.l2, g.narrow !== null && g.narrow.ref === r && s.on)} aria-pressed={g.narrow !== null && g.narrow.ref === r} title={riverName(r)} onClick={() => onNarrow({ type: "river", ref: r })}>
            {cut(riverName(r), 30)}
            <Count pool={pool} f={(it) => it.river === r} />
          </button>
        )),
      ])}
    </nav>
  );
}
