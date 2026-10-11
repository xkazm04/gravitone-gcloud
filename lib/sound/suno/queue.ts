// THE SUNO QUEUE — serial, FIFO, persisted, one worker per server process.
// Server-only: it names SUNO_DRIVER and reaches the browser driver.
//
// THE WORKER IS A SINGLETON ON globalThis (`__gtSunoWorker`), because Next dev
// re-evaluates this module on every HMR edit and a module-level `let` would
// start a second loop driving the same Chrome tab. It starts lazily: on an
// enqueue and on every snapshot read. The FIRST start in a process turns any
// `active` job back into `queued` — a job that was active when the process died
// is a crashed run, and models that already landed clips are not re-created
// (one Suno create is credits; a resume spends only what is missing).
//
// THE LOOP: the oldest queued job -> active, startedAt -> for each model the
// job still needs: model + phase persisted on every phase change ->
// createSunoTracks -> SunoClips written (verdict null) and their ids pushed ->
// both models done: `done`, endedAt. Any throw: `failed` with the driver's
// message VERBATIM, the proposal wears it, and the loop goes on to the next
// job. A driver that is not ok PAUSES the loop (no job is failed for it); the
// next enqueue or snapshot read starts it again.

import { createSunoTracks as realCreate, probeSuno as realProbe } from "@/lib/suno/driver";
import { SUNO_MODELS, type SunoClip, type SunoClipRef, type SunoDriverHealth, type SunoFields, type SunoJob, type SunoLane, type SunoModel, type SunoPhase, type SunoSnapshot } from "@/lib/suno/types";

import { UNGROUPED_LANE } from "@/lib/board/pipeline";

import { readHunts, safeId, SoundError } from "../store";
import type { Hunt, HuntNode } from "../types";
import { fakeCreateSunoTracks, fakeProbeSuno } from "./fakeDriver";
import { clip, EXCLUDE_MAX, INSTRUMENTAL, isCandidate, isLiveJob, mintSunoId, readSuno, STYLE_MAX, TITLE_MAX, withSuno, type SunoFile } from "./store";

/* ── the driver ───────────────────────────────────────────────────────────── */

export interface SunoDriver {
  probe(): Promise<SunoDriverHealth>;
  create(fields: SunoFields, model: SunoModel, onPhase: (phase: SunoPhase) => void): Promise<SunoClipRef[]>;
}

const REAL: SunoDriver = { probe: realProbe, create: realCreate };
const FAKE: SunoDriver = { probe: fakeProbeSuno, create: fakeCreateSunoTracks };

/** Read per call, so a probe can switch it after import. */
export const sunoDriver = (): SunoDriver => (process.env.SUNO_DRIVER?.trim() === "fake" ? FAKE : REAL);

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

export async function enqueueProposals(ids: readonly string[], now = Date.now()): Promise<SunoJob[]> {
  if (!ids.length) throw new SoundError('"proposalIds" is empty: name at least one proposal', 400);
  ids.forEach(safeId);
  const jobs = await withSuno((f) => enqueueIn(f, ids, now));
  kickSunoWorker();
  return jobs;
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
  kickSunoWorker();
  return jobs;
}

/** Cancel a queued job. A running one is refused: the tab is mid-create and
 *  its credits are already spent. */
export async function cancelJob(id: string): Promise<SunoJob> {
  safeId(id);
  if (!(await readSuno()).jobs.some((j) => j.id === id)) throw new SoundError(`no Suno job ${id}`, 404);
  return withSuno((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (!j) throw new SoundError(`no Suno job ${id}`, 404);
    if (j.state === "active") throw new SoundError("rendering now - it lands in triage when Suno finishes", 409);
    if (j.state !== "queued") throw new SoundError(`this job is already ${j.state}`, 409);
    j.state = "cancelled";
    j.endedAt = Date.now();
    return { ...j };
  });
}

/* ── the worker ───────────────────────────────────────────────────────────── */

interface WorkerState {
  /** The running loop, or null when idle / paused. */
  loop: Promise<void> | null;
  recovered: boolean;
  /** The driver's reason while the loop is paused on it. */
  paused: string | null;
  /** A kick landed while the loop was running: look again before stopping. */
  again: boolean;
}

const G = globalThis as typeof globalThis & { __gtSunoWorker?: WorkerState };
const worker = (): WorkerState => (G.__gtSunoWorker ??= { loop: null, recovered: false, paused: null, again: false });

