import "server-only";

import { recipeById } from "@gt/catalog/recipes";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import type { LaunchedProject, ReceiptMode } from "@gt/domain/produce";
import { projectSchema } from "@gt/domain/project";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import type { Effects } from "@gt/kernel/effects";
import { get, pause, resume, retry } from "@gt/kernel/job";
import { ackLane, move } from "@gt/kernel/job-queue";
import { launchProject, planReceipt, rerouteOptions } from "@gt/kernel/records/launch";
import { listProjects, readProject, type ReadContext } from "@gt/kernel/records/read";
import { compose, discard, rename, setPart } from "@gt/kernel/records/write";
import type { Store } from "@gt/kernel/store";

import type { Confirmed } from "./contract.ts";
import type { ServerProduce, Who } from "./port.ts";
import { composeChoices, composerChoices, keptTakes, registryTopics } from "./realChoices.ts";
import { LANE_DOORS, mintSuffix, type LaunchContext } from "./realLaunch.ts";
import { holdsView, jobsView } from "./realRead.ts";
import { confirmReroute, rerouteReceipt } from "./realReroute.ts";

// THE REAL PRODUCE PORT - the ProducePort over L26's records module, L25's jobs and the
// producers' own launch doors (Phase 4 wave B2, L35; the Board's ./board/_port/real.ts shape).
//
//   reads     the plan, the list and the queue are the records' (records/read.ts), placed by
//             the same scheduler every receipt is; Runs' jobs and holds are ./realRead.ts.
//   receipts  a plan's is `planReceipt`, a Floor composer's is its lane's door (./realLaunch.ts),
//             a re-route's is ./realReroute.ts - each read DRY unless the operator armed it live,
//             and a live read is refused at once in a process that may only run dry
//             (GRAVITONE_DRY_ONLY=1, decision 4) rather than shown and then refused at ⏎;
//   confirms  the receipt is recomputed from what the confirm reads and its token compared
//             before anything is written (records/launch.ts, one transaction): a stale token
//             answers the fresh receipt and launches nothing;
//   acts      pause, resume, retry, earlier/later and acknowledge are the kernel's verbs
//             (job.ts, job-queue.ts), as the operator: their events name who acted.
// Nothing here performs a step. The worker (`npm run worker`) or a producer's CLI drives what a
// launch enqueued; a part whose kind no producer binds yet waits queued, reported by the worker
// as `unknown` (the kernel's word for work nobody here can do), never failed by it.
//
// Every verb answers a Result; a kernel refusal thrown inside a read (not-found, refused,
// conflict) keeps its code, so a Server Component draws a 404 for a project that is not there.

export type RealDeps = {
  readonly store: () => Result<Store>;
  /** The strips launch door's kernel: its store and the effects its manifest writes ride on. */
  readonly strips: () => Result<{ readonly store: Store; readonly fx: Effects }>;
  readonly env: () => Readonly<Record<string, string | undefined>>;
  readonly now: () => number;
  /** The working directory the v1 stores resolve from (tests point it at a temp universe). */
  readonly cwd?: () => string;
  /** A fresh id suffix; tests pin it. */
  readonly mint?: () => string;
};

const actorOf = (w: Who | undefined): Actor => ({ kind: "operator", id: w?.who ?? "operator" });

/** Run `fn`, keeping a thrown AppError's code (a records read throws not-found for a missing project). */
function guard<T>(fn: () => Result<T>): Result<T> {
  try {
    return fn();
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e };
    throw e;
  }
}

/** A kernel write's outcome as a Result (its `current` revision rides in the message the screen shows). */
function outcome<T, U>(o: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError }, then: (v: T) => Result<U>): Result<U> {
  return o.ok ? then(o.value) : { ok: false, error: o.error };
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "") || "project";

