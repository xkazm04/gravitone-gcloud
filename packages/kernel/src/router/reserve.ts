import type { AppError } from "@gt/domain/errors";
import type { Actor, Subject } from "@gt/domain/event";
import type { RunMode } from "../dryrun.ts";
import { append } from "../events.ts";
import { dearestRate } from "../pricing/quote.ts";
import type { SpendClass } from "../spend/core.ts";
import { reserve, type Reservation } from "../spend/ledger.ts";
import type { Tx } from "../store.ts";
import { route } from "./route.ts";
import type { Facts, MediumTable, Posture, Refused, RouteRequest, Routed, RouterMedium } from "./types.ts";

// ROUTE, THEN RESERVE - the one driver over the router (plan §3.2: "reserve
// before call"). Synchronous, inside the caller's transaction: the decision,
// the hold and the decision's ledger row commit together or not at all, so no
// vendor is ever called on a hold that did not land (lib/spend/meter.ts:
// "RESERVE BEFORE SPENDING ... the call that would cross the ceiling is refused
// before any vendor is touched").
//
// What v1 reserved, kept per medium:
//   image  the DEAREST declared per-image rate times the images asked for,
//          whichever vendor routes (lib/imaging/budget.ts estimatePendingUsd):
//          the gate may guess and errs high; the settle books what happened.
//   video  a cloud clip holds its price, or $0.75/s when unpriced
//          (lib/imaging/video/pricing.ts gateHoldUsd, "a clip is dollars, not
//          cents, so the gate errs high"). A clip rendered on this box's own
//          GPU is not billed by anyone and holds nothing.
//   audio  SECONDS of audio requested, the unit music has always been metered
//          in (lib/music/budget.ts), for the cloud vendor; the Suno queue spends
//          the operator's plan credits, which v1 never held against a ceiling.
//   text   nothing: text-usd is count-only by the operator's ruling (2026-10-07,
//          "Count only, refuse nothing").
// A DRY request holds nothing: a rehearsal that occupied the real ceiling would
// refuse real work beside it. It reports what it WOULD hold instead.

export type SpendClassId = "imaging-usd" | "video-usd" | "music-audio-s";

/** The ceilings in force, by class id. The app reads them per call from its
 *  environment (lib/spend/classes.ts ceilingOf); the kernel only applies them. */
export type SpendClasses = Readonly<Record<SpendClassId, SpendClass>>;

/** v1's hold for an unpriced clip, per second of video. */
export const UNPRICED_CLIP_HOLD_USD_PER_S = 0.75;

const CLASS_OF: Readonly<Record<RouterMedium, SpendClassId | null>> = { image: "imaging-usd", video: "video-usd", audio: "music-audio-s", text: null };

/** What a routed request would hold, or null when it holds nothing. */
export function holdFor(req: RouteRequest, routed: Routed, now: string): { spendClass: SpendClassId; amount: number } | null {
  const spendClass = CLASS_OF[req.medium];
  if (spendClass === null) return null;
  const c = routed.choice;
  if (req.medium === "image") {
    const dearest = dearestRate("image", now);
    return { spendClass, amount: dearest === undefined ? 0 : dearest.usdPerUnit * Math.max(req.units, 1) };
  }
  if (c.transport !== "cloud") return null;
  if (req.medium === "audio") return { spendClass, amount: req.usage?.["audio-second"] ?? req.units };
  const clipSeconds = 5 * (req.usage?.["clip-5s"] ?? 0) + 10 * (req.usage?.["clip-10s"] ?? 0);
  return { spendClass, amount: c.quote.usd ?? UNPRICED_CLIP_HOLD_USD_PER_S * clipSeconds };
}

export type RouteReservation =
  | { readonly kind: "refused"; readonly refused: Refused }
  /** The ceiling refused the hold. A VALUE, so kernel/spend's refusal counter
   *  and its `spend.refused` event commit with the caller's transaction. */
  | { readonly kind: "over-budget"; readonly routed: Routed; readonly error: AppError }
  | {
      readonly kind: "routed";
      readonly routed: Routed;
      readonly hold: Reservation | null;
      /** A dry request's hold, unspent. */
      readonly wouldHold: { readonly spendClass: SpendClassId; readonly amount: number } | null;
    };

export type RouteAndReserveInput = {
  readonly req: RouteRequest;
  readonly posture: Posture;
  readonly facts: Facts;
  readonly mode: RunMode;
  readonly actor: Actor;
  /** What the routed call is for; the decision's ledger row is about it. */
  readonly subject: Subject;
  /** The reservation's id, minted by the caller: kernel/spend's idempotency
   *  key, so a retried transaction gets the same hold back. */
  readonly reservationId: string;
  readonly table?: MediumTable;
};

/**
 * Decide and hold, in `t`. A refusal is a VALUE, recorded as `router.refused`
 * and committed with the caller's transaction: "which model served this call,
 * and why" includes "none, and why" (model-routing: the decision record). A
 * budget refusal from the spend port throws and rolls everything back.
 */
export function routeAndReserve(t: Tx, input: RouteAndReserveInput, classes: SpendClasses): RouteReservation {
  const { req, facts, mode, actor, subject } = input;
  const out = route(req, input.posture, facts, input.table);
  const trail = out.trail.map((e) => ({ provider: e.provider, why: e.why, detail: e.detail }));
  if (out.kind === "refused") {
    append(t, { actor, type: "router.refused", subject, data: { medium: req.medium, capability: req.capability, reason: out.reason, message: out.message, trail, mode: mode.kind } });
    return { kind: "refused", refused: out };
  }
  const want = holdFor(req, out, facts.now);
  let hold: Reservation | null = null;
  if (want !== null && mode.kind === "live") {
    const r = reserve(t, classes[want.spendClass], { id: input.reservationId, amount: want.amount, owner: actor.id });
    if (!r.ok) {
      if (r.error.code !== "budget") throw r.error;
      return { kind: "over-budget", routed: out, error: r.error };
    }
    hold = r.value;
  }
  const c = out.choice;
  const data: Record<string, unknown> = {
    medium: req.medium,
    planKey: out.planKey,
    provider: c.provider,
    model: c.model,
    rung: c.rung,
    lane: c.lane,
    basis: c.quote.basis,
    trail,
    mode: mode.kind,
  };
  if (c.quote.usd !== null) data["usd"] = c.quote.usd;
  if (c.seconds !== null) data["seconds"] = c.seconds;
  if (req.steer !== undefined) data["steer"] = { ...req.steer, ...(req.steer.exclude === undefined ? {} : { exclude: [...req.steer.exclude] }) };
  if (out.steerDropped !== undefined) data["steerDropped"] = out.steerDropped;
  if (out.delta !== undefined) data["delta"] = { ...out.delta };
  if (hold !== null) data["hold"] = { id: hold.id, spendClass: hold.cls, amount: hold.amount };
  if (mode.kind === "live") data["armedBy"] = { kind: mode.arm.by.kind, id: mode.arm.by.id };
  append(t, { actor, type: "router.routed", subject, lane: c.lane, data });
  return { kind: "routed", routed: out, hold, wouldHold: mode.kind === "dry" ? want : null };
}
