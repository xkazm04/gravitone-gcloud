// THE VERDICT KERNEL — server only.
//
// Four foundry gates (the forge cull, the extractor, the Dojo, the strips
// triage) take a human's verdict per item into <runDir>/verdicts.json. Each
// used to carry its own copy of one writer — read the manifest, filter the
// map, replace the file whole — so two tabs (or the /foundry tab and the
// Board) were last-writer-wins, nothing was locked against the commit that
// reads the map, and the order of decisions was lost the moment media was
// deleted. This is the one writer:
//
//   · KEYED PATCHES ON A REVISION. `{set, clear, baseRev}`; a base that is not
//     the current revision is a 409 carrying the current one, so a client
//     re-reads instead of overwriting a decision it never saw.
//   · ONE LOCK, SHARED WITH THE COMMIT. <runDir>/.verdicts.lock (diskTx's
//     acquireLock, behind an in-process queue per run). Every commit takes it
//     BEFORE withCatalogue — run, then catalogue, the only order — so a write
//     that arrives while a commit is deciding waits, then sees `committed`.
//     A commit that takes inline verdicts uses `replaceVerdictMapHeld`, the
//     same write without re-taking the lock it already holds.
//   · AN APPEND-ONLY LOG. <runDir>/verdicts.log.jsonl, one line per CHANGED
//     key: rev, op, key, value, by, surface, at. It is never rewritten and the
//     commit never deletes it, so the gate's history outlives the media.
//
// verdicts.json keeps its shape (every older reader — listRuns' counts, the
// commit plans — sees the same map). The revision lives beside it in
// verdicts.rev.json; a map with no such file is revision 0. A write that
// changes nothing bumps nothing and logs nothing.

import { appendFile, stat } from "node:fs/promises";
import path from "node:path";

import { acquireLock } from "../diskTx";
import { foundryFs } from "./fsPort";
import { FoundryError } from "./runStore";

export const VERDICTS_FILE = "verdicts.json";
export const VERDICT_REV = "verdicts.rev.json";
export const VERDICT_LOG = "verdicts.log.jsonl";
export const RUN_LOCK = ".verdicts.lock";

export type VerdictBy = "human" | "model";

export interface VerdictPatch {
  set?: Record<string, unknown>;
  clear?: string[];
  baseRev: number;
  by?: VerdictBy;
  surface?: string;
}

export interface VerdictState<R> {
  rev: number;
  verdicts: Record<string, R>;
}

export interface VerdictLogLine<R> {
  at: string;
  rev: number;
  op: "set" | "clear";
  key: string;
  value?: R;
  by: VerdictBy;
  surface: string;
}

/** The stale-base refusal. `currentRev` is what the client should re-read. */
export class VerdictRevConflict extends FoundryError {
  constructor(readonly currentRev: number) {
    super(`The verdicts moved on (now at revision ${currentRev}); re-read and try again.`, 409);
  }
}

/** One gate's rules. `clean` returns the stored record, `undefined` to drop
 *  the key silently, or throws a FoundryError to refuse the whole write. */
export interface VerdictSpec<M, R> {
  dir: string;
  readManifest: () => Promise<M>;
  /** The refusal message when the run is committed, else null. */
  committed: (m: M) => string | null;
  clean: (m: M, key: string, raw: unknown, by: VerdictBy | undefined) => R | undefined;
}

/* ── the run lock ─────────────────────────────────────────────────────────── */

const queues = new Map<string, Promise<unknown>>();

/** Hold <dir>/.verdicts.lock for `fn`. A run directory that does not exist is
 *  not locked (and not created): `fn` reads the manifest and answers the 404. */
export async function withRunLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  if (!(await stat(dir).then((s) => s.isDirectory(), () => false))) return fn();
  const prev = queues.get(dir) ?? Promise.resolve();
  const mine = prev.then(async () => {
    const release = await acquireLock(path.join(dir, RUN_LOCK), {
      by: "foundry-verdicts",
      onTimeout: (file, ms) => new FoundryError(`${file} is held and was not released in ${ms} ms; try again.`, 503),
    });
    try {
      return await fn();
    } finally {
      await release();
    }
  });
  // Same release rule as extract/store.ts's step lock: store the swallowed
  // copy, and delete only if it is still ours, so the map empties again.
  const chained = mine.catch(() => undefined);
  queues.set(dir, chained);
  try {
    return await mine;
  } finally {
    if (queues.get(dir) === chained) queues.delete(dir);
  }
}

/* ── reads ────────────────────────────────────────────────────────────────── */

export async function readVerdictRev(dir: string): Promise<number> {
  const doc = await foundryFs().readJson<{ rev?: unknown }>(path.join(dir, VERDICT_REV), {});
  return typeof doc.rev === "number" && Number.isInteger(doc.rev) && doc.rev >= 0 ? doc.rev : 0;
}

export async function readVerdictState<R>(dir: string): Promise<VerdictState<R>> {
  const [verdicts, rev] = await Promise.all([foundryFs().readJson<Record<string, R>>(path.join(dir, VERDICTS_FILE), {}), readVerdictRev(dir)]);
  return { rev, verdicts };
}

/* ── the write ────────────────────────────────────────────────────────────── */

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Apply `set`/`clear` to the current map under a held lock. Every key is
 *  cleaned before anything is written, so a refusal writes and logs nothing. */
