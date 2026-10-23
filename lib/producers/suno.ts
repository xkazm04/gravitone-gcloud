import { AppError, errorMessage } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { Producer, StepContext } from "@gt/kernel/job-core";
import { cancel, list, pause, resume, retry } from "@gt/kernel/job";
import { ackLane, laneHold } from "@gt/kernel/job-queue";
import type { Store } from "@gt/kernel/store";
import { JOB_USD } from "@gt/kernel/spend/meter";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { defineSuno, SUNO_CREDITS } from "@gt/producers/suno/producer";

import { standClipRefs } from "@/lib/sound/suno/fakeDriver";
import type { SunoDriver } from "@/lib/sound/suno/drivers";
import { mintSunoId, readSuno, withSuno, type SunoFile } from "@/lib/sound/suno/store";
import { draftLabel, dropUnlaunched, ensureDraftJob, type DraftSource } from "@/lib/sound/suno/draft";
import type { ReasonFn } from "@/lib/sound/suno/propose";
import type { SunoClip, SunoClipRef, SunoJob, SunoPhase } from "@/lib/suno/types";

import { creditOption, driveProducer, holdsSlot, jobIdOf, launchJobs, launchNow, must, soundKernel, type Drive, type DriveOptions, type LaunchOptions, type LaunchResult, type LaunchSpec } from "./sound";

// THE SUNO PRODUCER, BOUND (Phase 4, L31) - packages/producers/src/suno's ports
// bound to the browser driver and to suno.json, which stays the ARTEFACT store
// (proposals, jobs, clips) for the board, the ledger and the decision readers.
// The kernel job is the truth for running state; the records mirror it.
//
// REMOVED: the in-process `globalThis.__gtSunoWorker` singleton, which was the
// queue's only lease - two processes on one store could drive the same Chrome
// tab. The kernel's fenced slot lease on box.chrome#1 is Suno's first cross-
// process lease. `queue.interrupted` (the whole queue switched off on a crash)
// is the kernel's per-lane HOLD on box.chrome, naming the job and the model in
// flight, until the operator acknowledges it (Start does: v1's "I have looked").
// `SUNO_DRIVER=fake` as the dry mechanism is the job's MODE now: every create is
// declared through the meter with `standClipRefs` as its stand-in.
//
// One kernel job per v1 job, `job:run:suno.<v1 id>`, derived (never stored as
// the key), so a launch that died between the two stores adopts its job again.

export const SUNO_PRODUCER = "suno";
export const sunoRunId = (j: Pick<SunoJob, "id">): string => `suno.${j.id}`;
export const sunoKernelId = (j: Pick<SunoJob, "id">): string => `job:run:${sunoRunId(j)}`;

export function sunoKernelJobs(store: Store = soundKernel().store): Map<string, Job> {
  return new Map(must(list(store)).filter((j) => j.producer === SUNO_PRODUCER).map((j) => [j.id, j]));
}

/* ── the ports ────────────────────────────────────────────────────────────── */

/** A fenced write of the job's record: nothing lands for a driver that was taken over. */
async function patchRecord(job: Job, fn: (x: SunoJob, f: SunoFile) => void, ctx: StepContext): Promise<SunoJob> {
  holdsSlot(ctx);
  return withSuno((f) => {
    const x = f.jobs.find((y) => sunoKernelId(y) === job.id);
    if (x === undefined) throw new AppError("not-found", `no Suno record serves kernel job ${job.id}`);
    fn(x, f);
    return { ...x, clipIds: [...x.clipIds] };
  });
}

