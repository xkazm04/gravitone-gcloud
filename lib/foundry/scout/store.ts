// THE SCOUT NIGHT STORE - server only. One directory per night under
// foundry-out/scout/<nightId>/ (SCOUT_STORE_DIR redirects the root, read per
// call, so a test or a rehearsal never writes the checkout's):
//
//   night.json          the manifest (./types.ts Night)
//   taste.md            the prior nights' verdicts, written for the skill
//   sources/<s-NN>/     what the ingest producer brought onto this box
//   scenes/<c-NN>/      a scene candidate's replica stills and its clip
//   assets/<c-NN>/      a game asset's concept images (the asset itself is lib/foundry/mesh's)
//
// Every writer goes through `mutateNight`: the ingest and scene producers and
// the CLI write the same manifest from different processes, and the run lock
// (../verdictLog withRunLock - a lock FILE, so it holds across processes)
// turns their read-modify-writes into a queue instead of a lost update.

import { mkdir, readdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import { outPath } from "../../fixtures/roots";
import { FoundryError, containedIn, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import {
  DEFAULT_ASSET_CAP,
  DEFAULT_CEILING_USD,
  DEFAULT_CLIP_CAP,
  DEFAULT_TARGET,
  NIGHT_ID_RE,
  type Candidate,
  type CandidateId,
  type Night,
  type NightId,
  type NightSummary,
  type SourceId,
} from "./types";

const NIGHT_FILE = "night.json";

/** Files a night may serve to the Board: pictures, clips, the manifest. */
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json", ".mp4", ".webm"]);

/** SCOUT_STORE_DIR, else `<out>/scout`. Read per call. */
export function scoutRoot(): string {
  return process.env["SCOUT_STORE_DIR"]?.trim() || outPath("scout");
}

export function nightDir(id: NightId): string {
  if (!NIGHT_ID_RE.test(id)) throw new FoundryError(`That is not a night id: ${id}.`, 400);
  return path.join(scoutRoot(), id);
}

/** An absolute path inside the night, refused when `rel` climbs out of it. */
export function resolveInNight(id: NightId, rel: string): string {
  return containedIn(nightDir(id), rel, false, "night");
}

/* ── Create ───────────────────────────────────────────────────────────────── */

export type NightOptions = {
  readonly ceilingUsd?: number;
  readonly target?: number;
  readonly clipCap?: number;
  readonly assetCap?: number;
  /** ISO instant. */
  readonly deadline?: string;
  readonly dry: boolean;
  /** The calendar day to name the night by; today (UTC) when absent. */
  readonly day?: string;
  readonly now?: Date;
};

/**
 * Open a night: `YYYY-MM-DD`, then `-2`, `-3` for another run the same day.
 * The directory is the reservation - a non-recursive mkdir throws EEXIST
 * atomically, as extract's reserveRunDir does.
 */
export async function createNight(o: NightOptions): Promise<Night> {
  const now = o.now ?? new Date();
  const day = o.day ?? now.toISOString().slice(0, 10);
  const root = scoutRoot();
  await mkdir(root, { recursive: true });
  for (let i = 0; i < 50; i++) {
    const id = i === 0 ? day : `${day}-${i + 1}`;
    try {
      await mkdir(path.join(root, id));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    const night: Night = {
      id,
      startedAt: now.toISOString(),
      ...(o.deadline !== undefined ? { deadline: o.deadline } : {}),
      ceilingUsd: o.ceilingUsd ?? DEFAULT_CEILING_USD,
      target: o.target ?? DEFAULT_TARGET,
      clipCap: o.clipCap ?? DEFAULT_CLIP_CAP,
      assetCap: o.assetCap ?? DEFAULT_ASSET_CAP,
      dry: o.dry,
      state: "open",
      sources: [],
      candidates: [],
      jobs: [],
    };
    await saveNight(night);
    return night;
  }
  throw new FoundryError(`Too many nights on ${day}.`, 409);
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

export async function readNight(id: NightId): Promise<Night> {
  const n = await readManifestFile<Night>(path.join(nightDir(id), NIGHT_FILE), id, "night");
  if (n === undefined) throw new FoundryError(`The manifest of night ${id} is unreadable - a writer may be mid-write; try again, else inspect ${path.join(nightDir(id), NIGHT_FILE)}.`, 503);
  if (!n) throw new FoundryError(`No night called ${id}.`, 404);
  return n;
}

/** The manifest, read synchronously: a job's plan reads it inside the kernel's store transaction. */
export function readNightNow(id: NightId): Night {
  const file = path.join(nightDir(id), NIGHT_FILE);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new FoundryError(`No night called ${id}.`, 404);
    throw e;
  }
  try {
    return JSON.parse(text) as Night;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    throw new FoundryError(`The manifest of night ${id} is unreadable - inspect ${file}.`, 503);
  }
}

export function summarise(n: Night): NightSummary {
  const count = (s: Candidate["status"]): number => n.candidates.filter((c) => c.status === s).length;
  return {
    id: n.id,
    state: n.state,
    ...(n.stop !== undefined ? { stop: n.stop } : {}),
    dry: n.dry,
    startedAt: n.startedAt,
    sources: n.sources.length,
    rendered: count("rendered"),
    failed: count("failed"),
    pending: count("pending"),
  };
}

/** Every night on disk, newest first. A night whose manifest cannot be read is skipped, never fatal to the list. */
export async function listNights(): Promise<NightSummary[]> {
  let names: string[];
  try {
    names = await readdir(scoutRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: NightSummary[] = [];
  for (const id of names.filter((x) => NIGHT_ID_RE.test(x))) {
    const n = await readManifestFile<Night>(path.join(scoutRoot(), id, NIGHT_FILE), id, "night");
    if (n) out.push(summarise(n));
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/** Every extract run a night's style candidate launched - the extract Weir leaves them to the night's packet. */
export async function scoutExtractRunIds(): Promise<Set<string>> {
  let names: string[];
  try {
    names = await readdir(scoutRoot());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw e;
  }
  const ids = new Set<string>();
  for (const id of names.filter((x) => NIGHT_ID_RE.test(x))) {
    const n = await readManifestFile<Night>(path.join(scoutRoot(), id, NIGHT_FILE), id, "night");
    if (n) for (const c of n.candidates) if (c.kind === "style" && c.extractRunId !== undefined) ids.add(c.extractRunId);
  }
  return ids;
}

/* ── Write ────────────────────────────────────────────────────────────────── */

/** Write the manifest whole (tmp + rename). Only `createNight` and `mutateNight` call it. */
export const saveNight = (n: Night): Promise<void> => writeJsonAtomic(path.join(nightDir(n.id), NIGHT_FILE), n);

/**
 * Read, change, write - under the night's lock file, so two processes writing one
 * night queue instead of losing an update. `fn` returns the whole next manifest;
 * returning the same object writes nothing.
 */
export async function mutateNight(id: NightId, fn: (n: Night) => Night): Promise<Night> {
  return withRunLock(nightDir(id), async () => {
    const before = await readNight(id);
    const after = fn(before);
    if (after !== before) await saveNight(after);
    return after;
  });
}

/** The next free `s-NN`. */
export function nextSourceId(n: Night): SourceId {
  return `s-${String(n.sources.length + 1).padStart(2, "0")}`;
}

/** The next free `c-NN`. */
export function nextCandidateId(n: Night): CandidateId {
  return `c-${String(n.candidates.length + 1).padStart(2, "0")}`;
}

/** Replace one candidate by id, keeping order. */
export function withCandidate(n: Night, c: Candidate): Night {
  return { ...n, candidates: n.candidates.map((x) => (x.id === c.id ? c : x)) };
}

/* ── Serve ────────────────────────────────────────────────────────────────── */

/** For /api/foundry/file?kind=scout: the absolute path and size of a servable night file, or a 404. */
export async function scoutFileStat(id: NightId, rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveInNight(id, rel);
  if (!SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("That file type is not served.", 400);
  try {
    const s = await stat(abs);
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the night.", 404);
  }
}
