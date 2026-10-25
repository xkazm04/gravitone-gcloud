import "server-only";

import { recipeById, type WorkKind } from "@gt/catalog/recipes";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobMachine, type JobState } from "@gt/domain/job.machine";
import type { ResourceLane } from "@gt/domain/lane";
import type { ComposeInput, ComposerInput, LaunchedProject, LaunchedRun, ModelOption, PartPatch, Receipt, ReceiptSubject, RerouteOption } from "@gt/domain/produce";

import type { ActOutcome, Confirmed, RerouteResult } from "./contract.ts";
import { CANDIDATE_STYLES, KEPT_TAKES, PROVEN_STYLES, SUBJECTS, SWEEP_PLATES_PER_STYLE, SWEEP_STYLES, TOPICS } from "./fixtureData.ts";
import { isWorkKind, optionOf, optionsOf, partJobId, partsOf, placeAll, tokenOf, type FxJob, type FxProject, type Universe } from "./fixture.ts";
import { costOf } from "./fixtureRead.ts";
import { firstSentence, slug } from "./names.ts";
import { lineOf, receiptOf, type Item } from "./schedule.ts";

// THE FIXTURE'S WRITES - receipts, confirms and the Runs acts, over the universe in ./fixture.ts.
// Each confirm recomputes its receipt and compares tokens before it touches anything: a token
// that no longer matches launches nothing and answers the receipt as it reads now (COMMON
// decision 3; the Board's commit does the same with its consequence, kernel decision/commit.ts).
// Every job a confirm creates is DRY (decision 4: the fixture universe never arms live).

const NEW = "__receipt";

/* ── the Floor composers ──────────────────────────────────────────────────── */

type RunSpec = { readonly kind: WorkKind; readonly units: number; readonly label: string; readonly title: string; readonly option: ModelOption };

/** What a composer's input runs as: a single-producer recipe's one part (@gt/catalog/recipes). */
export function runSpec(input: ComposerInput): Result<RunSpec> {
  const make = (kind: WorkKind, units: number, label: string): Result<RunSpec> => {
    const option = optionOf(kind, undefined);
    return option === undefined ? err("internal", `no option for ${kind}`) : ok({ kind, units, label, title: firstSentence(input.text, label), option });
  };
  switch (input.lane) {
    case "image": {
      const mechs = Math.max(1, input.mechanisms.length);
      if (input.sweep === true) return make("forge", SWEEP_STYLES * SWEEP_PLATES_PER_STYLE * mechs, `forge sweep · ${SWEEP_STYLES} styles`);
      const style = [...CANDIDATE_STYLES, ...PROVEN_STYLES].find((s) => s.id === input.styleId);
      return style === undefined ? err("invalid", `no style ${input.styleId}`) : make("forge", style.plates * mechs, `forge · ${style.name}`);
    }
    case "article": {
      const topic = TOPICS.find((t) => t.slug === input.topic);
      return topic === undefined ? err("invalid", `no registry topic ${input.topic}`) : make("article", 1, `article · ${topic.title}`);
    }
    case "audio":
      return input.kind === "music" ? make("track", 1, "track · music") : make("sfx", 2, "track · sfx");
    case "video": {
      const subject = SUBJECTS.find((s) => s.id === input.subject);
      return subject === undefined ? err("invalid", `no strip subject ${input.subject}`) : make("strips", subject.cards, `strips · ${subject.id}`);
    }
  }
}

export function runReceipt(u: Universe, input: ComposerInput, now: number, ceilingUsd?: number): Result<Receipt> {
  const spec = runSpec(input);
  if (!spec.ok) return spec;
  const { option, units, kind, label } = spec.value;
  const item: Item = { key: NEW, lane: option.lane, seconds: option.secondsPerUnit * Math.max(1, units), after: [], phase: "waiting", order: u.order };
  const placed = placeAll(u, now, { extra: [item] });
  const subject: ReceiptSubject = { kind: "run", lane: input.lane };
  const token = tokenOf(subject, { input: { ...input, text: "" }, kind, units, option: option.key }, u);
  return ok(receiptOf({ subject, lines: [lineOf({ key: kind, label, option, units }, placed.get(NEW), now)], mode: "dry", token, now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }));
}


