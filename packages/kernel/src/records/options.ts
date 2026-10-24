import { PART_OPTIONS, type OptionDecl, type PaceDecl, type UsdDecl } from "@gt/catalog/partOptions";
import type { WorkKind } from "@gt/catalog/recipes";
import { AppError } from "@gt/domain/errors";
import { resourceLaneSchema, type ResourceLane } from "@gt/domain/lane";
import type { Basis, FigureSource, ModelOption } from "@gt/domain/produce";
import { weakest } from "@gt/domain/plan";
import { quote, type Usage } from "../pricing/quote.ts";
import { PRICE_TABLE, PRICE_UNITS, type PriceRow, type PriceUnit } from "../pricing/table.ts";
import { TABLES } from "../router/tables.ts";
import { ROUTER_MEDIA, type Candidate, type RouterMedium } from "../router/types.ts";

// THE MODEL OPTIONS A PART CAN PICK - the catalog's declarations joined with the router's
// candidates and the price table's quote. Pure: the day it prices for is a parameter.
//
// The prototype priced options from literals in the browser (studio.js CATALOG). Here an option
// that names a router candidate takes its LANE and WIRE MODEL from the router table, so the Plan
// can never offer a model on a lane the router would put somewhere else, and its PRICE from
// `quote` - the same function the meter books against - so the figure the receipt shows and the
// figure a call books are one arithmetic (registry modelled-performance-estimates /
// provenance-travels-with-the-value: every figure carries its basis to the screen).

const isMedium = (m: string): m is RouterMedium => (ROUTER_MEDIA as readonly string[]).includes(m);
const isPriceUnit = (u: string): u is PriceUnit => (PRICE_UNITS as readonly string[]).includes(u);

function laneOf(lane: string, where: string): ResourceLane {
  const p = resourceLaneSchema.safeParse(lane);
  if (!p.success) throw new AppError("internal", `${where}: "${lane}" is not a resource lane`);
  return p.data;
}

const paceBasis = (p: PaceDecl): Basis => ({ src: p.src, note: p.note, ...(p.measuredAt === undefined ? {} : { measuredAt: p.measuredAt }) });

type Usd = { usdPerUnit: number | null; usdRangePerUnit?: readonly [number, number]; unpricedReason?: string; basis: Basis };

function usdOf(d: UsdDecl): Usd {
  if ("unpriced" in d) return { usdPerUnit: null, unpricedReason: d.unpriced, basis: { src: "real", note: d.unpriced } };
  return {
    usdPerUnit: d.perUnit,
    ...(d.range === undefined ? {} : { usdRangePerUnit: d.range }),
    basis: { src: d.src, note: d.note, ...(d.measuredAt === undefined ? {} : { measuredAt: d.measuredAt }) },
  };
}

/** The candidate's own pace for a plan key, falling back to its capability. */
function candidatePace(c: Candidate, planKey: string, capability: string): PaceDecl | undefined {
  const p = c.pace?.[planKey] ?? c.pace?.[capability];
  if (p === undefined) return undefined;
  return { secondsPerUnit: p.secondsPerUnit, src: p.basis === "measured" ? "real" : "illustrative", note: p.source };
}

