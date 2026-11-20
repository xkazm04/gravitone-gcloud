"use client";

// A ROUTE'S CONTEXT COLUMN (design baseline §1a; re-cut on the Library rail's model in P4, 2026-11-17): beside the
// spine, the open section's rooms in their groups - a mark, a capitalised word, a count - and under the current room
// its stages as a numbered descent. It stands in @gt/ui's NavColumn, the material every route's own column uses
// (the Library's vocabulary, the Ledger's facets, the Projects' compositions), so the four read as one app. The lit
// ground glides between rows (./glide.tsx, the browser's own animation) and stands still under reduced motion. The model is
// ./navModel.ts: every current item is the address's, nothing is held here.
import Link from "next/link";

import { RoomGlyph } from "@gt/ui/components/glyph/RoomGlyph.tsx";
import { NavColumn, NavGroup, navRow as n } from "@gt/ui/components/navcolumn/NavColumn.tsx";

import type { NavItem, Rooms } from "./navModel.ts";
import { Here } from "./glide.tsx";
import { PendingMark } from "./NavLink.tsx";
import c from "./ContextColumn.module.css";

export function ContextColumn({ rooms }: { readonly rooms: Rooms }) {
  return (
    <NavColumn as="nav" className={c.column} title={rooms.title} label={`${rooms.title} rooms`} {...(rooms.kinds !== null ? { toolbar: <Kinds kinds={rooms.kinds} /> } : {})}>
      {rooms.groups.map((g) => (
        <NavGroup key={g.id} {...(g.label !== null ? { label: g.label } : {})}>
          {g.items.map((r) => (
            <li key={r.id}>
              <Link className={n.row} href={r.href} prefetch={false} aria-current={r.current ? "page" : undefined}>
                {r.current && <Here mark="ctx" className={n.here} />}
                {r.glyph !== undefined && <RoomGlyph name={r.glyph} className={n.mark} />}
                <span className={n.label}>{r.label}</span>
                {r.tally !== undefined && <RowCount tally={r.tally} />}
                <PendingMark />
              </Link>
              {r.current && rooms.stages !== null && <Stages stages={rooms.stages} />}
            </li>
          ))}
        </NavGroup>
      ))}
    </NavColumn>
  );
}

/** The count alone, as the Library's rail draws it; what it counts is the spoken name. */
function RowCount({ tally }: { readonly tally: NonNullable<NavItem["tally"]> }) {
  return (
    <span className={tally.value === 0 ? `${n.count} ${n.zero}` : n.count} aria-label={`${tally.value} ${tally.label}`}>
      {tally.value}
    </span>
  );
}

function Stages({ stages }: { readonly stages: readonly NavItem[] }) {
  return (
    <ol className={n.stages} aria-label="stage">
      {stages.map((st, i) => (
        <li key={st.id}>
          <Link className={n.stage} href={st.href} prefetch={false} aria-current={st.current ? "step" : undefined}>
            {st.current && <Here mark="ctx-stage" className={n.stageHere} />}
            <span className={n.stageNo} aria-hidden="true">
              {i + 1}
            </span>
            <span>{st.label}</span>
            <PendingMark />
          </Link>
        </li>
      ))}
    </ol>
  );
}

function Kinds({ kinds }: { readonly kinds: readonly NavItem[] }) {
  return (
    <span className={c.kinds} role="group" aria-label="kind">
      {kinds.map((k) => (
        <Link key={k.id} className={c.kind} href={k.href} prefetch={false} aria-current={k.current ? "page" : undefined}>
          {k.label}
        </Link>
      ))}
    </span>
  );
}