export function launchRun(u: Universe, input: ComposerInput, token: string, now: number, ceilingUsd?: number): Result<Confirmed<LaunchedRun>> {
  const fresh = runReceipt(u, input, now, ceilingUsd);
  if (!fresh.ok) return fresh;
  // A worst case over the ceiling is not refused: the ceiling is where the job stops (Director's ruling).
  if (fresh.value.token !== token) return ok({ kind: "stale", fresh: fresh.value });
  const spec = runSpec(input);
  if (!spec.ok) return spec;
  const runId = `run-${++u.seq}`;
  const jobId = `job:run:${runId}`;
  u.jobs.set(jobId, { id: jobId, of: { kind: "run", id: runId }, title: spec.value.title, kind: spec.value.kind, media: input.lane, option: spec.value.option, units: spec.value.units, state: "queued", order: u.order++, attempt: 1, mode: "dry", ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
  return ok({ kind: "launched", runId, jobId });
}

/* ── projects ─────────────────────────────────────────────────────────────── */

function projectAt(u: Universe, id: string, rev: number): Result<FxProject> {
  const p = u.projects.get(id);
  if (p === undefined) return err("not-found", `no project ${id}`);
  if (p.rev !== rev) return err("conflict", `the plan moved: it is at rev ${p.rev}, the write named rev ${rev}`, { detail: "stale-rev" });
  return ok(p);
}

function draftOf(u: Universe, id: string, rev: number): Result<FxProject> {
  const p = projectAt(u, id, rev);
  if (!p.ok) return p;
  if (p.value.launched) return err("refused", `${p.value.title} is launched; a launched part changes route in Runs`);
  return p;
}

const touch = (p: FxProject, now: number): void => {
  p.rev++;
  p.updatedAt = now;
};

export function compose(u: Universe, input: ComposeInput, now: number): Result<{ readonly id: string }> {
  const recipe = recipeById(input.recipe);
  if (recipe === undefined) return err("invalid", `no recipe ${input.recipe}`);
  const take = KEPT_TAKES.find((t) => t.id === input.takeId);
  const topic = TOPICS.find((t) => t.slug === input.topic);
  // A topic is what an explainer or an article is made from; the titles are the kernel's (records/write.ts
  // `titleFor`), with the take's and the topic's own names where the real port finds them (./real.ts `compose`).
  const topical = recipe.family === "explainer" || recipe.family === "article";
  const title =
    input.title ??
    (recipe.family === "album"
      ? `${take?.title ?? input.takeId ?? "Untitled take"} — music video`
      : topical
        ? `${topic?.title ?? input.topic ?? "Untitled topic"} — ${recipe.family}`
        : recipe.family === "film"
          ? "Untitled film"
          : `Untitled ${recipe.label.toLowerCase()}`);
  const id = `${slug(title)}-${++u.seq}`;
  u.projects.set(id, {
    id,
    rev: 1,
    title,
    recipe,
    ...(recipe.family !== "album" && input.styleId !== undefined ? { styleId: input.styleId } : {}),
    ...(recipe.family === "album" && take !== undefined ? { takeId: take.id, runtimeS: take.durationS } : {}),
    ...(topical && input.topic !== undefined ? { topic: input.topic } : {}),
    createdAt: now,
    launched: false,
    parts: partsOf(id, recipe, input.units ?? {}),
    updatedAt: now,
  });
  return ok({ id });
}

export function setPart(u: Universe, id: string, rev: number, partId: string, patch: PartPatch, now: number): Result<FxProject> {
  const d = draftOf(u, id, rev);
  if (!d.ok) return d;
  const part = d.value.parts.find((x) => x.id === partId);
  if (part === undefined || !isWorkKind(part.kind)) return err("not-found", `no work part ${partId}`);
  if (patch.option !== undefined && !optionsOf(part.kind).some((o) => o.key === patch.option)) return err("invalid", `${patch.option} is not an option for ${part.kind}`);
  if (patch.units !== undefined) {
    const [lo, hi] = part.unitsRange ?? [part.units, part.units];
    if (patch.units < lo || patch.units > hi) return err("invalid", `${part.kind} takes ${lo}-${hi} units`);
    part.units = patch.units;
  }
  if (patch.option !== undefined) part.option = patch.option;
  touch(d.value, now);
  return ok(d.value);
}

export function rename(u: Universe, id: string, rev: number, title: string, now: number): Result<FxProject> {
  // A title is the project's, not its plan's: a launched one is renamed too, and its own words
  // write nothing (kernel records/write.ts `rename`).
  const d = projectAt(u, id, rev);
  if (!d.ok) return d;
  const t = title.trim();
  if (t.length === 0 || t.length > 200) return err("invalid", "a title is 1..200 characters");
  if (t === d.value.title) return d;
  d.value.title = t;
  touch(d.value, now);
  return d;
}

export function discard(u: Universe, id: string, rev: number): Result<{ readonly id: string }> {
  const d = draftOf(u, id, rev);
  if (!d.ok) return d;
  u.projects.delete(id);
  return ok({ id });
}

export function planReceipt(u: Universe, id: string, now: number, ceilingUsd?: number): Result<Receipt> {
  const p = u.projects.get(id);
  if (p === undefined) return err("not-found", `no project ${id}`);
  if (p.launched) return err("refused", `${p.title} is already launched`);
  const placed = placeAll(u, now, { preview: p.id });
  const lines = p.parts.flatMap((part) => {
    if (!isWorkKind(part.kind)) return [];
    const option = optionOf(part.kind, part.option);
    return option === undefined ? [] : [lineOf({ key: part.id, label: part.kind, option, units: part.units }, placed.get(part.id), now)];
  });
  const subject: ReceiptSubject = { kind: "project", id: p.id, rev: p.rev };
  const token = tokenOf(subject, p.parts.map((x) => [x.id, x.option, x.units]), u);
  return ok(receiptOf({ subject, lines, mode: "dry", token, now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }));
}

export function launchPlan(u: Universe, id: string, rev: number, token: string, now: number, ceilingUsd?: number): Result<Confirmed<LaunchedProject>> {
  const fresh = planReceipt(u, id, now, ceilingUsd);
  if (!fresh.ok) return fresh;
  const p = u.projects.get(id);
  if (p === undefined) return err("not-found", `no project ${id}`);
  if (fresh.value.token !== token || p.rev !== rev) return ok({ kind: "stale", fresh: fresh.value });
  const jobIds: string[] = [];
  for (const part of p.parts) {
    if (!isWorkKind(part.kind)) continue;
    const option = optionOf(part.kind, part.option);
    if (option === undefined) continue;
    const jobId = partJobId(part.id);
    u.jobs.set(jobId, { id: jobId, of: { kind: "part", id: part.id }, projectId: p.id, partId: part.id, title: `${p.title} · ${part.kind}`, kind: part.kind, option, units: part.units, state: "queued", order: u.order++, attempt: 1, mode: "dry", ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
    jobIds.push(jobId);
  }
  p.launched = true;
  p.launchedAt = now;
  touch(p, now);
  return ok({ kind: "launched", projectId: p.id, rev: p.rev, jobIds });
}

/* ── the Runs acts ────────────────────────────────────────────────────────── */

function jobOf(u: Universe, id: string): Result<FxJob> {
  const j = u.jobs.get(id);
  return j === undefined ? err("not-found", `no job ${id}`) : ok(j);
}

function move(j: FxJob, to: JobState, now: number, u: Universe): Result<FxJob> {
  if (!jobMachine.can(j.state, to)) return err("refused", `${j.title} is ${j.state}; it cannot go ${to}`);
  j.state = to;
  const p = j.projectId === undefined ? undefined : u.projects.get(j.projectId);
  if (p !== undefined) p.updatedAt = now;
  return ok(j);
}

export function pauseJob(u: Universe, id: string, now: number): Result<ActOutcome> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  const was = j.value.state;
  const r = move(j.value, "paused", now, u);
  return r.ok ? ok({ jobId: id, note: `paused · held at ${was}` }) : r;
}

export function resumeJob(u: Universe, id: string, now: number): Result<ActOutcome> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  // The machine lets failed and interrupted go to queued too, but that edge is the retry's (and an
  // interruption's is the operator's look first): only a paused job resumes (kernel job.ts `resume`).
  if (j.value.state !== "paused") return err("refused", `job ${id} is ${j.value.state}; only a paused job resumes`);
  const r = move(j.value, "queued", now, u);
  return r.ok ? ok({ jobId: id, note: "resumed · back to queued" }) : r;
}

const holdNames = (u: Universe, j: FxJob): ResourceLane | null => (u.holds.get(j.option.lane)?.jobId === j.id ? j.option.lane : null);

/** Who acts: the operator unless the caller names someone else (the MCP door's agent). */
const OPERATOR: Actor = { kind: "operator", id: "operator" };

export function retryJob(u: Universe, id: string, now: number, ceilingUsd?: number, by: Actor = OPERATOR): Result<ActOutcome> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  // The real port's order: the hold first (./real.ts), then the kernel's retry (job.ts) - its actor, then its state.
  const held = holdNames(u, j.value);
  if (held !== null) return err("refused", `${held} is on hold for this job: acknowledge the hold first`);
  if (by.kind !== "operator") return err("refused", `job ${id}: only an operator retries a ${j.value.state} job; ${by.kind} ${by.id} may not`);
  if (j.value.state !== "failed" && j.value.state !== "interrupted") return err("refused", `job ${id} is ${j.value.state}; only a failed or interrupted job is retried`);
  const r = move(j.value, "queued", now, u);
  if (!r.ok) return r;
  j.value.attempt++;
  delete j.value.error;
  if (ceilingUsd !== undefined) j.value.ceilingUsd = ceilingUsd;
  return ok({ jobId: id, note: `retry · attempt ${j.value.attempt} · same route${ceilingUsd === undefined ? "" : ` · ceiling $${ceilingUsd}`}` });
}

export function moveJob(u: Universe, id: string, dir: "earlier" | "later", now: number): Result<ActOutcome> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  if (j.value.state !== "queued" && j.value.state !== "planned") return err("refused", `job ${id} is ${j.value.state}; only a waiting job (queued or planned) moves in the line`);
  const placed = placeAll(u, now);
  const at = (x: FxJob): number => placed.get(x.partId ?? x.id)?.s ?? Number.POSITIVE_INFINITY;
  const lane = [...u.jobs.values()].filter((x) => x.option.lane === j.value.option.lane && (x.state === "queued" || x.state === "planned")).sort((a, b) => at(a) - at(b) || a.order - b.order);
  const i = lane.indexOf(j.value);
  const k = lane[i + (dir === "earlier" ? -1 : 1)];
  if (k === undefined) return err("refused", "end of the lane queue");
  const o = j.value.order;
  j.value.order = k.order;
  k.order = o;
  return ok({ jobId: id, note: `${dir === "earlier" ? "ahead of" : "behind"} ${k.title}` });
}