function routed(kind: WorkKind, d: Extract<OptionDecl, { via: "router" }>, on: string, table: readonly PriceRow[]): ModelOption {
  const route = PART_OPTIONS[kind].route;
  const where = `option ${kind}/${d.provider}`;
  if (route === undefined || !isMedium(route.medium)) throw new AppError("internal", `${where}: the kind names no router medium`);
  const planKey = d.capability ?? route.capability;
  const capability = planKey.split("/")[0] ?? planKey;
  const c = TABLES[route.medium].candidates.find((x) => x.provider === d.provider);
  if (c === undefined) throw new AppError("internal", `${where}: the ${route.medium} router declares no candidate ${d.provider}`);
  if (!c.capabilities.includes(capability)) throw new AppError("internal", `${where}: ${d.provider} cannot ${capability} in the router table`);
  const model = c.models[planKey] ?? c.models[capability];
  if (model === undefined) throw new AppError("internal", `${where}: ${d.provider} names no model for ${planKey}`);
  const pace = d.pace ?? candidatePace(c, planKey, capability);
  if (pace === undefined) throw new AppError("internal", `${where}: neither the catalog nor the router gives a pace`);
  let usd: Usd;
  const unit = d.usage?.unit;
  if (d.usage !== undefined && unit !== undefined && isPriceUnit(unit)) {
    const usage: Usage = { [unit]: d.usage.perUnit };
    const q = quote({ provider: d.provider, model, usage, on, ...(d.usage.size === undefined ? {} : { size: d.usage.size }) }, table);
    if (q.usd !== null) usd = { usdPerUnit: q.usd, basis: { src: "real", note: q.note } };
    else usd = d.fallback === undefined ? { usdPerUnit: null, unpricedReason: q.note, basis: { src: "real", note: q.note } } : usdOf(d.fallback);
  } else if (d.fallback !== undefined) {
    usd = usdOf(d.fallback);
  } else {
    // Nothing to multiply before the call (a turn's tokens): the quote says so in its own words.
    const q = quote({ provider: d.provider, model, usage: {}, on }, table);
    usd = { usdPerUnit: null, unpricedReason: q.note, basis: { src: "real", note: q.note } };
  }
  return assemble(kind, d.provider, model, laneOf(c.lane, where), d.label, pace, usd);
}

function assemble(kind: WorkKind, provider: string, model: string, lane: ResourceLane, label: string, pace: PaceDecl, usd: Usd): ModelOption {
  const seconds = paceBasis(pace);
  const priced: FigureSource[] = usd.usdPerUnit === null ? [] : [usd.basis.src];
  return {
    key: `${kind}/${provider}/${model}`,
    lane,
    provider,
    model,
    label,
    secondsPerUnit: pace.secondsPerUnit,
    usdPerUnit: usd.usdPerUnit,
    ...(usd.usdRangePerUnit === undefined ? {} : { usdRangePerUnit: usd.usdRangePerUnit }),
    ...(usd.unpricedReason === undefined ? {} : { unpricedReason: usd.unpricedReason }),
    src: weakest([seconds.src, ...priced]),
    basis: { seconds, usd: usd.basis },
  };
}

function entries(kind: WorkKind, on: string, table: readonly PriceRow[]): { decl: OptionDecl; option: ModelOption }[] {
  return PART_OPTIONS[kind].options.map((decl) => ({
    decl,
    option:
      decl.via === "router"
        ? routed(kind, decl, on, table)
        : assemble(kind, decl.provider, decl.model, laneOf(decl.lane, `option ${kind}/${decl.provider}`), decl.label, decl.pace, usdOf(decl.usd)),
  }));
}

/** Every option for a part kind, in the catalog's order (the first is the recipe's default). */
export function modelOptions(kind: WorkKind, on: string, table: readonly PriceRow[] = PRICE_TABLE): ModelOption[] {
  return entries(kind, on, table).map((e) => e.option);
}

/** One option by key, or undefined when the key is not an option of that kind. */
export function optionOf(kind: WorkKind, key: string, on: string, table: readonly PriceRow[] = PRICE_TABLE): ModelOption | undefined {
  return modelOptions(kind, on, table).find((o) => o.key === key);
}

/** What a launch needs of a chosen option: the option, the producer its job runs under, and
 *  whether the router knows the provider (only then is it a steer the router can honour). */
export function launchOf(kind: WorkKind, key: string, on: string): { option: ModelOption; producer: string; routed: boolean } | undefined {
  const e = entries(kind, on, PRICE_TABLE).find((x) => x.option.key === key);
  if (e === undefined) return undefined;
  return { option: e.option, producer: e.decl.producer ?? PART_OPTIONS[kind].producer, routed: e.decl.via === "router" };
}

export const unitNounOf = (kind: WorkKind): string => PART_OPTIONS[kind].unitNoun;
