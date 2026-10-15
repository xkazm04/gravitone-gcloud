// HOW AN ACT READS - the words and colours the Ledger draws for an event, pure and
// client-safe (the list, the detail, the kit specimen and the tests read the same rules).
//
// A type's tone is the prototype's (ledger-data.js TYPES + typeInfo): one meaning per hue
// from tokens.css - cyan a run moving, emerald kept or committed, rose failed or rejected,
// violet a judgement, amber at the gate. The table names the types the v1 projection emits
// today; anything else falls to the same keyword rule the prototype used, so a source
// added in Phase 2 wave B reads sensibly before anyone extends this table.

import type { Cost, Event } from "@gt/domain/event";
import type { Tone } from "@gt/ui/components/chip/tone.ts";

const TONE: Readonly<Record<string, Tone>> = {
  "run.start": "cyan",
  "run.log": "neutral",
  "run.status": "neutral",
  "run.stop": "amber",
  "run.end": "cyan",
  "candidate.grade": "neutral",
  "judge.pick": "violet",
  "verdict.keep": "emerald",
  "verdict.reject": "rose",
  "gate.arrive": "amber",
  commit: "emerald",
  "ingest.skip": "amber",
  "ingest.fail": "rose",
};

export function toneOf(type: string): Tone {
  const known = TONE[type];
  if (known !== undefined) return known;
  if (/fail|reject|miss|block/.test(type)) return "rose";
  if (/keep|\.ok|ratif|commit|lock|approve|accept/.test(type)) return "emerald";
  if (/^gate/.test(type)) return "amber";
  return "neutral";
}

/** When the act happened, if known, else when the ledger recorded it (@gt/domain eventTime). */
export const timeOf = (e: Pick<Event, "at" | "occurredAt">): string => e.occurredAt ?? e.at;

/** `10-14 09:12` (ledger.js fmtT): month-day and minute, UTC. */
export const shortTime = (iso: string): string => `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;

export const isDerived = (e: Pick<Event, "atSrc">): boolean => e.atSrc === "derived";

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** What trails the subject in a row: the verbatim error, else the reason, else the note. */
export function trailOf(e: Pick<Event, "data">): { readonly text: string; readonly error: boolean } | undefined {
  const err = text(e.data["error"]);
  if (err !== null) return { text: err, error: true };
  const t = text(e.data["reason"]) ?? text(e.data["note"]);
  return t === null ? undefined : { text: t, error: false };
}

/** The act belongs to the fixture universe (every v1 projection stamps `data.src`). */
export const isFixture = (e: Pick<Event, "data">): boolean => e.data["src"] === "fixture";

export type CostSplit = { readonly total: number; readonly priced: number; readonly bySrc: Readonly<Partial<Record<Cost["src"], number>>> };

/** The cost of a set of acts, split by where each figure came from (ledger.js renderTop). */
export function costOf(events: readonly Pick<Event, "cost">[]): CostSplit {
  let total = 0;
  let priced = 0;
  const bySrc: Partial<Record<Cost["src"], number>> = {};
  for (const e of events) {
    if (e.cost === undefined) continue;
    total += e.cost.usd;
    priced++;
    bySrc[e.cost.src] = (bySrc[e.cost.src] ?? 0) + e.cost.usd;
  }
  return { total, priced, bySrc };
}

/** `2d 4h before NOW` (ledger.js rel): how far an instant is from the clock the page was drawn at. */
export function relative(iso: string, nowMs: number): string {
  const d = Date.parse(iso) - nowMs;
  const m = Math.round(Math.abs(d) / 60_000);
  const h = Math.floor(m / 60);
  const days = Math.floor(h / 24);
  const s = days >= 2 ? `${days}d ${h % 24}h` : h >= 1 ? `${h}h ${m % 60}m` : `${m}m`;
  return d <= 0 ? `${s} before NOW` : `${s} after NOW`;
}

/** The detail's fields: every `data` value a person might paste elsewhere, verbatim. */
export function fieldsOf(e: Event): { readonly term: string; readonly value: string }[] {
  const out: { term: string; value: string }[] = [{ term: "seq", value: String(e.seq) }];
  if (e.key !== undefined) out.push({ term: "key", value: e.key });
  if (e.lane !== undefined) out.push({ term: "lane", value: e.lane });
  for (const [k, v] of Object.entries(e.data)) {
    if (k === "error" || k === "note" || k === "reason") continue;
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push({ term: k, value: String(v) });
    else out.push({ term: k, value: JSON.stringify(v) });
  }
  out.push({ term: "recorded", value: e.at });
  return out;
}
