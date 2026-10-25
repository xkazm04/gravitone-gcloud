import "server-only";

import { err, type Result } from "@gt/domain/errors";
import type { ActorKind } from "@gt/domain/event";

import { kernel } from "../../../../lib/kernelStore.ts";
import { stripsKernel } from "../../../../lib/producers/strips.ts";
import type { ProducePort } from "./contract.ts";
import type { ActOutcome, LaneHoldView, ProduceJob } from "./contract.ts";
import * as acts from "./fixtureActs.ts";
import { universe } from "./fixture.ts";
import { composeChoices, composerChoices, holdsView, jobsView, planView, projectList } from "./fixtureRead.ts";
import { actorOf, makeRealProduce } from "./real.ts";

// THE SEAM: which produce side the Floor composers, the Plan, Compose and the Runs acts answer
// from. ONE switch, `SIDE`, the Board's shape (../../board/_port/port.ts).
//
// Wave A (L28) built every screen against the fixture (./fixture.ts and its reads and acts);
// wave B2 (L35) wrote the real side (./real.ts: L26's records module and L25's jobs behind the
// kernel, the producers' own launch doors from lib/producers) and flipped SIDE. Nothing else
// changed: the screens, the actions (./actions.ts) and the Runs and Floor loaders reach the port
// through `serverProduce()`. The fixture stays for /kit and for the fixture lane
// (tests/live/produce.live.spec.ts), which runs it with GRAVITONE_PRODUCE_SIDE=fixture; a reader
// that must stay in the fixture universe whatever SIDE is (the part editors' fixture) takes
// `fixtureProduce()` by name.
//
// The server side speaks the domain's `Result<T>`; ./actions.ts turns it into the wire envelope.
// Each verb also takes who is acting, which the browser never names: the action core resolved it
// from the session, and the job's events record it. Reads that only a server loader makes (Runs'
// jobs and held lanes, the Floor's runs) ride beside the client verbs: they are never called from
// a browser. The two composer verbs may answer later (a strips launch writes its manifest first);
// every other verb answers at once, so a Server Component reads it without awaiting.

type Value<R> = R extends Promise<{ readonly ok: true; readonly value: infer T } | { readonly ok: false }> ? T : never;

/** Who acts, as the ledger names them. A principal without a uid is the operator; `kind` is set by a
 *  caller that is not the operator (the MCP door names an agent: `{who: "athena", kind: "agent"}`). */
export type Who = { readonly who?: string; readonly kind?: ActorKind };

type Later = "composerReceipt" | "launchRun";
type Verb<K extends keyof ProducePort> = (...args: [...Parameters<ProducePort[K]>, Who?]) => K extends Later ? Result<Value<ReturnType<ProducePort[K]>>> | Promise<Result<Value<ReturnType<ProducePort[K]>>>> : Result<Value<ReturnType<ProducePort[K]>>>;

export type ServerProduce = { readonly [K in keyof ProducePort]: Verb<K> } & {
  readonly listJobs: () => Result<readonly ProduceJob[]>;
  readonly listHolds: () => Result<readonly LaneHoldView[]>;
  /** The kernel's cancel (job.ts), for the agent door; no browser verb calls it (spark athena-control-mcp). */
  readonly cancelJob: (i: { readonly jobId: string }, w?: Who) => Result<ActOutcome>;
};

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

const now = (): number => Date.now();
/** The request's clock for a page that draws the port's times (read once, outside render). */
export const produceNow = now;
const u = () => universe(now());

/** The fixture universe runs dry (decision 4): a live receipt is refused there, never priced dry. */
const FIXTURE_DRY = "the fixture universe runs dry; nothing in it can be armed live";
const dryOnly = <T,>(mode: "dry" | "live" | undefined, then: () => Result<T>): Result<T> => (mode === "live" ? err("refused", FIXTURE_DRY) : then());

const fixture: ServerProduce = {
  composerChoices: () => ({ ok: true, value: composerChoices() }),
  composerReceipt: ({ input, mode }) => dryOnly(mode, () => acts.runReceipt(u(), input, now())),
  launchRun: ({ input, token, ceilingUsd, mode }) => dryOnly(mode, () => acts.launchRun(u(), input, token, now(), ceilingUsd)),
  listProjects: () => ({ ok: true, value: projectList(u(), now()) }),
  loadPlan: ({ id }) => planView(u(), id, now()),
  composeChoices: () => ({ ok: true, value: composeChoices(u()) }),
  compose: (i) => acts.compose(u(), i, now()),
  setPart: ({ id, rev, partId, patch }) => {
    const r = acts.setPart(u(), id, rev, partId, patch, now());
    return r.ok ? planView(u(), id, now()) : r;
  },
  rename: ({ id, rev, title }) => {
    const r = acts.rename(u(), id, rev, title, now());
    return r.ok ? planView(u(), id, now()) : r;
  },
  discard: ({ id, rev }) => acts.discard(u(), id, rev),
  planReceipt: ({ id, mode }) => dryOnly(mode, () => acts.planReceipt(u(), id, now())),
  launchPlan: ({ id, rev, token, ceilingUsd, mode }) => dryOnly(mode, () => acts.launchPlan(u(), id, rev, token, now(), ceilingUsd)),
  pauseJob: ({ jobId }) => acts.pauseJob(u(), jobId, now()),
  resumeJob: ({ jobId }) => acts.resumeJob(u(), jobId, now()),
  retryJob: ({ jobId, ceilingUsd }, w) => acts.retryJob(u(), jobId, now(), ceilingUsd, actorOf(w)),
  moveJob: ({ jobId, dir }) => acts.moveJob(u(), jobId, dir, now()),
  rerouteOptions: ({ jobId }) => acts.rerouteOptions(u(), jobId, now()),
  reroute: ({ jobId, option, token, ceilingUsd }, w) => acts.reroute(u(), jobId, option, now(), token, ceilingUsd, actorOf(w)),
  ackLane: ({ lane }, w) => acts.ackLane(u(), lane, actorOf(w)),
  listJobs: () => ({ ok: true, value: jobsView(u(), now()) }),
  listHolds: () => ({ ok: true, value: holdsView(u()) }),
  cancelJob: () => err("unavailable", "the fixture universe holds no kernel job to cancel"),
};

const real: ServerProduce = makeRealProduce({
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
  // The strips launch door writes its manifest and confirms on the process's kernel and effects.
  strips: () => stripsKernel(),
  env: () => process.env,
  now,
});

export function serverProduce(): ServerProduce {
  return SIDE === "fixture" ? fixture : real;
}

/** The fixture side by name, whatever SIDE is: a reader that lives in the fixture universe. */
export function fixtureProduce(): ServerProduce {
  return fixture;
}
