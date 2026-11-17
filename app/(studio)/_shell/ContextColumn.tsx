"use client";

// A ROUTE'S CONTEXT COLUMN (design baseline §1a): beside the spine, the open section's rooms - one row each, a
// tally as a quiet mono number - and under the current room its stages as a numbered descent. The same row and the
// same "here" mark at every level, so app > room > stage reads as one tree; the mark glides between rows
// (`layoutId`, one spring) and stands still under reduced motion. The model is ./navModel.ts: every current item
// is the address's, nothing is held here.
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import type { NavItem, Rooms } from "./navModel.ts";
import { PendingMark } from "./NavLink.tsx";
import c from "./ContextColumn.module.css";

export const GLIDE = { type: "spring", stiffness: 520, damping: 42 } as const;

export function ContextColumn({ rooms }: { readonly rooms: Rooms }) {
  const reduce = useReducedMotion();
  const glide = reduce === true ? { duration: 0 } : GLIDE;
  return (
    <nav className={c.column} aria-label={`${rooms.title} rooms`} data-component="ContextColumn">
      <div className={c.head}>
        <span className={c.title}>{rooms.title}</span>
        {rooms.kinds !== null && <Kinds kinds={rooms.kinds} />}
      </div>
      <ol className={c.list}>
        {rooms.rooms.map((r) => (
          <li key={r.id} className={c.li}>
            <Link className={c.row} href={r.href} prefetch={false} aria-current={r.current ? "page" : undefined}>
              {r.current && <motion.span layoutId="ctx-here" className={c.here} transition={glide} aria-hidden="true" />}
              <span className={c.name}>{r.label}</span>
              {r.tally !== undefined && <RowTally tally={r.tally} />}
              <PendingMark />
            </Link>
            {r.current && rooms.stages !== null && <Stages stages={rooms.stages} glide={glide} />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function RowTally({ tally }: { readonly tally: NonNullable<NavItem["tally"]> }) {
  return (
    <span className={c.tally} data-zero={tally.value === 0 ? "" : undefined} aria-label={`${tally.value} ${tally.label}`}>
      {tally.value}
      <span className={c.tallyLabel} aria-hidden="true">
        {tally.label}
      </span>
    </span>
  );
}

function Stages({ stages, glide }: { readonly stages: readonly NavItem[]; readonly glide: object }) {
  return (
    <ol className={c.stages} aria-label="stage">
      {stages.map((st, i) => (
        <li key={st.id}>
          <Link className={c.stage} href={st.href} prefetch={false} aria-current={st.current ? "step" : undefined}>
            {st.current && <motion.span layoutId="ctx-stage" className={c.stageHere} transition={glide} aria-hidden="true" />}
            <span className={c.stageNo} aria-hidden="true">
              {i + 1}
            </span>
            <span className={c.stageName}>{st.label}</span>
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
