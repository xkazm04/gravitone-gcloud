"use client";

// A REEL'S ROAD TO THE CALENDAR - the five CHAIN steps (tables.ts) as five pips on a row, or as the steps table with
// each step's vendor and cost (the sheet and the audio desk). Port of the winner's sheet.js stepClass / chainPips /
// chainHtml. A step queued to start later lights when it starts (motion only).

import { useEffect, useState } from "react";

import type { Item, ItemAudio } from "../scene/types.ts";
import { CHAIN, CHAIN_DONE, chainIx } from "../tables.ts";
import { cx } from "./kit.tsx";
import c from "./chain.module.css";

/** done / run / next / todo, plus slot and planned: the winner's stepClass. `started`: the running step's start passed. */
export function stepClass(a: ItemAudio, i: number, started: boolean): string {
  const step = CHAIN[i];
  const run = a.run !== null && started && chainIx(a.run.key) === i;
  return cx(run ? c.run : i < a.step ? c.done : i === a.step && a.run === null ? c.next : null, step?.key === "slot" && c.slot, step?.planned === true && c.planned);
}

/** Whether the running step has started: a step queued with a delay lights when its start passes (motion only). */
function useStarted(a: ItemAudio | null): boolean {
  const t0 = a?.run?.t0 ?? null;
  const [lit, setLit] = useState<number | null>(null);
  useEffect(() => {
    if (t0 === null) return;
    const t = setTimeout(() => setLit(t0), Math.max(0, t0 - performance.now()));
    return () => clearTimeout(t);
  }, [t0]);
  return t0 !== null && lit === t0;
}

export function ChainPips({ it }: { readonly it: Item }) {
  const a = it.audio;
  const started = useStarted(a);
  if (a === null) return null;
  return (
    <span data-role="chain-pips" className={c.chainpips} role="img" aria-label={`${a.step} of ${CHAIN_DONE}: ${CHAIN.map((s) => s.name).join(", ")}`}>
      {CHAIN.map((s, i) => (
        <i key={s.key} className={stepClass(a, i, started)} title={s.name} />
      ))}
    </span>
  );
}

/** The steps table: each step, its vendor, its cost. With a reel, its steps are marked done / running / next. */
export function ChainSteps({ it = null }: { readonly it?: Item | null } = {}) {
  const a = it?.audio ?? null;
  const started = useStarted(a);
  return (
    <div data-role="steps-table" className={c.steps}>
      {CHAIN.map((s, i) => (
        <div key={s.key} className={a === null ? undefined : stepClass(a, i, started)}>
          <b>{s.name}</b>
          <span>{s.vendor}</span>
          <span>{s.cost + (s.planned ? " · planned" : "")}</span>
        </div>
      ))}
    </div>
  );
}
