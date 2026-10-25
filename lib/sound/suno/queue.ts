// THE SUNO QUEUE — the operator's acts on suno.json's records, and the
// snapshot the Queue column reads. Server-only: it names SUNO_DRIVER and
// reaches the browser driver.
//
// SINCE PHASE 4 (L31) A PROMPT'S RENDER IS A KERNEL JOB on box.chrome. The v1
// worker that lived here - the `globalThis.__gtSunoWorker` singleton (the
// queue's ONLY lease: two processes could drive one Chrome tab), its lazy kick
// on every read, the first-start recovery that switched the whole queue off -
// is gone; packages/producers/src/suno is the definition, lib/producers/suno.ts
// binds it to the driver and to this store, and the kernel leases the lane,
// recovers a crash as `interrupted` and HOLDS box.chrome until the operator
// looks. suno.json stays the artefact store; the kernel job is the running
// truth, and `sunoSnapshot` overlays it onto the records.
//
// WHAT AN ACT DOES, NOW:
//   enqueue  a record per proposal, `queued` - it NEVER spends (v1's rule:
//            a batch is reviewed in the column before it runs). Idempotent per
//            proposal while a job is live; a proposal that has rendered is
//            refused ("riff it").
//   Start    the column's switch on: the box.chrome hold a Suno crash left is
//            acknowledged (the press was v1's "I have looked"), paused jobs
//            resume, interrupted ones are retried, and every queued record
//            without a job is LAUNCHED - a receipt, confirmed by the press.
//   Stop     every waiting or running job pauses; the create in flight finishes.
//   cancel   a waiting job only: one that is creating is refused - its credits
//            are already spent.
// Nothing here drives a job: the worker (L27) or pipeline/suno.mts does.

import { SUNO_MODEL_LABEL, SUNO_MODELS, type SunoFields, type SunoJob, type SunoLane, type SunoQueueState, type SunoSnapshot } from "@/lib/suno/types";

import { UNGROUPED_LANE } from "@/lib/board/pipeline";
import { errorMessage } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { Receipt } from "@gt/domain/produce";
import { cancelSunoJob, launchSuno, launchSunoNow, pauseSunoJobs, resumeSunoJobs, sunoKernelId, sunoKernelJobs } from "@/lib/producers/suno";
import { OPERATOR } from "@/lib/producers/sound";

import { readHunts, safeId, SoundError } from "../store";
import type { Hunt, HuntNode } from "../types";
import { sunoDriver } from "./drivers";
import { clearSuno, clip, EXCLUDE_MAX, INSTRUMENTAL, isCandidate, isLiveJob, mintSunoId, readSuno, STYLE_MAX, TITLE_MAX, withSuno, type SunoFile } from "./store";

/* ── the driver ───────────────────────────────────────────────────────────── */

export { FAKE_SUNO_DRIVER, REAL_SUNO, sunoDriver, type SunoDriver } from "./drivers";

/* ── enqueue / cancel ─────────────────────────────────────────────────────── */

function jobOf(f: SunoFile, proposalId: string, now: number): SunoJob {
  const p = f.proposals.find((x) => x.id === proposalId);
  if (!p) throw new SoundError(`no Suno proposal ${proposalId}`, 404);
  return { id: mintSunoId("sj"), proposalId: p.id, fields: { ...p.fields }, lane: { ...p.lane }, state: "queued", models: [...SUNO_MODELS], enqueuedAt: now, clipIds: [] };
}

/** Queue proposals, in the order given. Idempotent: a proposal already queued
 *  or running returns its live job instead of a second one. A proposal whose
 *  last job is done is refused: it has clips, and a second render is a riff. */
function enqueueIn(f: SunoFile, ids: readonly string[], now: number): SunoJob[] {
  const out: SunoJob[] = [];
  ids.forEach((id, i) => {
    const p = f.proposals.find((x) => x.id === id);
    if (!p) throw new SoundError(`no Suno proposal ${id}`, 404);
    const live = f.jobs.find((j) => j.proposalId === id && isLiveJob(j));
    if (live) {
      out.push(live);
      return;
    }
    if (!isCandidate(f, p)) throw new SoundError(`"${p.fields.title ?? p.fields.style}" has already rendered; riff it for another take`, 409);
    const job = jobOf(f, id, now + i);
    f.jobs.push(job);
    out.push(job);
  });
  return out;
}