async function apply<M, R>(
  spec: VerdictSpec<M, R>,
  m: M,
  current: VerdictState<R>,
  set: Record<string, unknown>,
  clear: string[],
  by: VerdictBy | undefined,
  surface: string,
): Promise<VerdictState<R>> {
  const next: Record<string, R> = { ...current.verdicts };
  const changes: { op: "set" | "clear"; key: string; value?: R }[] = [];
  for (const [key, raw] of Object.entries(set)) {
    const rec = spec.clean(m, key, raw, by);
    if (rec === undefined) continue;
    if (key in next && same(next[key], rec)) continue;
    next[key] = rec;
    changes.push({ op: "set", key, value: rec });
  }
  for (const key of clear) {
    if (!(key in next)) continue;
    delete next[key];
    changes.push({ op: "clear", key });
  }
  if (!changes.length) return current;

  const rev = current.rev + 1;
  const at = new Date().toISOString();
  const who: VerdictBy = by ?? "human";
  // The log leads: a line whose map write never landed is a decision recorded
  // and not applied, which a reader can see; the reverse is history lost.
  const lines = changes.map((c) => JSON.stringify({ at, rev, op: c.op, key: c.key, ...(c.op === "set" ? { value: c.value } : {}), by: who, surface } satisfies VerdictLogLine<R>));
  await appendFile(path.join(spec.dir, VERDICT_LOG), lines.join("\n") + "\n", "utf8");
  const fs = foundryFs();
  await fs.writeJsonAtomic(path.join(spec.dir, VERDICTS_FILE), next);
  await fs.writeJsonAtomic(path.join(spec.dir, VERDICT_REV), { rev });
  return { rev, verdicts: next };
}

async function guarded<M, R>(spec: VerdictSpec<M, R>): Promise<{ m: M; current: VerdictState<R> }> {
  const m = await spec.readManifest();
  const done = spec.committed(m);
  if (done) throw new FoundryError(done, 409);
  return { m, current: await readVerdictState<R>(spec.dir) };
}

/** A keyed PATCH: run-locked, refused on a committed run or a stale base. */
export function patchVerdictMap<M, R>(spec: VerdictSpec<M, R>, patch: VerdictPatch): Promise<VerdictState<R>> {
  return withRunLock(spec.dir, async () => {
    const { m, current } = await guarded(spec);
    if (patch.baseRev !== current.rev) throw new VerdictRevConflict(current.rev);
    return apply(spec, m, current, patch.set ?? {}, patch.clear ?? [], patch.by, patch.surface ?? "api");
  });
}

/** The whole-map write, as a diff against the current map. Caller holds the
 *  run lock (a commit taking inline verdicts) and has read the manifest. */
export async function replaceVerdictMapHeld<M, R>(spec: VerdictSpec<M, R>, m: M, whole: Record<string, unknown>, surface = "put"): Promise<VerdictState<R>> {
  const current = await readVerdictState<R>(spec.dir);
  const keep = new Set<string>();
  const set: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(whole)) {
    // Clean first so a refusal (strips) throws before the diff is taken.
    const rec = spec.clean(m, key, raw, undefined);
    if (rec === undefined) continue;
    keep.add(key);
    set[key] = raw;
  }
  const clear = Object.keys(current.verdicts).filter((k) => !keep.has(k));
  return apply(spec, m, current, set, clear, undefined, surface);
}

/** PUT: the whole map, run-locked, written as the diff it amounts to. */
export function replaceVerdictMap<M, R>(spec: VerdictSpec<M, R>, whole: Record<string, unknown>, surface = "put"): Promise<VerdictState<R>> {
  return withRunLock(spec.dir, async () => {
    const { m } = await guarded(spec);
    return replaceVerdictMapHeld(spec, m, whole, surface);
  });
}

/* ── the request shape, shared by the four routes ─────────────────────────── */

/** Parse a PATCH body, or return the 400 detail. */
export function parseVerdictPatch(body: unknown): VerdictPatch | string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "The request body must be an object.";
  const b = body as Record<string, unknown>;
  if (typeof b.baseRev !== "number" || !Number.isInteger(b.baseRev) || b.baseRev < 0) return "`baseRev` must be the revision the change was made against.";
  if (b.set !== undefined && (!b.set || typeof b.set !== "object" || Array.isArray(b.set))) return "`set` must be an object keyed by item id.";
  if (b.clear !== undefined && (!Array.isArray(b.clear) || b.clear.some((k) => typeof k !== "string"))) return "`clear` must be a list of item ids.";
  if (b.by !== undefined && b.by !== "human" && b.by !== "model") return "`by` must be human or model.";
  if (b.surface !== undefined && (typeof b.surface !== "string" || b.surface.length > 40)) return "`surface` must be a short name.";
  return {
    baseRev: b.baseRev,
    set: b.set as Record<string, unknown> | undefined,
    clear: b.clear as string[] | undefined,
    by: b.by as VerdictBy | undefined,
    surface: (b.surface as string | undefined) ?? "api",
  };
}

/** The route's answer for a kernel refusal; null for anything else. */
export function verdictErrorResponse(e: unknown): Response | null {
  if (e instanceof VerdictRevConflict) return Response.json({ detail: e.message, rev: e.currentRev }, { status: 409 });
  if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
  return null;
}