/** The project's ETA, or the run's own end, as placed now. */
function etaOf(u: Universe, j: FxJob, now: number): number {
  const placed = placeAll(u, now);
  const p = j.projectId === undefined ? undefined : u.projects.get(j.projectId);
  const keys = p === undefined ? [j.id] : p.parts.map((x) => x.id);
  return Math.max(now, ...keys.map((k) => placed.get(k)?.e ?? now));
}

function withOption<T>(j: FxJob, o: ModelOption, f: () => T): T {
  const was = j.option;
  j.option = o;
  try {
    return f();
  } finally {
    j.option = was;
  }
}

export function rerouteOptions(u: Universe, id: string, now: number): Result<readonly RerouteOption[]> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  const job = j.value;
  const eta0 = etaOf(u, job, now);
  const usd0 = costOf(job.option, job.units).usd ?? 0;
  const current = job.option.key;
  return ok(
    optionsOf(job.kind).map((o) =>
      withOption(job, o, () => ({
        option: o,
        current: o.key === current,
        dEtaS: Math.round((etaOf(u, job, now) - eta0) / 1000),
        dUsd: Math.round(((costOf(o, job.units).usd ?? 0) - usd0) * 100) / 100,
        queuePos: placeAll(u, now).get(job.partId ?? job.id)?.queuePos ?? 1,
      })),
    ),
  );
}