export async function enqueueProposals(ids: readonly string[], now = Date.now(), opts: { launch?: boolean } = {}): Promise<SunoJob[]> {
  if (!ids.length) throw new SoundError('"proposalIds" is empty: name at least one proposal', 400);
  ids.forEach(safeId);
  const jobs = await withSuno((f) => enqueueIn(f, ids, now));
  // pipeline/suno.mts `enqueue` never launches: its enqueue never spends, whatever the switch says.
  if (opts.launch !== false) await launchIfRunning(jobs);
  return jobs;
}

/** The kernel's queued Suno jobs of one mode, in queue order: what a drive takes.
 *  By mode, because a dry drive binds the fake driver and must never reach a live job. */
export function queuedSunoJobs(mode: "dry" | "live"): string[] {
  return [...sunoKernelJobs().values()].filter((j) => j.state === "queued" && j.mode.kind === mode).map((j) => j.id);
}

/** The records waiting for Start (queued, no job yet). */
export const waitingSunoIds = (): Promise<string[]> => waitingIds();

/** The column's mode: a process that may only run dry (every test lane, the
 *  fixture universe) launches dry; otherwise Start is the operator's live arm. */
const columnMode = (): "dry" | "live" => (process.env["GRAVITONE_DRY_ONLY"] === "1" ? "dry" : "live");

/** While the switch is on, what was just queued is launched at once (v1: the kick drained it). */
async function launchIfRunning(jobs: readonly SunoJob[]): Promise<void> {
  const kernel = sunoKernelJobs();
  const ids = jobs.filter((j) => j.state === "queued" && !kernel.has(sunoKernelId(j))).map((j) => j.id);
  if (!ids.length || !(await readSuno()).queue.running) return;
  await launchSunoNow(ids, { mode: columnMode(), actor: OPERATOR });
}

/* ── a hunt leaf becomes a proposal ───────────────────────────────────────── */

const VOCAL = /\b(vocals?|vocalist|singing|sung|singer|choir|rap|rapper|lyrics?)\b/i;
const NOT_VOCAL = /\b(no|without|wordless)\s+(vocals?|singing|lyrics)\b|\binstrumental\b/i;

/** A Suno style line from a leaf's fields: genre, mood, instruments, tempo,
 *  key — the leaf's own drafted terms, in Suno's comma-tag idiom. A leaf
 *  drafted before the terms existed falls back to its prompt text. */
export function styleOfLeaf(node: HuntNode, hunt: Pick<Hunt, "kind">): string {
  const t = node.terms;
  const tags = [
    ...t.genre,
    ...t.mood,
    ...t.instrument,
    ...(hunt.kind === "sfx" && t.sfxCategory ? [t.sfxCategory, "sound effect"] : []),
    ...(node.tempoBpm ? [`${Math.round(node.tempoBpm)} bpm`] : []),
    ...(node.key ? [node.key] : []),
  ].map((x) => x.trim()).filter(Boolean);
  const line = tags.length >= 2 ? [...new Set(tags)].join(", ") : node.prompt;
  return clip(line || node.label, STYLE_MAX);
}

export function isVocalLeaf(node: HuntNode): boolean {
  const text = `${node.prompt} ${node.terms.instrument.join(" ")}`;
  return VOCAL.test(text) && !NOT_VOCAL.test(text);
}

export function fieldsOfLeaf(hunt: Hunt, node: HuntNode): SunoFields {
  const out: SunoFields = { title: clip(node.label || hunt.idea, TITLE_MAX), style: styleOfLeaf(node, hunt) };
  if (!isVocalLeaf(node)) out.lyrics = INSTRUMENTAL;
  if (node.negative) out.exclude = clip(node.negative, EXCLUDE_MAX);
  return out;
}

/** "<huntId>:<nodeId>" or a bare node id (node ids are minted unique). */
function findLeaf(hunts: readonly Hunt[], ref: string): { hunt: Hunt; node: HuntNode } {
  const [a, b] = ref.includes(":") ? ref.split(":", 2) : [null, ref];
  safeId(b);
  for (const hunt of hunts) {
    if (a !== null && hunt.id !== a) continue;
    const node = hunt.nodes.find((n) => n.id === b);
    if (node) return { hunt, node };
  }
  throw new SoundError(`no hunt leaf ${ref}`, 404);
}

