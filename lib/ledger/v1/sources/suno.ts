import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";

import { readSuno } from "../../../../lib/sound/suno/store.ts";
import { bump, digest, facts, instant, words } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Source, WeirItem } from "../types.ts";

// THE SUNO QUEUE, PROJECTED - <sound store>/suno.json (lib/sound/suno/store.ts,
// one file: queue switch, proposals, jobs, clips), read through `readSuno`.
//
// NOT through `sunoSnapshot`, which the brief names: a snapshot read probes the
// browser driver over CDP AND kicks the worker (lib/sound/suno/queue.ts:
// "a snapshot read is a kick"), so a projection that read it would start
// creating on suno.com - spending the operator's credits - whenever the queue
// is switched on. `readSuno` is the same file, unlocked and side-effect free.
//
// Clocks are epoch ms (normalised in facts.ts). Recorded:
//   proposal.create  `createdAt`, once per proposal
//   job.enqueue      `enqueuedAt`, keyed by its value
//   job.start        `startedAt`, keyed by its value: a Stop between models or a
//                    crash sends the job back to `queued`, and the next run
//                    stamps a new startedAt - each attempt is its own fact
//   job.end          `endedAt` (done, failed, cancelled), with the driver's error verbatim
//   clip.create      each clip's `createdAt`
// Observed: verdict.keep|drop (a clip's verdict has no instant), and
// queue.interrupt - the switch-off-on-crash sentence (`queue.interrupted`),
// keyed by its digest, because it is the operator's cue to check the Suno
// library before anything re-spends.
//
// LIVE: queued and active jobs (store.ts isLiveJob's set). `active` is running.
// `queued` is queued while the switch is on and `paused` while it is off - the
// queue drains only when the operator presses Start (queue.ts). A queued job
// that `queue.interrupted` names (recover() quotes `"<title or style>"`) is
// `interrupted`, carrying that sentence as its error. Lane box.chrome: the
// worker drives the render box's Chrome profile (lib/suno/driver).
//
// THE WEIR: clips with no verdict are one cull pile - the Sound lab's triage.

const MODEL = z.string();
const jobSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string(),
  fields: z.object({ title: z.string().optional(), style: z.string() }),
  state: z.enum(["queued", "active", "done", "failed", "cancelled"]),
  phase: z.string().optional(),
  model: MODEL.optional(),
  models: z.array(MODEL),
  enqueuedAt: z.number(),
  startedAt: z.number().optional(),
  endedAt: z.number().optional(),
  error: z.string().optional(),
  clipIds: z.array(z.string()),
});
const fileSchema = z.object({
  queue: z.object({ running: z.boolean(), interrupted: z.string().optional() }),
  proposals: z.array(z.object({ id: z.string().min(1), origin: z.string(), createdAt: z.number() })),
  jobs: z.array(jobSchema),
  clips: z.array(
    z.object({ id: z.string().min(1), origin: z.string(), jobId: z.string().nullable(), model: MODEL, createdAt: z.number(), verdict: z.enum(["keep", "drop"]).nullable(), title: z.string(), durationS: z.number().nullable() }),
  ),
});

export type SunoSnapshot = Parsed<z.output<typeof fileSchema>>;
type Job = SunoSnapshot["jobs"][number];

