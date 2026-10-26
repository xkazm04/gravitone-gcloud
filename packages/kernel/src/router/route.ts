import { AppError, type AppErrorCode } from "@gt/domain/errors";
import { quote, toEstimate } from "../pricing/quote.ts";
import { describeLocal } from "./posture.ts";
import { TABLES } from "./tables.ts";
import {
  NEED_PHRASE,
  type Candidate,
  type Choice,
  type Delta,
  type Elimination,
  type Facts,
  type FailureKind,
  type MediumTable,
  type Posture,
  type Refused,
  type RefusalReason,
  type RouteOutcome,
  type RouteRequest,
  type Routed,
} from "./types.ts";

// THE ROUTER - one pure kernel for every medium (plan §3.2 first row).
//
// v1 had two chokepoints (lib/imaging/router.ts, lib/text/router.ts) that
// walked a plan AND called vendors in one loop, reading keys and posture from
// process.env as they went. The intelligence they shared is kept whole here,
// and the I/O is moved out: `route` takes the request, the medium's table, the
// posture and what is known about each candidate right now, and returns a
// decision or a refusal. It calls nothing. A driver calls the chosen provider;
// if that call fails with a reroutable kind, the driver routes again with the
// failure added to `facts.attempts`, and the walk resumes past it. So the
// re-route after a refusal, the Runs preview and the real launch are the same
// function, and "the Runs re-route action writes a steer, not a new code path".
//
// Kept from v1, each a rule somebody paid for:
//   - NO ELIMINATION IS SILENT. A candidate drops out because it lacks the
//     capability, cannot honour a field of this request, is forbidden by the
//     posture, is not configured or not installed, was steered out, or was
//     called and failed - and every one lands in `trail`, with a sentence.
//   - THE REQUEST-LEVEL CONSTRAINT outranks a vendor error in the final
//     message: "no key for google" does not explain why google was the only
//     candidate for a request carrying references.
//   - A PLAN ROW WHOSE FIRST ENTRY CANNOT DO THE JOB is a table bug, raised, not
//     routed around.
//   - PREFER ONLY REORDERS, EXCLUDE REMOVES, and an exclusion that empties the
//     chain is refused `no-alternative` rather than served by the excluded one.
//   - A PREFER-ONLY provider is reached only by name, and then alone.
//   - ONLY A REROUTABLE FAILURE WALKS (a refusal, a rate limit). A timeout or a
//     bad response stops the request: another vendor would bill twice for a
//     request nobody declined (lib/imaging/errors.ts `reroutable`).
//   - THE RUNG travels with the choice, and there is no floor rung.
// Upgraded: a steer that excludes now leaves a `steered-out` entry (v1 removed
// the avoided vendor from the chain without a word), a preference that cannot
// be honoured is reported in `steerDropped` (v1 dropped it silently and left
// the reader to notice the provider), and a steered decision carries its delta
// against the unsteered one.

const REROUTABLE: ReadonlySet<FailureKind> = new Set<FailureKind>(["refused", "rate-limited"]);

const STOP_CODE: Readonly<Record<FailureKind, AppErrorCode>> = {
  refused: "refused",
  "rate-limited": "unavailable",
  timeout: "unavailable",
  "bad-response": "unavailable",
  "invalid-request": "invalid",
  failed: "unavailable",
  cancelled: "refused",
};

const REASON_CODE: Readonly<Record<RefusalReason, AppErrorCode>> = {
  misconfigured: "invalid",
  absent: "refused",
  "not-permitted": "refused",
  "no-alternative": "refused",
  exhausted: "unavailable",
  stopped: "unavailable",
  "table-bug": "internal",
};

const refuse = (reason: RefusalReason, message: string, trail: readonly Elimination[], code: AppErrorCode = REASON_CODE[reason]): Refused => ({
  kind: "refused",
  reason,
  code,
  message,
  trail: [...trail],
});

/** A refusal as the one error taxonomy, for a driver that must throw it. */
export function refusalError(r: Refused): AppError {
  return new AppError(r.code, r.message, { detail: r.trail.map((e) => `${e.provider} (${e.why})`).join(", ") || r.reason });
}

/** Why a candidate cannot even be attempted under this posture, or undefined. */
function postureBlock(c: Candidate, capability: string, posture: Posture): Elimination | undefined {
  if (c.transport === "local-binary" && posture.local !== "available") {
    return { provider: c.provider, why: posture.local, detail: `${c.provider} cannot run here: ${describeLocal(posture.local)}` };
  }
  if (capability === "retrieve" && !posture.retrieval) {
    return { provider: c.provider, why: "policy-forbidden", detail: "web retrieval is off by policy: TEXT_RETRIEVE=1 lets a research run search and fetch; off, the run is reasoned, not retrieved" };
  }
  return undefined;
}

type Walk = { readonly chain: readonly string[]; readonly trail: Elimination[]; steerDropped?: string };