/** Queue hunt leaves. ONE proposal per leaf, ever: a leaf that already has
 *  one (origin "hunt", sourceId = node id) is queued through it. */
export async function enqueueHuntLeaves(refs: readonly string[], lane: SunoLane | null, now = Date.now()): Promise<SunoJob[]> {
  if (!refs.length) throw new SoundError('"huntNodeIds" is empty: name at least one leaf', 400);
  const { hunts } = await readHunts();
  const leaves = refs.map((r) => findLeaf(hunts, r));
  const jobs = await withSuno((f) => {
    const ids = leaves.map(({ hunt, node }, i) => {
      const have = f.proposals.find((p) => p.origin === "hunt" && p.sourceId === node.id);
      if (have) return have.id;
      const p = {
        id: mintSunoId("sp"),
        fields: fieldsOfLeaf(hunt, node),
        lane: lane ?? { axis: "group", value: UNGROUPED_LANE },
        origin: "hunt" as const,
        sourceId: node.id,
        createdAt: now + i,
        ...(node.rationale ? { note: clip(node.rationale, 200) } : {}),
      };
      f.proposals.push(p);
      return p.id;
    });
    return enqueueIn(f, ids, now);
  });
  await launchIfRunning(jobs);
  return jobs;
}

/** Cancel a queued job, and its kernel job. A running one is refused: the tab
 *  is mid-create and its credits are already spent. */
export async function cancelJob(id: string): Promise<SunoJob> {
  safeId(id);
  const kernel = sunoKernelJobs();
  const live = overlaySuno((await readSuno()).jobs, kernel).jobs.find((j) => j.id === id);
  if (!live) throw new SoundError(`no Suno job ${id}`, 404);
  if (live.state === "active") throw new SoundError("rendering now - it lands in triage when Suno finishes", 409);
  if (live.state !== "queued") throw new SoundError(`this job is already ${live.state}`, 409);
  const k = kernel.get(sunoKernelId(live));
  if (k !== undefined) cancelSunoJob(k.id, OPERATOR);
  return withSuno((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (!j) throw new SoundError(`no Suno job ${id}`, 404);
    j.state = "cancelled";
    j.endedAt = Date.now();
    delete j.phase;
    delete j.model;
    return { ...j };
  });
}

/** Housekeeping (lib/sound/suno/store.ts clearSuno) with the cancelled jobs' kernel jobs cancelled too. */
export async function clearSunoQueue(req: Parameters<typeof clearSuno>[0], now = Date.now()): ReturnType<typeof clearSuno> {
  const out = await clearSuno(req, now);
  const named = new Set(Array.isArray(req.jobIds) ? req.jobIds : []);
  if (!named.size || !out.cancelled) return out;
  const kernel = sunoKernelJobs();
  for (const j of (await readSuno()).jobs) {
    if (!named.has(j.id) || j.state !== "cancelled") continue;
    const k = kernel.get(sunoKernelId(j));
    if (k !== undefined && (k.state === "queued" || k.state === "paused" || k.state === "planned")) cancelSunoJob(k.id, OPERATOR);
  }
  return out;
}

/* ── the running-state overlay ────────────────────────────────────────────── */

/**
 * The records as the kernel has them running (decision 9). An interrupted job
 * reads `queued` with the column's `interrupted` sentence naming it and its
 * model - the wire the board and lib/ledger/v1/sources/suno.ts already read.
 */