const QUEUE: Actor = { kind: "machine", id: "suno-queue" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const HREF = "/board";
const LIVE_STATES: readonly Job["state"][] = ["queued", "active"];

async function read(): Promise<Result<SunoSnapshot>> {
  let raw: unknown;
  try {
    raw = await readSuno();
  } catch (e) {
    return err("unavailable", `suno: readSuno failed: ${words(e)}`, { cause: e });
  }
  return parseAt("suno.json", fileSchema, raw);
}

const titleOf = (j: Pick<Job, "fields">): string => j.fields.title ?? j.fields.style;

/** The job recover() named, by the quoted title it wrote; null when the sentence names none of these. */
export function interruptedJob(jobs: readonly Job[], sentence: string | undefined): string | null {
  if (sentence === undefined) return null;
  return jobs.find((j) => j.state === "queued" && sentence.startsWith(`"${titleOf(j)}"`))?.id ?? null;
}

function eventsOf(s: SunoSnapshot, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("suno", ctx);
  const out: IngestEvent[] = s.proposals.map((p) =>
    f.recorded(p.id, "create", p.createdAt, { actor: p.origin === "custom" ? OPERATOR : { kind: "agent", id: `suno-${p.origin}` }, type: "proposal.create", subject: { kind: "proposal", id: p.id }, data: { origin: p.origin } }),
  );
  for (const j of s.jobs) {
    const subject = { kind: "job", id: j.id };
    const data: EventData = { runId: j.id, proposalId: j.proposalId, title: titleOf(j), models: j.models };
    const at = { subject, lane: "box.chrome" } as const;
    out.push(f.recorded(j.id, `enqueue.${j.enqueuedAt}`, j.enqueuedAt, { ...at, actor: OPERATOR, type: "job.enqueue", data }));
    if (j.startedAt !== undefined) out.push(f.recorded(j.id, `start.${j.startedAt}`, j.startedAt, { ...at, actor: QUEUE, type: "job.start", data }));
    if (j.endedAt !== undefined) {
      out.push(f.recorded(j.id, `end.${j.endedAt}.${j.state}`, j.endedAt, { ...at, actor: QUEUE, type: "job.end", data: { ...data, state: j.state, ...(j.error === undefined ? {} : { error: j.error }) } }));
    }
  }
  for (const c of s.clips) {
    const data: EventData = { runId: c.jobId ?? c.id, origin: c.origin, model: c.model, title: c.title, durationS: c.durationS };
    out.push(f.recorded(c.id, "create", c.createdAt, { actor: QUEUE, type: "clip.create", subject: { kind: "clip", id: c.id }, lane: "box.chrome", data }));
    if (c.verdict !== null) out.push(f.observed(c.id, `verdict.${c.verdict}`, { actor: OPERATOR, type: `verdict.${c.verdict}`, subject: { kind: "clip", id: c.id }, data: { runId: c.jobId ?? c.id } }));
  }
  const why = s.queue.interrupted;
  if (why !== undefined) out.push(f.observed("queue", `interrupt.${digest(why)}`, { actor: QUEUE, type: "queue.interrupt", subject: { kind: "queue", id: "suno" }, data: { error: why } }));
  return out;
}

function tallyOf(s: SunoSnapshot): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const j of s.jobs) {
    bump(records, `job.${j.state}`);
    bump(fs, "job.enqueue");
    if (j.startedAt !== undefined) bump(fs, "job.start");
    if (j.endedAt !== undefined) bump(fs, "job.end");
  }
  bump(records, "proposal", s.proposals.length);
  bump(records, "clip", s.clips.length);
  bump(fs, "proposal.create", s.proposals.length);
  bump(fs, "clip.create", s.clips.length);
  for (const c of s.clips) if (c.verdict !== null) bump(fs, `verdict.${c.verdict}`);
  if (s.queue.interrupted !== undefined) bump(fs, "queue.interrupt");
  return { records, facts: fs };
}

function liveOf(s: SunoSnapshot): LiveJob[] {
  const named = interruptedJob(s.jobs, s.queue.interrupted);
  return s.jobs
    .filter((j) => LIVE_STATES.includes(j.state))
    .map((j) => {
      const state: JobState = j.state === "active" ? "running" : j.id === named ? "interrupted" : s.queue.running ? "queued" : "paused";
      const startedAt = j.state === "active" ? instant(j.startedAt) : null;
      const made = s.clips.filter((c) => c.jobId === j.id).map((c) => c.model);
      return {
        source: "suno",
        id: j.id,
        title: `suno ${titleOf(j)}`,
        lane: "box.chrome" as const,
        media: "audio" as const,
        state,
        ...(startedAt === null ? {} : { startedAt }),
        progress: { done: j.models.filter((m) => made.includes(m)).length, total: j.models.length, ...(j.phase === undefined ? {} : { stage: j.model === undefined ? j.phase : `${j.phase} ${j.model}` }) },
        ...(state === "interrupted" && s.queue.interrupted !== undefined ? { error: s.queue.interrupted } : j.error === undefined ? {} : { error: j.error }),
        href: HREF,
      };
    });
}

function weirOf(s: SunoSnapshot): WeirItem[] {
  const pending = s.clips.filter((c) => c.verdict === null);
  if (pending.length === 0) return [];
  const oldest = instant(Math.min(...pending.map((c) => c.createdAt)));
  return [{ source: "suno", id: "suno/triage", title: "suno clips to judge", media: "audio", kind: "cull", ...(oldest === null ? {} : { since: oldest }), decided: s.clips.length - pending.length, pending: pending.length, href: HREF }];
}

export function projectSuno(s: SunoSnapshot, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s, ctx), live: liveOf(s), weir: weirOf(s), tally: tallyOf(s), skipped: [] };
}

export const sunoSource: Source<SunoSnapshot> = { id: "suno", read, project: projectSuno };