function choose(req: RouteRequest, c: Candidate, planKey: string, rung: Choice["rung"], now: string): Choice {
  const model = c.models[planKey] ?? c.models[req.capability] ?? c.provider;
  const bills = c.bills?.[planKey] ?? c.bills?.[req.capability];
  const usage = req.usage ?? (bills === undefined ? {} : { [bills]: req.units });
  const q = quote({ provider: c.provider, model, usage, on: now, ...(req.size === undefined ? {} : { size: req.size }) });
  const pace = c.pace?.[planKey] ?? c.pace?.[req.capability];
  const seconds = pace === undefined ? null : req.units * pace.secondsPerUnit;
  const base = { provider: c.provider, model, lane: c.lane, transport: c.transport, rung, quote: q, seconds };
  if (seconds === null) return base;
  const e = toEstimate(q, seconds);
  if (!e.ok) throw e.error;
  return { ...base, estimate: e.value };
}

/** The steered chain, before any candidate is examined. */
function chainOf(req: RouteRequest, table: MediumTable, env: string, planKey: string, row: readonly string[]): Walk | Refused {
  const steer = req.steer ?? {};
  const excluded = new Set(steer.exclude ?? []);
  const named = steer.prefer === undefined ? undefined : table.candidates.find((c) => c.provider === steer.prefer);
  const pin = steer.pin ?? (named?.preferOnly === true ? named.provider : undefined);
  if (pin !== undefined) {
    if (excluded.has(pin)) return refuse("no-alternative", `the steer pins ${pin} and excludes it`, []);
    const c = table.candidates.find((x) => x.provider === pin);
    if (!row.includes(pin) && c?.preferOnly !== true) {
      const permitted = row.length > 0 ? row.join(", ") : "nothing";
      const why: Elimination = { provider: pin, why: "not-planned", detail: `the ${env} plan for ${table.medium} ${planKey} permits ${permitted}` };
      return refuse("not-permitted", `${pin} is not permitted for ${table.medium} ${planKey} in the ${env} posture (it permits ${permitted})`, [why]);
    }
    return { chain: [pin], trail: [] };
  }
  if (row.length === 0) return refuse("absent", `${table.medium} ${planKey} is not offered in the ${env} posture`, []);
  const trail: Elimination[] = [];
  const kept: string[] = [];
  for (const id of row) {
    if (excluded.has(id)) trail.push({ provider: id, why: "steered-out", detail: `${id} was excluded by the steer` });
    else kept.push(id);
  }
  if (kept.length === 0) return refuse("no-alternative", `the steer excluded every provider the ${env} plan has for ${table.medium} ${planKey} (${row.join(", ")}); nowhere is left to route`, trail);
  return { chain: kept, trail };
}