export function overlaySuno(jobs: readonly SunoJob[], kernel: ReadonlyMap<string, Job>): { jobs: SunoJob[]; interrupted?: string } {
  let interrupted: string | undefined;
  const out = jobs.map((j): SunoJob => {
    const k = kernel.get(sunoKernelId(j));
    const { phase: _phase, model: _model, ...still } = j;
    if (k === undefined) {
      // A record left `active` with no job is a v1 worker's crash from before the
      // kernel drove this queue: v1's recover() said so and waited for Start, and
      // so does this - Start launches it, and a model with clips is not created again.
      if (j.state !== "active") return j;
      interrupted ??= `"${j.fields.title ?? j.fields.style}"${j.model ? ` on ${SUNO_MODEL_LABEL[j.model] ?? j.model}` : ""} was being created when the server stopped; check your Suno library before starting`;
      return { ...still, state: "queued" };
    }
    switch (k.state) {
      case "running":
        return { ...j, state: "active" };
      case "planned":
      case "queued":
      case "paused":
        return { ...still, state: "queued" };
      case "interrupted": {
        const model = SUNO_MODELS.find((m) => k.interruption?.stage === `create:${m}`);
        interrupted ??= `"${j.fields.title ?? j.fields.style}"${model ? ` on ${SUNO_MODEL_LABEL[model] ?? model}` : ""} was being created when its driver stopped; check your Suno library before starting`;
        return { ...still, state: "queued" };
      }
      case "failed":
        return { ...still, state: "failed", error: j.error ?? k.error?.message ?? "failed" };
      case "cancelled":
        return { ...still, state: "cancelled" };
      case "done":
        return j;
    }
  });
  return interrupted === undefined ? { jobs: out } : { jobs: out, interrupted };
}

export async function readSunoLive(): Promise<{ file: SunoFile; jobs: SunoJob[]; interrupted?: string }> {
  const file = await readSuno();
  return { file, ...overlaySuno(file.jobs, sunoKernelJobs()) };
}

/* ── the switch ───────────────────────────────────────────────────────────── */

/** The operator's switch (the Queue column's Start / Stop). Its state stays in
 *  suno.json for the board to draw; what it DOES is to the jobs (header). */
export async function setSunoQueue(running: boolean): Promise<SunoQueueState> {
  const state = await withSuno((f) => {
    f.queue = { running };
    return { ...f.queue };
  });
  if (!running) {
    const paused = new Set(pauseSunoJobs(OPERATOR));
    await withSuno((f) => {
      for (const j of f.jobs) {
        if (!paused.has(sunoKernelId(j)) || j.state !== "active") continue;
        j.state = "queued";
        delete j.phase;
        delete j.model;
      }
    });
    return state;
  }
  resumeSunoJobs(OPERATOR);
  const waiting = await waitingIds();
  if (waiting.length) await launchSunoNow(waiting, { mode: columnMode(), actor: OPERATOR });
  return state;
}

/** Queued records with no job yet (a v1 crash's included): what Start launches. One kernel read for the overlay and the filter. */
async function waitingIds(): Promise<string[]> {
  const kernel = sunoKernelJobs();
  return overlaySuno((await readSuno()).jobs, kernel).jobs.filter((j) => j.state === "queued" && !kernel.has(sunoKernelId(j))).map((j) => j.id);
}

/** What Start would launch, as a receipt (decision 3): GET /api/sound/suno/run. */
export async function sunoStartReceipt(): Promise<Receipt> {
  const r = await launchSuno(await waitingIds(), { mode: columnMode(), actor: OPERATOR });
  if (r.kind !== "receipt") throw new SoundError("a receipt read launched something", 500);
  return r.receipt;
}

/** Start, confirming a receipt by its token. A stale token launches nothing and returns the fresh receipt. */
export async function startSunoWith(token: string): Promise<{ queue: SunoQueueState } | { stale: Receipt }> {
  const r = await launchSuno(await waitingIds(), { mode: columnMode(), actor: OPERATOR, token });
  if (r.kind === "stale") return { stale: r.fresh };
  return { queue: await setSunoQueue(true) };
}

/* ── the snapshot ─────────────────────────────────────────────────────────── */

/** A READ: the driver's reachability and the records with their jobs' running
 *  state. It starts nothing - v1's snapshot kicked the worker; a read is a read. */
export async function sunoSnapshot(): Promise<SunoSnapshot> {
  const driver = await sunoDriver()
    .probe()
    .catch((e: unknown) => ({ ok: false as const, reason: errorMessage(e) }));
  const { file, jobs, interrupted } = await readSunoLive();
  return { proposals: file.proposals, jobs, clips: file.clips, driver, queue: { running: file.queue.running, ...(interrupted === undefined ? {} : { interrupted }) } };
}