export function makeRealProduce(deps: RealDeps): ServerProduce {
  const cwd = deps.cwd ?? (() => process.cwd());
  const mint = deps.mint ?? mintSuffix;
  const ctx = (): ReadContext => ({ now: deps.now() });
  const dryOnly = (): boolean => dryOnlyFrom(deps.env());
  const withStore = <T,>(fn: (s: Store) => Result<T>): Result<T> => {
    const s = deps.store();
    return s.ok ? guard(() => fn(s.value)) : s;
  };
  /** The mode a receipt is read in: dry unless armed, and never live where only dry may run. */
  const modeOf = (m: ReceiptMode | undefined): Result<ReceiptMode> =>
    m === "live" && dryOnly() ? err("refused", "this process runs dry only (GRAVITONE_DRY_ONLY=1); a live receipt cannot be read here") : ok(m ?? "dry");
  const launchCtx = (store: Store): LaunchContext => ({ store, strips: deps.strips, now: deps.now(), dryOnly: dryOnly(), cwd: cwd(), mint });
  const jobId = (id: string): Result<JobId> => parseAt("job id", jobIdSchema, id);
  const jobOf = (store: Store, id: JobId): Result<Job> => {
    const r = get(store, id);
    return r.ok ? ok(r.value.job) : r;
  };
  const titleOf = (j: Job): string => `${j.producer} · ${j.of.id}`;

  const plan = (store: Store, id: string) => readProject(store, id, ctx());
  const usedTakes = (store: Store): Result<Set<string>> =>
    store.read((r) => {
      const used = new Set<string>();
      for (const row of r.all("SELECT record FROM projects WHERE listed = 1 ORDER BY updated_at DESC LIMIT 200")) {
        const p = parseJsonAt("project record", projectSchema, String(row["record"]));
        if (p.ok && p.value.takeId !== undefined) used.add(p.value.takeId);
      }
      return used;
    });

  return {
    composerChoices: () => guard(() => ok(composerChoices(deps.env(), cwd()))),

    composerReceipt: async ({ input, mode }) => {
      const m = modeOf(mode);
      if (!m.ok) return m;
      const s = deps.store();
      if (!s.ok) return s;
      return LANE_DOORS[input.lane].receipt(launchCtx(s.value), input, { mode: m.value });
    },

    launchRun: async ({ input, token, ceilingUsd, mode }, who) => {
      const m = modeOf(mode);
      if (!m.ok) return m;
      const s = deps.store();
      if (!s.ok) return s;
      return LANE_DOORS[input.lane].launch(launchCtx(s.value), input, token, { mode: m.value, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, actorOf(who));
    },

    listProjects: () => withStore((s) => listProjects(s, ctx())),
    loadPlan: ({ id }) => withStore((s) => plan(s, id)),

    composeChoices: () =>
      withStore((s) => {
        const used = usedTakes(s);
        return used.ok ? ok(composeChoices(deps.env(), cwd(), used.value)) : used;
      }),

    compose: (raw, who) =>
      withStore((s) => {
        // Compose sends every pick it holds (a take is preselected whatever the recipe); a project
        // keeps only what its family is made from - a take for an album, a topic for an explainer
        // or an article, a style for the rest - as the fixture did (./fixtureActs.ts `compose`).
        const family = recipeById(raw.recipe)?.family;
        const { takeId, topic: topicId, styleId, ...rest } = raw;
        const input = {
          ...rest,
          ...(family === "album" && takeId !== undefined ? { takeId } : {}),
          ...((family === "explainer" || family === "article") && topicId !== undefined ? { topic: topicId } : {}),
          ...(family !== "album" && styleId !== undefined ? { styleId } : {}),
        };
        // The prototype's titles, with the take's and the topic's own names (records/write.ts
        // `titleFor` falls back to their ids when it is handed none).
        const take = input.takeId === undefined ? undefined : keptTakes().find((t) => t.id === input.takeId);
        const topic = input.topic === undefined ? undefined : registryTopics(deps.env(), cwd()).find((t) => t.value === input.topic);
        const title = input.title ?? (take !== undefined ? `${take.title} — music video` : topic !== undefined ? `${topic.label} — ${family === "article" ? "article" : "explainer"}` : undefined);
        const id = `${slug(title ?? (family === "film" ? "untitled-film" : raw.recipe.replace(/\//g, "-")))}-${mint()}`;
        return outcome(compose(s, { ...input, ...(title === undefined ? {} : { title }) }, actorOf(who), { id }), (v) => ok({ id: v.id }));
      }),

    setPart: ({ id, rev, partId, patch }, who) => withStore((s) => outcome(setPart(s, { id, baseRev: rev, partId, patch }, actorOf(who)), () => plan(s, id))),
    rename: ({ id, rev, title }, who) => withStore((s) => outcome(rename(s, { id, baseRev: rev, title }, actorOf(who)), () => plan(s, id))),
    discard: ({ id, rev }, who) => withStore((s) => outcome(discard(s, { id, baseRev: rev }, actorOf(who)), () => ok({ id }))),

    planReceipt: ({ id, mode }) =>
      withStore((s) => {
        const m = modeOf(mode);
        return m.ok ? planReceipt(s, id, { mode: m.value }, ctx()) : m;
      }),

    launchPlan: ({ id, rev, token, ceilingUsd, mode }, who) =>
      withStore((s): Result<Confirmed<LaunchedProject>> => {
        const m = modeOf(mode);
        if (!m.ok) return m;
        const opts = { mode: m.value, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) };
        const l = launchProject(s, { id, baseRev: rev, token, ...opts }, actorOf(who), { ...ctx(), dryOnly: dryOnly() });
        if (l.ok) return ok({ kind: "launched", ...l.value });
        if (l.fresh !== undefined) return ok({ kind: "stale", fresh: l.fresh });
        // The plan moved under the receipt (another tab changed a part): the fresh receipt is read
        // at its current revision, and the screen confirms that one next (_plan/Plan.tsx).
        if (l.current !== undefined && l.error.code === "conflict") {
          const fresh = planReceipt(s, id, opts, ctx());
          return fresh.ok ? ok({ kind: "stale", fresh: fresh.value }) : fresh;
        }
        return { ok: false, error: l.error };
      }),

    pauseJob: ({ jobId: raw }, who) =>
      withStore((s) => {
        const id = jobId(raw);
        if (!id.ok) return id;
        const before = jobOf(s, id.value);
        if (!before.ok) return before;
        const r = pause(s, id.value, actorOf(who));
        return r.ok ? ok({ jobId: raw, note: `paused · held at ${before.value.state}` }) : r;
      }),

    resumeJob: ({ jobId: raw }, who) =>
      withStore((s) => {
        const id = jobId(raw);
        if (!id.ok) return id;
        const r = resume(s, id.value, actorOf(who));
        return r.ok ? ok({ jobId: raw, note: "resumed · back to queued" }) : r;
      }),

    retryJob: ({ jobId: raw, ceilingUsd }, who) =>
      withStore((s) => {
        const id = jobId(raw);
        if (!id.ok) return id;
        const before = jobOf(s, id.value);
        if (!before.ok) return before;
        // A crash's hold is looked at before the work is taken again (decision 6): the retry of the
        // job a lane holds for is refused until the operator acknowledges the hold.
        const held = s.read((r) => r.get("SELECT 1 AS x FROM lane_holds WHERE job_id = ?", raw) !== undefined);
        if (!held.ok) return held;
        if (held.value) return err("refused", `${before.value.lane} is on hold for this job: acknowledge the hold first`);
        const r = retry(s, id.value, actorOf(who), ceilingUsd === undefined ? {} : { ceilingUsd });
        return r.ok ? ok({ jobId: raw, note: `retry · attempt ${r.value.attempt} · same route${ceilingUsd === undefined ? "" : ` · ceiling $${ceilingUsd}`}` }) : r;
      }),

    moveJob: ({ jobId: raw, dir }, who) =>
      withStore((s) => {
        const id = jobId(raw);
        if (!id.ok) return id;
        const before = jobOf(s, id.value);
        if (!before.ok) return before;
        // The neighbour the swap will pass, read from the line the kernel swaps in (job-queue.ts `move`).
        const line = s.read((r) => r.all("SELECT id FROM jobs WHERE lane = ? AND state IN ('queued', 'planned') ORDER BY ord, n", before.value.lane).map((x) => String(x["id"])));
        if (!line.ok) return line;
        const at = line.value.indexOf(raw);
        const other = line.value[dir === "earlier" ? at - 1 : at + 1];
        if (at < 0 || other === undefined) return err("refused", "end of the lane queue");
        const r = move(s, id.value, dir, actorOf(who));
        if (!r.ok) return r;
        const otherId = jobId(other);
        const o = otherId.ok ? jobOf(s, otherId.value) : otherId;
        const name = o.ok ? titleOf(o.value) : other;
        return ok({ jobId: raw, note: `${dir === "earlier" ? "ahead of" : "behind"} ${name}` });
      }),

    rerouteOptions: ({ jobId: raw }) => withStore((s) => rerouteOptions(s, raw, ctx())),

    reroute: ({ jobId: raw, option, token, ceilingUsd }, who) =>
      withStore((s) => {
        const c = { now: deps.now(), ...(ceilingUsd === undefined ? {} : { ceilingUsd }) };
        return token === undefined ? rerouteReceipt(s, raw, option, c) : confirmReroute(s, raw, option, token, ceilingUsd, actorOf(who), { env: deps.env(), now: deps.now() });
      }),

    ackLane: ({ lane }, who) =>
      withStore((s) => {
        const r = ackLane(s, lane, actorOf(who));
        if (!r.ok) return r;
        const first = r.value[0];
        return first === undefined ? err("refused", `${lane} is not held`) : ok({ jobId: first.jobId, note: `${lane} hold acknowledged` });
      }),

    listJobs: () => withStore((s) => s.read((r) => jobsView(r, deps.now()))),
    listHolds: () => withStore((s) => s.read((r) => holdsView(r, new Map(jobsView(r, deps.now()).map((j) => [j.id, j.title]))))),
  };
}
