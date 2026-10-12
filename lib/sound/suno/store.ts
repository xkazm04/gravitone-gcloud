// THE SUNO QUEUE'S STORE — one JSON file beside the sound store's three.
// Server-only (node:fs).
//
//   <root>/suno.json   { version, queue: SunoQueueState, proposals: SunoProposal[], jobs: SunoJob[], clips: SunoClip[] }
//
// `queue` is the operator's switch (./queue.ts). A file written before it
// existed reads as stopped: nothing spends until somebody presses Start.
//
// <root> is lib/sound/store.ts's storeRoot() (foundry-out/sound/, or
// SOUND_STORE_DIR, read lazily per call so a probe can point it at a temp dir).
//
// ONE LOCK, NOT TWO. Every mutation runs inside the sound store's `withStore`,
// so the in-process queue and the cross-process `.lock` file that order the
// takes also order this file. A second lock for a sibling file in the same
// directory would let a take write and a queue write interleave in a way
// neither lock's author reasoned about. The StoreTx it hands us is unused (it
// writes nothing it was not told to touch); this file is read inside the lock
// and written with the same tmp+rename `writeJsonAtomic`, so a reader sees the
// old file or the new one, never half.
//
// A CORRUPT FILE THROWS. It is never replaced with an empty one: that would
// erase a shelf of clips the operator has not judged yet.
//
// WHAT "SHOWN IN PROPOSED" MEANS is derived, not stored: a proposal with a job
// that is queued, active or done is not a candidate any more; one whose last
// job failed or was cancelled is (wearing `error` when it failed). The wire
// type stays as WP0 froze it and no flag can drift from the jobs it summarises.

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { SunoClearRequest, SunoClearResult, SunoClip, SunoFields, SunoJob, SunoLane, SunoProposal, SunoQueueState } from "@/lib/suno/types";

import { SoundError, safeId, storeRoot, withStore, writeJsonAtomic } from "../store";

export interface SunoFile {
  version: 1;
  queue: SunoQueueState;
  proposals: SunoProposal[];
  jobs: SunoJob[];
  clips: SunoClip[];
}

const empty = (): SunoFile => ({ version: 1, queue: { running: false }, proposals: [], jobs: [], clips: [] });

function queueOf(v: unknown): SunoQueueState {
  const o = v && typeof v === "object" ? (v as Partial<SunoQueueState>) : {};
  return { running: o.running === true, ...(typeof o.interrupted === "string" && o.interrupted ? { interrupted: o.interrupted } : {}) };
}

export const sunoFile = (): string => path.join(storeRoot(), "suno.json");

/** Unlocked snapshot read, for GETs. */
export async function readSuno(): Promise<SunoFile> {
  const file = sunoFile();
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
  let parsed: Partial<SunoFile>;
  try {
    parsed = JSON.parse(raw) as Partial<SunoFile>;
  } catch (e) {
    throw new SoundError(`${file} is not valid JSON (${(e as Error).message}); refusing to overwrite it`, 500);
  }
  return {
    version: 1,
    queue: queueOf(parsed.queue),
    proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
    jobs: Array.isArray(parsed.jobs) ? parsed.jobs.map((j) => ({ ...j, clipIds: Array.isArray(j.clipIds) ? j.clipIds : [] })) : [],
    clips: Array.isArray(parsed.clips) ? parsed.clips.map((c) => backfillClip(c, parsed.jobs)) : [],
  };
}

/** A clip written before library import existed has no `origin` and no
 *  `prompt`: it is a queue clip, and its prompt is its job's fields. Filled on
 *  read; the next write of the file persists it. */
function backfillClip(c: SunoClip, jobs: SunoJob[] | undefined): SunoClip {
  if (c.origin && (c.origin === "library" || c.prompt)) return c;
  const out: SunoClip = { ...c, origin: c.origin ?? "queue", jobId: c.jobId ?? null };
  const job = out.jobId && Array.isArray(jobs) ? jobs.find((j) => j.id === out.jobId) : undefined;
  if (!out.prompt && job?.fields) out.prompt = { ...job.fields };
  return out;
}