export function reroute(u: Universe, id: string, key: string, now: number, token?: string, ceilingUsd?: number): Result<RerouteResult> {
  const j = jobOf(u, id);
  if (!j.ok) return j;
  const job = j.value;
  if (job.state === "running" || job.state === "done" || job.state === "cancelled") return err("refused", `${job.title} is ${job.state}; its route is fixed`);
  const o = optionsOf(job.kind).find((x) => x.key === key);
  if (o === undefined) return err("invalid", `${key} is not an option for ${job.kind}`);
  if (o.key === job.option.key) return err("refused", "that is the current route");
  const p = job.projectId === undefined ? undefined : u.projects.get(job.projectId);
  const subject: ReceiptSubject = p === undefined ? { kind: "run", lane: job.media ?? "image" } : { kind: "project", id: p.id, rev: p.rev };
  const receipt = withOption(job, o, () => {
    const placed = placeAll(u, now);
    return receiptOf({ subject, lines: [lineOf({ key: job.partId ?? job.id, label: job.kind, option: o, units: job.units }, placed.get(job.partId ?? job.id), now)], mode: job.mode, token: tokenOf(subject, { id, key }, u), now, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) });
  });
  if (token === undefined) return ok({ kind: "receipt", receipt });
  if (token !== receipt.token) return ok({ kind: "stale", fresh: receipt });
  const held = holdNames(u, job);
  if (held !== null) return err("refused", `${held} is on hold for this job: acknowledge the hold first`);
  const from = job.option.label;
  job.option = o;
  if (job.state === "failed" || job.state === "interrupted") {
    job.state = "queued";
    job.attempt++;
    delete job.error;
  }
  if (ceilingUsd !== undefined) job.ceilingUsd = ceilingUsd;
  if (p !== undefined) {
    const part = p.parts.find((x) => x.id === job.partId);
    if (part !== undefined) part.option = o.key;
    touch(p, now);
  }
  return ok({ kind: "done", act: { jobId: id, note: `re-routed · ${from} → ${o.label}` } });
}

export function ackLane(u: Universe, lane: ResourceLane, by: Actor = OPERATOR): Result<ActOutcome> {
  // An agent cannot vouch that it looked (kernel job-queue.ts `ackLane`).
  if (by.kind !== "operator") return err("refused", `lane ${lane}: only an operator acknowledges a held lane; ${by.kind} ${by.id} may not`);
  const h = u.holds.get(lane);
  if (h === undefined) return err("refused", `lane ${lane} is not held`);
  u.holds.delete(lane);
  return ok({ jobId: h.jobId, note: `${lane} hold acknowledged` });
}