export function sunoProducer(binding: { readonly driver: SunoDriver }): Producer {
  const driver = binding.driver;
  return defineSuno({
    async create(job, model, ctx) {
      const f = await readSuno();
      const rec = f.jobs.find((x) => sunoKernelId(x) === job.id);
      if (rec === undefined) throw new AppError("not-found", `no Suno record serves kernel job ${job.id}`);
      // Resume skips a model that has clips: a create that landed them and died
      // before the kernel booked it is not paid for twice.
      if (f.clips.some((c) => c.jobId === rec.id && c.model === model)) return "skipped";
      await patchRecord(
        job,
        (x) => {
          if (x.state !== "active") {
            x.state = "active";
            x.startedAt = Date.now();
            delete x.endedAt;
            delete x.error;
          }
          x.job = job.id;
          x.model = model;
          x.phase = "attaching";
        },
        ctx,
      );
      // Phase writes are chained, not awaited inline (v1): the driver is not
      // held up by a disk write, and the last write lands before the clips do.
      // A phase is what the column DRAWS, so a write that fails (a busy disk, a
      // lost fence - the clips' own write then refuses) does not stop a create
      // whose credits are being spent; a process death inside one is carried
      // out after the create, never swallowed.
      let writes = Promise.resolve();
      let died: { readonly cause: unknown } | undefined;
      let last: SunoPhase = "attaching";
      const onPhase = (phase: SunoPhase): void => {
        if (phase === last) return;
        last = phase;
        writes = writes.then(() => patchRecord(job, (x) => void ((x.model = model), (x.phase = phase)), ctx)).then(
          () => undefined,
          (e: unknown) => {
            if (!(e instanceof Error)) died ??= { cause: e };
          },
        );
      };
      const intent: CallIntent<SunoClipRef[]> = {
        provider: "suno",
        model,
        usage: {},
        quote: { usd: null, basis: "unpriced", note: SUNO_CREDITS },
        payload: { fields: { ...rec.fields }, model },
        subject: { kind: "job", id: job.id },
        stand: () => standClipRefs(rec.fields, model),
      };
      const credits: SettleEntry = { amount: undefined, outcome: "served", basis: "credits", axes: { producer: SUNO_PRODUCER, model }, reason: SUNO_CREDITS };
      let refs: SunoClipRef[];
      try {
        const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => ({ value: await driver.create(rec.fields, model, onPhase), entries: [credits] }));
        refs = must(r);
      } finally {
        await writes;
      }
      if (died !== undefined) throw died.cause;
      if (!refs.length) throw new Error(`Suno returned no clips for ${model}`);
      await patchRecord(
        job,
        (x, file) => {
          const now = Date.now();
          for (const ref of refs) {
            const c: SunoClip = { ...ref, id: mintSunoId("sc"), origin: "queue", jobId: x.id, model, createdAt: now, verdict: null, prompt: { ...x.fields } };
            file.clips.push(c);
            x.clipIds.push(c.id);
          }
        },
        ctx,
      );
      return "made";
    },
    async land(job, ctx) {
      await patchRecord(
        job,
        (x, f) => {
          x.state = "done";
          x.endedAt = Date.now();
          delete x.phase;
          delete x.model;
          const p = f.proposals.find((y) => y.id === x.proposalId);
          if (p) delete p.error;
        },
        ctx,
      );
    },
    async fail(job, message, ctx) {
      await patchRecord(
        job,
        (x, f) => {
          x.state = "failed";
          x.endedAt = Date.now();
          x.error = message;
          delete x.phase;
          delete x.model;
          const p = f.proposals.find((y) => y.id === x.proposalId);
          if (p) p.error = message;
        },
        ctx,
      );
    },
    async health() {
      // v1's pause: a driver that is not ok claims nothing and fails no job.
      const h = await driver.probe().catch((e: unknown) => ({ ok: false as const, reason: errorMessage(e) }));
      return h.ok ? { ok: true } : { ok: false, reason: h.reason ?? "Suno is not reachable" };
    },
  });
}

/* ── launch, drive, and the operator's acts ──────────────────────────────── */

const PACE = "illustrative: two models a prompt, two clips of about two minutes each (prototype model.js estimate.audio)";

const SUNO_OPTION = creditOption({ key: "track/suno/v6+v6-wild", lane: "box.chrome", provider: "suno", model: "v6 + v6-wild", label: "Suno v6 + v6-wild · serial", seconds: 300, why: SUNO_CREDITS, pace: PACE });

export function sunoLine(j: SunoJob): LaunchSpec["lines"][number] {
  return { jobId: sunoKernelId(j), runId: sunoRunId(j), label: j.fields.title ?? j.fields.style, option: SUNO_OPTION };
}

async function sunoSpec(ids: readonly string[]): Promise<LaunchSpec> {
  const f = await readSuno();
  const lines = ids.map((id) => {
    const j = f.jobs.find((x) => x.id === id);
    if (j === undefined) throw new AppError("not-found", `no Suno job ${id}`);
    return sunoLine(j);
  });
  return { producer: SUNO_PRODUCER, media: "audio", lines };
}