/** Read-modify-write under the sound store's lock. `fn` mutates the file in
 *  place; it is written back only if `fn` returns without throwing. */
export function withSuno<T>(fn: (f: SunoFile) => T | Promise<T>): Promise<T> {
  return withStore(async () => {
    const f = await readSuno();
    const out = await fn(f);
    await writeJsonAtomic(sunoFile(), f);
    return out;
  });
}

/** `sp-` / `sj-` / `sc-` + 10 hex, the sound store's id shape. */
export function mintSunoId(prefix: "sp" | "sj" | "sc"): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

/* ── validation: Suno's own form limits ───────────────────────────────────── */

/** Suno's style box takes 200 characters on the custom form; the title 80. A
 *  longer line is cut at its last separator so a tag is never halved. */
export const STYLE_MAX = 200;
export const TITLE_MAX = 80;
export const LYRICS_MAX = 3000;
export const EXCLUDE_MAX = 200;
export const INSTRUMENTAL = "[Instrumental]";

export function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "));
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,]+$/, "");
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A SunoFields from anything a route or a model sent. `style` is the one
 *  required field; optional keys are OMITTED, never empty strings. */
export function parseFields(v: unknown): SunoFields {
  if (!v || typeof v !== "object") throw new SoundError('"fields" must be an object with at least a "style"', 400);
  const o = v as Record<string, unknown>;
  const style = str(o.style);
  if (!style) throw new SoundError('"fields.style" is required: the genre, mood and instruments Suno renders', 400);
  const out: SunoFields = { style: clip(style, STYLE_MAX) };
  const title = str(o.title);
  if (title) out.title = clip(title, TITLE_MAX);
  // Lyrics keep their line breaks; only the length is held.
  const lyrics = typeof o.lyrics === "string" && o.lyrics.trim() ? o.lyrics.trim().slice(0, LYRICS_MAX) : null;
  if (lyrics) out.lyrics = lyrics;
  const exclude = str(o.exclude);
  if (exclude) out.exclude = clip(exclude, EXCLUDE_MAX);
  return out;
}

export function parseLane(v: unknown): SunoLane {
  if (!v || typeof v !== "object") throw new SoundError('"lane" must be { axis, value }', 400);
  const o = v as Record<string, unknown>;
  const axis = str(o.axis);
  const value = str(o.value);
  if (!axis || !value) throw new SoundError('"lane" needs an "axis" and a "value"', 400);
  return { axis: axis.slice(0, 40), value: value.slice(0, 120) };
}

/* ── derived state ────────────────────────────────────────────────────────── */

const LIVE_STATES = new Set<SunoJob["state"]>(["queued", "active"]);

/** The newest job a proposal produced, or null. */
export function lastJobOf(f: Pick<SunoFile, "jobs">, proposalId: string): SunoJob | null {
  let best: SunoJob | null = null;
  for (const j of f.jobs) if (j.proposalId === proposalId && (!best || j.enqueuedAt >= best.enqueuedAt)) best = j;
  return best;
}

/** Still a candidate: never queued, or its last job failed / was cancelled. */
export function isCandidate(f: Pick<SunoFile, "jobs">, p: SunoProposal): boolean {
  const j = lastJobOf(f, p.id);
  return !j || j.state === "failed" || j.state === "cancelled";
}

export const isLiveJob = (j: SunoJob): boolean => LIVE_STATES.has(j.state);

/* ── mutations ────────────────────────────────────────────────────────────── */

export interface NewProposal {
  fields: SunoFields;
  lane: SunoLane;
  origin: SunoProposal["origin"];
  sourceId?: string;
  note?: string;
}

function proposalOf(p: NewProposal, now: number): SunoProposal {
  const out: SunoProposal = { id: mintSunoId("sp"), fields: p.fields, lane: p.lane, origin: p.origin, createdAt: now };
  if (p.sourceId) out.sourceId = p.sourceId;
  if (p.note) out.note = p.note;
  return out;
}

export async function addProposals(list: NewProposal[], now = Date.now()): Promise<SunoProposal[]> {
  return withSuno((f) => {
    const made = list.map((p, i) => proposalOf(p, now + i));
    f.proposals.push(...made);
    return made;
  });
}

