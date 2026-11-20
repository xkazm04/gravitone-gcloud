// THE TABLE DOOR - the one place a reel's numbers enter. Everything a reel shows was read here first: a table
// that does not say where it came from, under what licence, and with one value per real observation is refused
// before anything is planned or drawn.

import type { ReelEntity, ReelEvent, ReelSource, ReelTable } from "./types";

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const https = (x: unknown): x is string => typeof x === "string" && /^https:\/\/\S+$/.test(x);

export const TITLE_MAX = 60;
export const FACT_MAX = 140;
export const ENTITIES_MAX = 60;

function parseSource(raw: unknown): ReelSource | string {
  if (!isObj(raw)) return "source is not an object";
  if (!text(raw["name"], 120)) return "source.name is missing (the line the screen shows)";
  if (!https(raw["url"])) return "source.url is not an https url";
  if (!text(raw["licence"], 120)) return "source.licence is missing: state it as the source does, never guess one";
  if (typeof raw["fetchedAt"] !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(raw["fetchedAt"])) return "source.fetchedAt is not an ISO date";
  return { name: raw["name"], url: raw["url"], licence: raw["licence"], fetchedAt: raw["fetchedAt"] };
}

function parseEntity(raw: unknown, at: number, periods: number): ReelEntity | string {
  if (!isObj(raw)) return `entities[${at}] is not an object`;
  if (!text(raw["id"], 40) || !/^[a-z0-9][a-z0-9-]*$/.test(raw["id"])) return `entities[${at}].id is not a lower-case slug`;
  if (!text(raw["name"], 40)) return `entities[${at}].name is missing or over 40 characters`;
  const values = raw["values"];
  if (!Array.isArray(values) || values.length !== periods) return `entity '${raw["id"]}' has ${Array.isArray(values) ? values.length : "no"} values for ${periods} periods`;
  for (const v of values) if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return `entity '${raw["id"]}' has a value that is not a finite number >= 0 or null`;
  return { id: raw["id"], name: raw["name"], values: values as (number | null)[] };
}

function parseEvent(raw: unknown, at: number, periods: number): ReelEvent | string {
  if (!isObj(raw)) return `events[${at}] is not an object`;
  if (!text(raw["id"], 40)) return `events[${at}].id is missing`;
  const period = raw["period"];
  if (typeof period !== "number" || !Number.isInteger(period) || period < 0 || period >= periods) return `event '${raw["id"]}' period is outside 0..${periods - 1}`;
  if (!text(raw["title"], TITLE_MAX)) return `event '${raw["id"]}' title is missing or over ${TITLE_MAX} characters`;
  if (!text(raw["date"], 40)) return `event '${raw["id"]}' date is missing`;
  if (!text(raw["fact"], FACT_MAX)) return `event '${raw["id"]}' fact is missing or over ${FACT_MAX} characters`;
  if (!https(raw["url"])) return `event '${raw["id"]}' url is not an https url: a card with no place to read its fact is a claim`;
  return { id: raw["id"], period, title: raw["title"], date: raw["date"], fact: raw["fact"], url: raw["url"] };
}

/** The table, or one sentence saying what is wrong with it. */
export function parseTable(raw: unknown): ReelTable | string {
  if (!isObj(raw)) return "the table is not an object";
  if (raw["v"] !== 1) return "v is not 1";
  if (!text(raw["unit"], 40)) return "unit is missing (what one value counts)";
  if (!text(raw["granularity"], 20)) return "granularity is missing (what one period is)";
  if (typeof raw["cumulative"] !== "boolean") return "cumulative is not true or false";
  const periods = raw["periods"];
  if (!Array.isArray(periods) || periods.length < 2) return "periods needs at least 2 labels";
  for (const p of periods) if (!text(p, 24)) return "a period label is empty or over 24 characters";
  const source = parseSource(raw["source"]);
  if (typeof source === "string") return source;
  const rawEntities = raw["entities"];
  if (!Array.isArray(rawEntities) || rawEntities.length === 0) return "entities is empty";
  if (rawEntities.length > ENTITIES_MAX) return `entities holds ${rawEntities.length}; the cap is ${ENTITIES_MAX}`;
  const entities: ReelEntity[] = [];
  for (const [i, e] of rawEntities.entries()) {
    const parsed = parseEntity(e, i, periods.length);
    if (typeof parsed === "string") return parsed;
    if (entities.some((x) => x.id === parsed.id)) return `entity id '${parsed.id}' appears twice`;
    entities.push(parsed);
  }
  const rawEvents = raw["events"] ?? [];
  if (!Array.isArray(rawEvents)) return "events is not a list";
  const events: ReelEvent[] = [];
  for (const [i, e] of rawEvents.entries()) {
    const parsed = parseEvent(e, i, periods.length);
    if (typeof parsed === "string") return parsed;
    if (events.some((x) => x.id === parsed.id)) return `event id '${parsed.id}' appears twice`;
    events.push(parsed);
  }
  if (raw["cumulative"]) {
    for (const e of entities) {
      let prev = 0;
      for (const v of e.values) {
        if (v !== null && v < prev) return `entity '${e.id}' falls from ${prev} to ${v}, but the table says cumulative`;
        if (v !== null) prev = v;
      }
    }
  }
  return { v: 1, unit: raw["unit"], granularity: raw["granularity"], cumulative: raw["cumulative"], periods: periods as string[], entities, events, source };
}

/** JSON with every object's keys sorted: two values are the same content exactly when their texts are equal. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObj(value)) {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** One entity's value at a period: a missing observation counts as 0 for ordering. */
export const valueAt = (e: ReelEntity, i: number): number => e.values[i] ?? 0;