function walk(req: RouteRequest, table: MediumTable, posture: Posture, facts: Facts): Routed | Refused {
  const env = posture.plan[req.medium];
  const rows = table.plans[env];
  if (rows === undefined) return refuse("misconfigured", `the posture names plan column "${env}" for ${req.medium}; the table has ${Object.keys(table.plans).join(", ")}`, []);
  const planKey = req.class === undefined ? req.capability : `${req.capability}/${req.class}`;
  const row = rows[planKey];
  if (row === undefined) return refuse("misconfigured", `${req.medium} has no plan row "${planKey}": an unclassified or unknown call is a routing bug, not a default`, []);
  const steered = chainOf(req, table, env, planKey, row);
  if ("kind" in steered) return steered;
  const { trail } = steered;
  let chain = [...steered.chain];
  let steerDropped: string | undefined;

  const byId = new Map(table.candidates.map((c) => [c.provider, c]));
  const needs = req.needs ?? [];
  const attempts = facts.attempts ?? [];
  /** Why `c` cannot be attempted now, or undefined when it can. */
  const gate = (c: Candidate): Elimination | undefined => {
    if (!c.capabilities.includes(req.capability)) return { provider: c.provider, why: "unsupported", detail: `${c.provider} cannot ${req.capability}` };
    const missing = needs.filter((n) => !c.honours.includes(n));
    if (missing.length > 0) {
      return { provider: c.provider, why: "constraint", detail: `this request needs ${missing.map((n) => NEED_PHRASE[n]).join(" and ")}, which ${c.provider} ignores` };
    }
    const blocked = postureBlock(c, req.capability, posture);
    if (blocked !== undefined) return blocked;
    const a = facts.availability[c.provider];
    if (a === undefined) return { provider: c.provider, why: "no-key", detail: `${c.provider} is not configured: ${c.credential}` };
    if (!a.ok) return { provider: c.provider, why: a.why, detail: a.detail };
    const tried = attempts.findLast((x) => x.provider === c.provider);
    if (tried !== undefined) return { provider: c.provider, why: tried.kind, detail: tried.detail };
    return undefined;
  };

  const prefer = req.steer?.prefer;
  // A one-provider chain has nothing to reorder, but a preference outside it is still dropped out loud.
  if (prefer !== undefined && req.steer?.pin === undefined) {
    const c = byId.get(prefer);
    if (!chain.includes(prefer)) steerDropped = `${prefer} is not in the ${env} plan for ${req.medium} ${planKey}; the preference was dropped`;
    else if (chain.length > 1) {
      const blocked = c === undefined ? undefined : gate(c);
      if (c !== undefined && blocked === undefined) chain = [prefer, ...chain.filter((id) => id !== prefer)];
      else steerDropped = `${prefer} cannot serve this request (${blocked?.why ?? "unknown"}); the preference was dropped`;
    }
  }

  let rejected = 0;
  for (const [i, id] of chain.entries()) {
    const c = byId.get(id);
    if (c === undefined) return refuse("table-bug", `${req.medium} ${planKey}: ${id} is in the plan but not a declared candidate`, trail);
    const out = gate(c);
    if (out === undefined) {
      const choice = choose(req, c, planKey, i === 0 ? "preferred" : "alternate", facts.now);
      const routed: Routed = { kind: "routed", planKey, chain, choice, trail };
      return steerDropped === undefined ? routed : { ...routed, steerDropped };
    }
    if (out.why === "unsupported" && i === 0 && req.steer?.pin === undefined) {
      return refuse("table-bug", `${req.medium} ${env} ${planKey}: the plan's first entry ${id} cannot ${req.capability}`, [...trail, out]);
    }
    trail.push(out);
    if (out.why === "constraint") rejected++;
    const failure = attempts.findLast((x) => x.provider === id);
    if (failure !== undefined && out.why === failure.kind && !REROUTABLE.has(failure.kind)) {
      return refuse("stopped", `${id} failed (${failure.kind}), which no other provider fixes; the request stops here: ${failure.detail}`, trail, STOP_CODE[failure.kind]);
    }
  }

  const tried = trail.map((e) => `${e.provider} (${e.why})`).join(", ");
  const first = trail.find((e) => e.why !== "steered-out");
  if (rejected > 0) {
    const eligible = chain.filter((id) => needs.every((n) => byId.get(id)?.honours.includes(n) ?? false));
    const need = needs.map((n) => NEED_PHRASE[n]).join(" and ");
    const head = eligible.length > 0
      ? `this request needs a provider that supports ${need}; for ${req.medium} ${planKey} that is ${eligible.join(" or ")}, which could not serve it`
      : `this request needs a provider that supports ${need}, and none of the ${req.medium} ${planKey} chain (${chain.join(", ")}) does`;
    return refuse("exhausted", `${head}. Tried: ${tried}.`, trail);
  }
  return refuse("exhausted", `no provider could serve ${req.medium} ${planKey}. Tried: ${tried}.${first === undefined ? "" : ` ${first.detail}.`}`, trail);
}

function deltaOf(steered: Routed, base: RouteOutcome): Delta {
  if (base.kind === "refused") return { vs: null, usd: null, seconds: null, note: `the unsteered request is refused: ${base.message}` };
  const a = steered.choice;
  const b = base.choice;
  const usd = a.quote.usd !== null && b.quote.usd !== null ? a.quote.usd - b.quote.usd : null;
  const seconds = a.seconds !== null && b.seconds !== null ? a.seconds - b.seconds : null;
  const gaps = [
    usd === null ? `cost: ${a.quote.usd === null ? `${a.provider} is unpriced` : `${b.provider} is unpriced`}` : undefined,
    seconds === null ? `time: no pace is declared for ${a.seconds === null ? a.provider : b.provider}` : undefined,
  ].filter((g): g is string => g !== undefined);
  return gaps.length === 0 ? { vs: b.provider, usd, seconds } : { vs: b.provider, usd, seconds, note: gaps.join("; ") };
}

/**
 * Decide who serves `req`. Pure: no I/O, no clock, no environment. A refusal
 * is a value carrying the whole trail; `refusalError` raises it.
 */
export function route(req: RouteRequest, posture: Posture, facts: Facts, table: MediumTable = TABLES[req.medium]): RouteOutcome {
  if (table.medium !== req.medium) return refuse("misconfigured", `a ${req.medium} request was handed the ${table.medium} table`, []);
  if (!Number.isFinite(req.units) || req.units < 0) return refuse("misconfigured", `units=${req.units} is not a count`, []);
  const s = req.steer;
  if (s !== undefined) {
    if (s.pin !== undefined && s.prefer !== undefined) return refuse("misconfigured", "a steer either pins or prefers, not both", []);
    const known = new Set(table.candidates.map((c) => c.provider));
    const unknown = [s.pin, s.prefer, ...(s.exclude ?? [])].filter((id): id is string => id !== undefined && !known.has(id));
    if (unknown.length > 0) return refuse("misconfigured", `the steer names ${unknown.join(", ")}, which the ${req.medium} table does not declare`, []);
  }
  const out = walk(req, table, posture, facts);
  if (out.kind === "refused" || s === undefined) return out;
  const { steer, ...unsteered } = req;
  void steer;
  return { ...out, delta: deltaOf(out, walk(unsteered, table, posture, facts)) };
}