/** Remove a proposal. Refused while a job of it is queued or running: the
 *  job holds its own snapshot of the fields, and the card in the queue would
 *  lose the row it returns to on cancel. */
export async function deleteProposal(id: string): Promise<void> {
  safeId(id);
  // Read-only existence check BEFORE the lock, so a bad id is a 404 that
  // never creates the store directory.
  if (!(await readSuno()).proposals.some((p) => p.id === id)) throw new SoundError(`no Suno proposal ${id}`, 404);
  await withSuno((f) => {
    const at = f.proposals.findIndex((p) => p.id === id);
    if (at < 0) throw new SoundError(`no Suno proposal ${id}`, 404);
    const live = f.jobs.find((j) => j.proposalId === id && isLiveJob(j));
    if (live) throw new SoundError(`"${f.proposals[at].fields.title ?? f.proposals[at].fields.style}" is in the queue; cancel it first`, 409);
    f.proposals.splice(at, 1);
  });
}

export async function setClipVerdict(id: string, verdict: SunoClip["verdict"]): Promise<SunoClip> {
  return patchClip(id, { verdict });
}

export interface ClipPatch {
  verdict?: SunoClip["verdict"];
  /** A lane wins over the job's; null clears it (a library clip goes back to
   *  ungrouped, a queue clip back to its job's lane). */
  lane?: SunoLane | null;
}

/** The gate's writes on one clip: its verdict, its lane, or both at once. */
export async function patchClip(id: string, patch: ClipPatch): Promise<SunoClip> {
  safeId(id);
  if (!(await readSuno()).clips.some((c) => c.id === id)) throw new SoundError(`no Suno clip ${id}`, 404);
  return withSuno((f) => {
    const c = f.clips.find((x) => x.id === id);
    if (!c) throw new SoundError(`no Suno clip ${id}`, 404);
    if (patch.verdict !== undefined) c.verdict = patch.verdict;
    if (patch.lane === null) delete c.lane;
    else if (patch.lane) c.lane = { ...patch.lane };
    return { ...c };
  });
}

/* ── housekeeping ─────────────────────────────────────────────────────────── */

/** Remove our records in one write: proposals (not while queued or running),
 *  queued jobs (cancelled - a running one is skipped, its credits are spent),
 *  and clips (the record only: the song stays in the operator's Suno library
 *  and a library import brings it back). Unknown ids are skipped, not refused,
 *  because a board read can be a poll behind. */
export async function clearSuno(req: SunoClearRequest, now = Date.now()): Promise<SunoClearResult> {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const proposalIds = list(req.proposalIds);
  const jobIds = list(req.jobIds);
  const clipIds = list(req.clipIds);
  [...proposalIds, ...jobIds, ...clipIds].forEach(safeId);
  if (!proposalIds.length && !jobIds.length && !clipIds.length) throw new SoundError('name what to clear: "proposalIds", "jobIds" and/or "clipIds"', 400);
  return withSuno((f) => {
    const out: SunoClearResult = { removed: 0, cancelled: 0, skipped: 0 };
    for (const id of jobIds) {
      const j = f.jobs.find((x) => x.id === id);
      if (!j || j.state !== "queued") {
        out.skipped++;
        continue;
      }
      j.state = "cancelled";
      j.endedAt = now;
      out.cancelled++;
    }
    const drop = new Set<string>();
    for (const id of proposalIds) {
      const p = f.proposals.find((x) => x.id === id);
      if (!p || f.jobs.some((j) => j.proposalId === id && isLiveJob(j))) out.skipped++;
      else drop.add(id);
    }
    f.proposals = f.proposals.filter((p) => !drop.has(p.id));
    out.removed += drop.size;
    const gone = new Set(clipIds);
    const before = f.clips.length;
    f.clips = f.clips.filter((c) => !gone.has(c.id));
    const removedClips = before - f.clips.length;
    out.removed += removedClips;
    out.skipped += clipIds.length - removedClips;
    return out;
  });
}
