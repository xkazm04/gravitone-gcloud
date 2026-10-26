import "server-only";

import { err, isAppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { SpendSubject } from "@gt/domain/mcp";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { gateFacts } from "@gt/kernel/parts/gates";
import { launchProject, planReceipt } from "@gt/kernel/records/launch";
import { readProject } from "@gt/kernel/records/read";
import { decideSpendRequest, listSpendRequests, markSpendFailed, markSpendLaunched, readSpendRequest } from "@gt/kernel/spend-requests/store";
import type { Store } from "@gt/kernel/store";

import { kernel } from "../../../kernelStore.ts";
import { LANE_DOORS, mintSuffix, type LaunchContext } from "../../../produce/laneDoors.ts";
import { preflightOf } from "../../../producers/registry.ts";
import { stripsKernel } from "../../../producers/strips.ts";
import type { Launched, SpendDeps, SpendDoors, SpendStore } from "./spend.ts";
import type { Priced } from "./spendWords.ts";

// THE SPEND PACKET'S LIVE BINDING (spark athena-control-mcp WP3): the process kernel's spend-request
// store, and the produce doors a K launches through. The adapter (./spend.ts) takes both as a seam,
// so its tests run over a fake store and fake doors and nothing here is reached from a test.
//
// A PROJECT is the Plan's own door: the kernel's planReceipt / launchProject, read LIVE with the gate
// facts and the producers' preflight the real produce port passes (app/(studio)/projects/_port/real.ts
// `planReceipt`, `launchPlan`), and its DRY_ONLY from the same env (a live launch in a dry-only process
// is refused by the kernel's armLive, `dry-only`, and the request is failed with that sentence).
//
// A RUN is the Floor's own lane door (lib/produce/laneDoors.ts LANE_DOORS - strips, forge, Suno, the
// records' door), read LIVE with the same launch context the real produce port builds (real.ts
// `launchCtx`): the process kernel, the strips kernel, the process's cwd and its DRY_ONLY.


const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

/** A kernel call's throw (the stub's, a refused transition) as a Result. */
function caught<T>(fn: () => Result<T>): Result<T> {
  try {
    return fn();
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e };
    return err("internal", e instanceof Error ? e.message : String(e), { cause: e });
  }
}

export function kernelSpendStore(store: Store): SpendStore {
  return {
    requested: (day) => caught(() => store.read((r) => listSpendRequests(r, { day, state: "requested" }))),
    pending: () => caught(() => store.read((r) => listSpendRequests(r, { state: "requested" }))),
    get: (id) => caught(() => store.read((r) => readSpendRequest(r, id))),
    decide: (id, d, actor) => caught(() => store.tx((t) => decideSpendRequest(t, id, d, actor))),
    launched: (id, jobIds, actor) => caught(() => store.tx((t) => markSpendLaunched(t, id, jobIds, actor))),
    failed: (id, failure, actor) => caught(() => store.tx((t) => markSpendFailed(t, id, failure, actor))),
  };
}

type Env = () => Readonly<Record<string, string | undefined>>;

export function kernelSpendDoors(store: () => Result<Store>, env: Env = () => process.env, now: () => number = Date.now): SpendDoors {
  const ctx = () => gateFacts(now());
  const launchCtx = (st: Store): LaunchContext => ({ store: st, strips: stripsKernel, now: now(), dryOnly: dryOnlyFrom(env()), cwd: process.cwd(), mint: mintSuffix });
  async function price(subject: SpendSubject): Promise<Result<Priced>> {
    const s = store();
    if (!s.ok) return s;
    if (subject.kind === "run") {
      const r = await LANE_DOORS[subject.input.lane].receipt(launchCtx(s.value), subject.input, { mode: "live" });
      return r.ok ? ok({ receipt: r.value }) : r;
    }
    return caught(() => {
      const plan = readProject(s.value, subject.id, ctx());
      if (!plan.ok) return plan;
      const head = plan.value.project;
      if (head.rev !== subject.rev) return err("conflict", `project ${subject.id} moved on (now at revision ${head.rev})`);
      const r = planReceipt(s.value, subject.id, { mode: "live" }, ctx());
      return r.ok ? ok({ receipt: r.value, title: head.title }) : r;
    });
  }
  async function launch(subject: SpendSubject, receipt: { readonly token: string }, ceilingUsd: number | undefined, actor: Actor): Promise<Result<Launched>> {
    const s = store();
    if (!s.ok) return s;
    if (subject.kind === "run") {
      const l = await LANE_DOORS[subject.input.lane].launch(launchCtx(s.value), subject.input, receipt.token, { mode: "live", ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, actor);
      if (!l.ok) return l;
      return ok(l.value.kind === "stale" ? { kind: "stale", fresh: l.value.fresh } : { kind: "launched", jobIds: [l.value.jobId] });
    }
    return caught((): Result<Launched> => {
      const l = launchProject(s.value, { id: subject.id, baseRev: subject.rev, token: receipt.token, mode: "live", ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, actor, { ...ctx(), dryOnly: dryOnlyFrom(env()), preflightOf });
      if (l.ok) return ok({ kind: "launched", jobIds: l.value.jobIds });
      if (l.fresh !== undefined) return ok({ kind: "stale", fresh: l.fresh });
      return { ok: false, error: l.error };
    });
  }
  return { price, launch };
}

export const liveSpendDeps: SpendDeps = {
  store: () => {
    const s = processStore();
    return s.ok ? ok(kernelSpendStore(s.value)) : s;
  },
  doors: () => kernelSpendDoors(processStore),
};
