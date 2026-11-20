// THE CONTINUITY GATE, MEASURED. Registry: media-generation data-video-virality / continuity-gate.
//
// A narration-free chart holds attention only while the screen keeps changing in ways the viewer can follow:
// many real data steps, many entities moving against each other, a lead that changes hands. That is a property
// of the TABLE, so it is counted here, on the table, before a page is written - an estimate in an idea note
// ("about 1,150 races, six leaders") is a hope until this function has run on the real rows.
//
// The floors are the technique's: about 60 real steps for sub-annual or per-event data; for yearly data a long
// series (about 100 years) and at least ten entities; five entities on screen; two lead changes; about fifteen
// visible movements; 5 to 15 dated events. They gate, and the CLI refuses under them. The operator may still
// take a thin table forward with a written reason, because the floors describe what usually holds a viewer and
// the operator is the one who answers for the exception.

import { defaultHysteresis, endOnTruth, stickyOrders } from "./order";
import { valueAt } from "./table";
import type { Continuity, ReelTable } from "./types";

export const FLOORS = { steps: 60, yearlySteps: 100, yearlyEntities: 10, cast: 5, leadChanges: 2, movements: 15, eventsMin: 5, eventsMax: 15 } as const;
export const TOP_N = 10;

const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/** The order the viewer sees, per period, as entity indices (sticky, ending on the truth). */
export function viewerOrders(table: ReelTable): number[][] {
  const P = table.periods.length;
  const series = table.entities.map((e) => table.periods.map((_, i) => valueAt(e, i)));
  let axisMax = 0;
  for (const s of series) for (const v of s) axisMax = Math.max(axisMax, v);
  // A running total only ever rises, so two rows cannot flip back and forth: a one-win lead is a real lead and
  // is drawn the period it happens (measured on 1,149 F1 races: the 6% margin hid Clark's 1968 lead entirely
  // and showed Hamilton on top seven months after he passed Schumacher). Volumes and shares do flicker, and
  // keep the margin.
  const orders = stickyOrders(series, P, table.cumulative ? { rel: 0, abs: 0 } : defaultHysteresis(axisMax > 0 ? axisMax : 1));
  endOnTruth(orders, series.map((s) => s[P - 1] ?? 0));
  return orders;
}

export function measureContinuity(table: ReelTable, topN: number = TOP_N): Continuity {
  const P = table.periods.length;
  const orders = viewerOrders(table);
  const value = (e: number, i: number): number => valueAt(table.entities[e] as ReelTable["entities"][number], i);
  const top = (i: number): number[] => (orders[i] as number[]).slice(0, topN).filter((e) => value(e, i) > 0);

  const leaders: { entity: string; from: string }[] = [];
  let leader: number | undefined;
  let movements = 0;
  const onScreen: number[] = [];
  let prev: number[] = [];
  for (let i = 0; i < P; i++) {
    const cur = top(i);
    onScreen.push(cur.length);
    // A leader is an entity with a value: the arbitrary first row of an all-zero start is nobody's lead.
    const first = cur[0];
    if (first !== undefined && first !== leader) {
      leaders.push({ entity: (table.entities[first] as ReelTable["entities"][number]).name, from: table.periods[i] as string });
      leader = first;
    }
    const was = new Map(prev.map((e, r) => [e, r]));
    for (let r = 0; r + 1 < cur.length; r++) {
      const a = was.get(cur[r] as number);
      const b = was.get(cur[r + 1] as number);
      if (a !== undefined && b !== undefined && a > b) movements++;
    }
    prev = cur;
  }

  const yearly = /^year/i.test(table.granularity);
  const leadChanges = Math.max(0, leaders.length - 1);
  const cast = median(onScreen);
  const failures: string[] = [];
  if (yearly) {
    if (P < FLOORS.yearlySteps) failures.push(`${P} yearly steps; yearly data needs about ${FLOORS.yearlySteps} (a few decades of yearly points jump instead of move)`);
    if (table.entities.length < FLOORS.yearlyEntities) failures.push(`${table.entities.length} entities; yearly data needs at least ${FLOORS.yearlyEntities} moving at once`);
  } else if (P < FLOORS.steps) failures.push(`${P} real ${table.granularity} steps; the floor is ${FLOORS.steps}`);
  if (cast < FLOORS.cast) failures.push(`${cast} entities on screen at the median period; the floor is ${FLOORS.cast}`);
  if (leadChanges < FLOORS.leadChanges) failures.push(`${leadChanges} lead change(s); the floor is ${FLOORS.leadChanges} (frame the race on the chasers, or drop it)`);
  if (movements < FLOORS.movements) failures.push(`${movements} overtakes inside the top ${topN}; the floor is ${FLOORS.movements}`);
  const n = table.events.length;
  if (n < FLOORS.eventsMin || n > FLOORS.eventsMax) failures.push(`${n} dated events; a reel carries ${FLOORS.eventsMin} to ${FLOORS.eventsMax}`);

  return { ok: failures.length === 0, steps: P, entities: table.entities.length, onScreen: cast, leadChanges, movements, events: n, leaders, failures };
}
