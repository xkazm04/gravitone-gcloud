// THE PRODUCE SURFACES' PURE RULES - how a figure is written, what a receipt changed, what a
// ceiling admits. Shared by the composer's Estimate, the Receipt, the model picker, the plan
// table and the re-route list, so a cost reads the same on every one of them.
//
// The prototype wrote these inline per renderer (projects.js `optLabel`, `money`, `rel`,
// studio.js `fmtDur`, `fmtUsd`) and two of them disagreed: the plan row drew a range as
// `$47–92` while the re-route list drew the same option's midpoint. Here a cost is ONE shape -
// a priced figure, a band, or unpriced with its reason (@gt/domain/produce) - and one writer.
// Upgraded from the prototype: a sub-cent spend never reads `$0` (status-vocabulary/number-
// formatting: sub-unit spend rendering as zero), and an unpriced figure is never a dollar sign.

import type { ModelOption, PlanPart, Receipt, ReceiptLine, WorkPlanPart } from "@gt/domain/produce";

/** Seconds as the prototype's compact duration: `38m`, `1h 04m`, `3d`. Under a minute is `<1m`. */
export function fmtDur(seconds: number): string {
  if (seconds <= 0) return "0m";
  const min = Math.round(seconds / 60);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 48) return `${Math.round(h / 24)}d`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Dollars: `$0`, `<$0.01`, `$0.24`, `$4.80`, `$69`. */