async function nameJobs(jobIds: readonly string[]): Promise<void> {
  const ids = new Set(jobIds);
  await withSuno((f) => {
    for (const j of f.jobs) if (ids.has(sunoKernelId(j))) j.job = sunoKernelId(j);
  });
}

/** Launch queued v1 records as kernel jobs: a receipt without `token`, the jobs with it. */
export async function launchSuno(ids: readonly string[], o: LaunchOptions): Promise<LaunchResult> {
  const r = launchJobs(await sunoSpec(ids), o);
  if (r.kind === "launched") await nameJobs(r.jobIds);
  return r;
}

/**
 * A Suno take from a SENTENCE or a SEED, launched under the job id its receipt minted (L52: the
 * Floor's audio composer, the Audio lane's composer). Without `token` it is the receipt and writes
 * nothing - no turn, no record. With it: the receipt is re-read first (a stale token answers the
 * fresh receipt before any text turn is paid), the proposal and its queued record are written
 * (lib/sound/suno/draft.ts, idempotent by the job id), then the kernel job in one transaction; a
 * queue that moved in between answers stale and the record is taken back out. The line's label
 * is the draft's own words (`draftLabel`), which the turn does not change, so the receipt the
 * operator read and the one the confirm recomputes are the same receipt.
 */
export async function launchSunoDraft(jobId: string, source: DraftSource, o: LaunchOptions & { readonly reason?: ReasonFn }): Promise<LaunchResult> {
  const id = { id: jobId };
  const spec: LaunchSpec = { producer: SUNO_PRODUCER, media: "audio", lines: [{ jobId: sunoKernelId(id), runId: sunoRunId(id), label: draftLabel(source), option: SUNO_OPTION }] };
  const { token, reason, ...read } = o;
  const pre = launchJobs(spec, read);
  if (token === undefined || pre.kind !== "receipt") return pre;
  if (pre.receipt.token !== token) return { kind: "stale", fresh: pre.receipt };
  await ensureDraftJob(jobId, source, { dry: o.mode === "dry", now: o.now ?? Date.now(), ...(reason === undefined ? {} : { reason }) });
  const r = launchJobs(spec, { ...read, token });
  if (r.kind === "stale") await dropUnlaunched(jobId);
  if (r.kind === "launched") await nameJobs(r.jobIds);
  return r;
}

export async function launchSunoNow(ids: readonly string[], o: Omit<LaunchOptions, "token">): Promise<Extract<LaunchResult, { kind: "launched" }>> {
  const r = launchNow(await sunoSpec(ids), o);
  await nameJobs(r.jobIds);
  return r;
}

export const driveSuno = (jobIds: readonly string[], o: DriveOptions & { readonly driver: SunoDriver }): Promise<Drive> => driveProducer(sunoProducer({ driver: o.driver }), jobIds, o);

/** Stop between models: every waiting or running Suno job pauses; the create in flight finishes. */
export function pauseSunoJobs(actor: Actor, store: Store = soundKernel().store): string[] {
  const out: string[] = [];
  for (const j of sunoKernelJobs(store).values()) {
    if (j.state !== "queued" && j.state !== "running") continue;
    must(pause(store, j.id, actor));
    out.push(j.id);
  }
  return out;
}

/**
 * Start, which was v1's "I have looked": the box.chrome hold a Suno crash left
 * is acknowledged, paused jobs resume, and interrupted ones are retried - the
 * create in flight is re-made only if it landed no clips (the port's check).
 */
export function resumeSunoJobs(actor: Actor, store: Store = soundKernel().store): string[] {
  const jobs = sunoKernelJobs(store);
  const hold = must(store.read((r) => laneHold(r, "box.chrome")));
  if (hold !== undefined && jobs.has(hold.jobId)) must(ackLane(store, "box.chrome", actor));
  const out: string[] = [];
  for (const j of jobs.values()) {
    if (j.state === "paused") must(resume(store, j.id, actor));
    else if (j.state === "interrupted") must(retry(store, j.id, actor));
    else continue;
    out.push(j.id);
  }
  return out;
}

export const cancelSunoJob = (id: string, actor: Actor, store: Store = soundKernel().store): Job => must(cancel(store, jobIdOf(id), actor));

