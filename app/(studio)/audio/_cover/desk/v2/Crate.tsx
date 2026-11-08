"use client";

// THE CRATE (prototype v2, Sleeve): every cover made so far as a sleeve, newest first, filed under the UTC day it was
// made. A sleeve carries what the owner picks a cover by: its section's waveform (./peaks.ts - drawn only from a
// decode this tab already holds), its title, its state, the brief while one is under way, and the winner's take.
// Opening one is the desk's own `open` (`?cover=<id>`); the lit edge follows the open sleeve (a shared layoutId).
import { motion, useReducedMotion } from "motion/react";

import type { CoverCard, CoverDeskView } from "@gt/domain/cover";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";

import { BRIEF_TONE, briefInFlight } from "../brief/brief.ts";
import type { Desk } from "../useDesk.ts";
import { clock, STATE_TONE } from "../words.ts";
import { peaksOf, usePeaksVersion } from "./peaks.ts";
import s from "./v2.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The UTC day a cover was made, as the crate files it: the same words on the server and in the browser. */
export function dayOf(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "undated";
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function byDay(covers: readonly CoverCard[]): readonly { readonly day: string; readonly covers: readonly CoverCard[] }[] {
  const out: { day: string; covers: CoverCard[] }[] = [];
  for (const c of covers) {
    const day = dayOf(c.record.createdAt);
    const last = out[out.length - 1];
    if (last !== undefined && last.day === day) last.covers.push(c);
    else out.push({ day, covers: [c] });
  }
  return out;
}

function Sleeve({ c, here, desk, i }: { readonly c: CoverCard; readonly here: boolean; readonly desk: Desk; readonly i: number }) {
  const r = c.record;
  const reduce = useReducedMotion() === true;
  const winner = r.winnerSeed === undefined ? undefined : r.takes.find((t) => t.seed === r.winnerSeed);
  const b = r.brief;
  return (
    <motion.li initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }} className={s.sleeveItem}>
      <a
        className={s.sleeve}
        href={desk.hrefOf(r.id)}
        aria-current={here ? "page" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          desk.open(r.id);
        }}
      >
        {here && <motion.span layoutId="v2-sleeve-edge" className={s.edge} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }} aria-hidden="true" />}
        <span className={s.sleeveWave}>
          <Wave peaks={peaksOf(r.id)} width={240} height={24} tone={r.state === "picked" ? "emerald" : "cyan"} stretch />
        </span>
        <span className={s.sleeveTitle}>{r.title}</span>
        <span className={s.sleeveFacts}>
          <Chip label={r.state} tone={STATE_TONE[r.state]} casing="lower" dot />
          {b !== undefined && briefInFlight(b) && <Chip label="brief" value={b.state} tone={BRIEF_TONE[b.state]} casing="lower" />}
          {winner !== undefined && <Chip label="take" value={winner.n} tone="emerald" casing="lower" />}
          <span className={s.count}>{`${clock(r.section.startS)}–${clock(r.section.endS)}`}</span>
        </span>
      </a>
    </motion.li>
  );
}

export function Crate({ desk, view }: { readonly desk: Desk; readonly view: CoverDeskView }) {
  usePeaksVersion();
  const here = view.current?.record.id;
  return (
    <nav className={s.crate} aria-label="covers">
      <Button label="New cover" size="sm" tone="cyan" onPress={() => desk.open(undefined)} />
      {byDay(view.covers).map((g) => (
        <section key={g.day} className={s.day} aria-label={g.day}>
          <span className={s.dayLabel}>{g.day}</span>
          <ul className={s.sleeves}>
            {g.covers.map((c) => (
              <Sleeve key={c.record.id} c={c} here={c.record.id === here} desk={desk} i={view.covers.indexOf(c)} />
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