export function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "<$0.01";
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n)}`;
}

/**
 * One end of a band, rounded OUTWARD (`down` for the low end, up for the high one), in fmtUsd's
 * grain: whole dollars from $10, cents under it, `<$0.01` for a sub-cent end. A band is a bound,
 * and a bound rounded inward is a smaller worst case than the one the job may spend: the old
 * `Math.round` drew a $6.80-54.40 band as `$7–54` and a sub-dollar one as `$0–0`.
 */
function bandEnd(n: number, down: boolean): string {
  if (n === 0) return "$0";
  if (n < 0.01) return down ? "<$0.01" : "$0.01";
  const grain = n < 10 ? 100 : 1;
  const v = (down ? Math.floor : Math.ceil)(Math.round(n * grain * 1e6) / 1e6) / grain;
  return v < 10 ? `$${v.toFixed(2)}` : `$${v}`;
}

/** A band as the prototype drew it: `$47–92`; under $10 in cents (`$1.70–6.80`), never `$0–0`. */
export const fmtRange = (r: readonly [number, number]): string => `${bandEnd(r[0], true)}–${bandEnd(r[1], false).slice(1)}`;

export type Cost = { readonly usd: number | null; readonly usdRange?: readonly [number, number]; readonly unpricedReason?: string };

/** One cost in words: the band when there is one, else the figure, else `unpriced`. */
export function costWords(c: Cost): string {
  if (c.usdRange !== undefined) return fmtRange(c.usdRange);
  return c.usd === null ? "unpriced" : fmtUsd(c.usd);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What an option costs for `units` (the prototype's `o.usd * n`, kept to the cent). */
export function optionCost(o: ModelOption, units: number): Cost {
  const n = Math.max(1, units);
  return {
    usd: o.usdPerUnit === null ? null : round2(o.usdPerUnit * n),
    ...(o.usdRangePerUnit === undefined ? {} : { usdRange: [o.usdRangePerUnit[0] * n, o.usdRangePerUnit[1] * n] as const }),
    ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
  };
}

/** The picker's words for an option: `model · lane — time · $` (projects.js `optLabel`). */
export function optionLabel(o: ModelOption, units: number, laneName: string): string {
  return `${o.label} · ${laneName} — ${fmtDur(o.secondsPerUnit * Math.max(1, units))} · ${costWords(optionCost(o, units))}`;
}

/** A signed duration: `+12m`, `−5m`, `±0` (projects.js `rel`). */
export function relDur(seconds: number): string {
  if (Math.abs(seconds) < 60) return "±0";
  return `${seconds > 0 ? "+" : "−"}${fmtDur(Math.abs(seconds))}`;
}

/** A signed cost: `+$0.24`, `−$1.20`, `±$0`. */
export function relUsd(d: number): string {
  if (Math.abs(d) < 0.005) return "±$0";
  return `${d > 0 ? "+" : "−"}${fmtUsd(Math.abs(d))}`;
}

/**
 * Which way a delta leans for the operator, read off the words drawn for it (relDur, relUsd):
 * later or dearer is `bad`. Read from the words, not from a second threshold, so a tone can never
 * call `±$0` dearer - it did, with `lean(d, 0.004)` beside relUsd's 0.005 and `lean(s, 59)` beside
 * relDur's 60.
 */
export const leanOf = (words: string): "good" | "bad" | "even" => (words.startsWith("+") ? "bad" : words.startsWith("−") ? "good" : "even");

export const isWork = (p: PlanPart): p is WorkPlanPart => p.kind !== "gate" && p.kind !== "slot";

/* ── the receipt ──────────────────────────────────────────────────────────── */

export type LineField = "lane" | "model" | "units" | "seconds" | "cost" | "src" | "queuePos" | "start";
export type TotalField = "seconds" | "cost" | "src" | "queuePos" | "etaAt" | "mode";

export type ReceiptChanges = {
  readonly lines: ReadonlyMap<string, ReadonlySet<LineField>>;
  readonly added: readonly string[];
  /** A line the fresh receipt no longer has, named as the operator read it (its label, not its
   *  key: a project's part key is `<projectId>/<part>`). */
  readonly removed: readonly { readonly key: string; readonly label: string }[];
  readonly totals: ReadonlySet<TotalField>;
};

export const NO_CHANGES: ReceiptChanges = { lines: new Map(), added: [], removed: [], totals: new Set() };

/** The short kind of an unpriced figure, from its reason (what the `Unpriced` chip draws). */
export function unpricedKind(reason: string | undefined): "seat" | "credits" | "no price" {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("seat")) return "seat";
  if (r.includes("credit") || r.includes("subscription")) return "credits";
  return "no price";
}

/** Two costs read the same: the same words, and for an unpriced one the same drawn kind. */
const sameCost = (a: Cost, b: Cost): boolean => costWords(a) === costWords(b) && (a.usd !== null || unpricedKind(a.unpricedReason) === unpricedKind(b.unpricedReason));

function lineDiff(a: ReceiptLine, b: ReceiptLine): Set<LineField> {
  const out = new Set<LineField>();
  if (a.lane !== b.lane) out.add("lane");
  if (a.model !== b.model || a.provider !== b.provider) out.add("model");
  if (a.units !== b.units) out.add("units");
  if (fmtDur(a.seconds) !== fmtDur(b.seconds)) out.add("seconds");
  if (!sameCost(a, b)) out.add("cost");
  if (a.src !== b.src) out.add("src");
  if (a.queuePos !== b.queuePos) out.add("queuePos");
  if (a.start !== b.start) out.add("start");
  return out;
}

/**
 * What moved between the receipt the operator read and the one the server reads now (a stale
 * confirm). Compared as the operator READ it - a duration or a cost that formats the same is
 * not a change worth stopping them for - so the fresh receipt marks exactly what they would see
 * differ.
 */
export function receiptChanges(before: Receipt, after: Receipt): ReceiptChanges {
  const was = new Map(before.lines.map((l) => [l.key, l]));
  const now = new Map(after.lines.map((l) => [l.key, l]));
  const lines = new Map<string, ReadonlySet<LineField>>();
  for (const [k, b] of now) {
    const a = was.get(k);
    if (a === undefined) continue;
    const d = lineDiff(a, b);
    if (d.size > 0) lines.set(k, d);
  }
  const totals = new Set<TotalField>();
  if (fmtDur(before.totals.seconds) !== fmtDur(after.totals.seconds)) totals.add("seconds");
  if (!sameCost(before.totals, after.totals) || before.totals.unpriced !== after.totals.unpriced) totals.add("cost");
  if (before.totals.src !== after.totals.src) totals.add("src");
  if (before.queuePos !== after.queuePos) totals.add("queuePos");
  if (before.etaAt !== after.etaAt) totals.add("etaAt");
  if (before.mode !== after.mode) totals.add("mode");
  return {
    lines,
    added: [...now.keys()].filter((k) => !was.has(k)),
    removed: before.lines.filter((l) => !now.has(l.key)).map((l) => ({ key: l.key, label: l.label })),
    totals,
  };
}

/**
 * Does the receipt's total carry a price at all? Not when every line is unpriced: then its `usd`
 * is a 0 nobody measured, and an unpriced figure is never a dollar sign. The Estimate and the
 * Receipt both read this, so the line above Launch and the receipt behind it cannot disagree.
 */
export const totalPriced = (r: Pick<Receipt, "totals" | "lines">): boolean => r.totals.usdRange !== undefined || r.totals.unpriced < r.lines.length;

export const changeCount = (c: ReceiptChanges): number => c.lines.size + c.added.length + c.removed.length + c.totals.size;

/** The ceiling field's text as dollars: empty is no ceiling; anything else must be an amount >= 0. */
export function parseCeiling(text: string): { readonly ok: true; readonly value: number | undefined } | { readonly ok: false; readonly error: string } {
  const t = text.trim().replace(/^\$/, "");
  if (t === "") return { ok: true, value: undefined };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || !/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, error: "a dollar amount, like 12 or 4.50" };
  return { ok: true, value: n };
}

/**
 * May the job stop at the ceiling? A ceiling is a STOP POINT, not a launch gate (v1 extract's
 * rule, Director's ruling 2026-10-16): the kernel stops before the unit that would cross it, so a
 * receipt over its ceiling still confirms - and says so. The band's top end is what is held
 * against it: a band that MAY cross does (the worst case is the one the operator must see).
 * Unpriced lines never cross a USD ceiling (COMMON decision 7); they are counted on their lines.
 */
export function mayStopAtCeiling(r: Pick<Receipt, "totals">, ceiling: number | undefined): boolean {
  if (ceiling === undefined) return false;
  const top = r.totals.usdRange?.[1] ?? r.totals.usd;
  return top > ceiling + 1e-9;
}

/**
 * The worst case and the ceiling it crosses, as two figures that differ: in fmtUsd's grain when
 * that tells them apart, else both in cents - `$54 over $54` is a crossing that reads as none.
 */
export function overWords(worst: number, ceiling: number): readonly [string, string] {
  const a = fmtUsd(worst);
  const b = fmtUsd(ceiling);
  return a !== b ? [a, b] : [`$${worst.toFixed(2)}`, `$${ceiling.toFixed(2)}`];
}

/** `09:12` today, `Thu 09:12` on another day, both UTC (the day-line's clock). */
export function when(iso: string, nowMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const hm = d.toISOString().slice(11, 16);
  const same = d.toISOString().slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10);
  return same ? hm : `${d.toUTCString().slice(0, 3)} ${hm}`;
}
