import "server-only";

import type { Result } from "@gt/domain/errors";

import type { ProducePort } from "./contract.ts";
import type { LaneHoldView, ProduceJob } from "./contract.ts";
import * as acts from "./fixtureActs.ts";
import { universe } from "./fixture.ts";
import { composeChoices, composerChoices, holdsView, jobsView, planView, projectList } from "./fixtureRead.ts";

// THE SEAM: which produce side the Floor composers, the Plan, Compose and the Runs acts answer
// from. ONE switch, `SIDE`, the Board's shape (../../board/_port/port.ts).
//
// Wave A (L28) builds every screen against the fixture (./fixture.ts and its reads and acts);
// the real side - L26's records module and L25's jobs behind the kernel, bound here the way
// L24 bound the Board - is a later lot, and it replaces only the object `SIDE` selects. The
// screens, the actions (./actions.ts) and the Runs and Floor loaders reach the port through
// `serverProduce()` and nothing else, so that lot edits this file and no screen.
//
// The server side speaks the domain's `Result<T>`; ./actions.ts turns it into the wire envelope.
// Reads that only a server loader makes (Runs' jobs and held lanes, the Floor's runs) ride beside
// the client verbs: they are never called from a browser.

type Value<R> = R extends Promise<{ readonly ok: true; readonly value: infer T } | { readonly ok: false }> ? T : never;

export type ServerProduce = {
  readonly [K in keyof ProducePort]: (...args: Parameters<ProducePort[K]>) => Result<Value<ReturnType<ProducePort[K]>>>;
} & {
  readonly listJobs: () => Result<readonly ProduceJob[]>;
  readonly listHolds: () => Result<readonly LaneHoldView[]>;
};

export const SIDE = "fixture" as const;

const now = (): number => Date.now();
/** The request's clock for a page that draws the port's times (read once, outside render). */
export const produceNow = now;
const u = () => universe(now());

const fixture: ServerProduce = {
  composerChoices: () => ({ ok: true, value: composerChoices() }),
  composerReceipt: ({ input }) => acts.runReceipt(u(), input, now()),
  launchRun: ({ input, token, ceilingUsd }) => acts.launchRun(u(), input, token, now(), ceilingUsd),
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
  planReceipt: ({ id }) => acts.planReceipt(u(), id, now()),
  launchPlan: ({ id, rev, token, ceilingUsd }) => acts.launchPlan(u(), id, rev, token, now(), ceilingUsd),
  pauseJob: ({ jobId }) => acts.pauseJob(u(), jobId, now()),
  resumeJob: ({ jobId }) => acts.resumeJob(u(), jobId, now()),
  retryJob: ({ jobId, ceilingUsd }) => acts.retryJob(u(), jobId, now(), ceilingUsd),
  moveJob: ({ jobId, dir }) => acts.moveJob(u(), jobId, dir, now()),
  rerouteOptions: ({ jobId }) => acts.rerouteOptions(u(), jobId, now()),
  reroute: ({ jobId, option, token, ceilingUsd }) => acts.reroute(u(), jobId, option, now(), token, ceilingUsd),
  ackLane: ({ lane }) => acts.ackLane(u(), lane),
  listJobs: () => ({ ok: true, value: jobsView(u(), now()) }),
  listHolds: () => ({ ok: true, value: holdsView(u()) }),
};

export function serverProduce(): ServerProduce {
  return fixture;
}