/** A crashed run: every `active` job goes back to `queued`, keeping its clips. */
async function recover(): Promise<number> {
  return withSuno((f) => {
    let n = 0;
    for (const j of f.jobs) {
      if (j.state !== "active") continue;
      j.state = "queued";
      delete j.phase;
      delete j.model;
      n++;
    }
    return n;
  });
}

const oldestQueued = (f: SunoFile): SunoJob | null =>
  f.jobs.filter((j) => j.state === "queued").sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0] ?? null;

async function patchJob(id: string, fn: (j: SunoJob, f: SunoFile) => void): Promise<void> {
  await withSuno((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (j) fn(j, f);
  });
}

async function runOne(driver: SunoDriver, id: string): Promise<void> {
  const job = await withSuno((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (!j || j.state !== "queued") return null;
    j.state = "active";
    j.startedAt = Date.now();
    delete j.error;
    return { ...j };
  });
  if (!job) return;
  try {
    const have = new Set((await readSuno()).clips.filter((c) => c.jobId === id).map((c) => c.model));
    for (const model of job.models) {
      if (have.has(model)) continue;
      // Phase writes are chained, not awaited inline: the driver is not held
      // up by a disk write, and the last write lands before the clips do.
      let writes = Promise.resolve();
      let last: SunoPhase | null = null;
      const onPhase = (phase: SunoPhase) => {
        if (phase === last) return;
        last = phase;
        writes = writes.then(() => patchJob(id, (j) => {
          j.model = model;
          j.phase = phase;
        })).catch(() => undefined);
      };
      onPhase("attaching");
      let refs: SunoClipRef[];
      try {
        refs = await driver.create(job.fields, model, onPhase);
      } finally {
        await writes;
      }
      if (!refs.length) throw new Error(`Suno returned no clips for ${model}`);
      await patchJob(id, (j, f) => {
        const now = Date.now();
        for (const r of refs) {
          const c: SunoClip = { ...r, id: mintSunoId("sc"), jobId: id, model, createdAt: now, verdict: null };
          f.clips.push(c);
          j.clipIds.push(c.id);
        }
      });
    }
    await patchJob(id, (j, f) => {
      j.state = "done";
      j.endedAt = Date.now();
      delete j.phase;
      delete j.model;
      const p = f.proposals.find((x) => x.id === j.proposalId);
      if (p) delete p.error;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await patchJob(id, (j, f) => {
      j.state = "failed";
      j.endedAt = Date.now();
      j.error = message;
      delete j.phase;
      delete j.model;
      const p = f.proposals.find((x) => x.id === j.proposalId);
      if (p) p.error = message;
    });
  }
}

async function loop(): Promise<void> {
  const w = worker();
  if (!w.recovered) {
    w.recovered = true;
    await recover();
  }
  for (;;) {
    w.again = false;
    const next = oldestQueued(await readSuno());
    if (!next) {
      if (w.again) continue;
      w.paused = null;
      return;
    }
    const driver = sunoDriver();
    const health = await driver.probe().catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));
    if (!health.ok) {
      w.paused = health.reason;
      return;
    }
    w.paused = null;
    await runOne(driver, next.id);
  }
}

/** Start the loop if it is not running. Returns the running loop, so a probe
 *  can await the queue draining. Never throws to the caller: a store error
 *  stops the loop and the next kick tries again. */
export function kickSunoWorker(): Promise<void> {
  const w = worker();
  w.again = true;
  if (!w.loop) {
    w.loop = loop()
      .catch((e: unknown) => console.error(`[suno] worker stopped: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => {
        w.loop = null;
      });
  }
  return w.loop;
}

/** Why the worker is paused, or null. */
export const sunoWorkerPaused = (): string | null => worker().paused;

/** Probes only: forget the singleton, as a fresh process would. */
export function __resetSunoWorker(): void {
  delete G.__gtSunoWorker;
}

/* ── the snapshot ─────────────────────────────────────────────────────────── */

export async function sunoSnapshot(): Promise<SunoSnapshot> {
  const driver = await sunoDriver().probe().catch((e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }));
  // A snapshot read is a kick: an idle worker with queued work starts here.
  // Not awaited; the loop's errors are its own.
  void kickSunoWorker();
  const f = await readSuno();
  return { proposals: f.proposals, jobs: f.jobs, clips: f.clips, driver };
}
