// THE SCOUT NIGHT STORE - server only. One directory per night under the
// active wing's root, foundry-out/scout-nights/<nightId>/ or foundry-out/scout-muse/<nightId>/
// (SCOUT_STORE_DIR, SCOUT_MUSE_STORE_DIR redirect them, read per call, so a test
// or a rehearsal never writes the checkout's):
//
//   night.json          the manifest (./types.ts Night)
//   taste.md            the prior nights' verdicts, written for the skill
//   sources/<s-NN>/     what the ingest producer brought onto this box
//   scenes/<c-NN>/      a scene candidate's replica stills and its clip
//   assets/<c-NN>/      a game asset's concept images (the asset itself is lib/foundry/mesh's)
//   ideas/<c-NN>.png    an idea's tile: its artboard drawn in the Leonardo studio, or a stats
//                       idea's strip at frame 120
//   ideas/<c-NN>/       a stats idea's brief.json and approach.json (the ideas door), its strip
//
// Every writer goes through `mutateNight`: the ingest and scene producers and
// the CLI write the same manifest from different processes, and the run lock
// (../verdictLog withRunLock - a lock FILE, so it holds across processes)
// turns their read-modify-writes into a queue instead of a lost update.
//
// THE PRE-BASELINE ARCHIVE (spark project-baseline, 2026-10-26): the scout stopped spreading and serves
// channels. The old root, foundry-out/scout/, was neither moved nor emptied: it is a second root of the
// scout wing, read beside the new one under the same BARE night ids (so pkt:scout:2026-10-24 opens, commits
// and serves its files as before), and new nights open only in the new root, never on a date the archive
// holds (`2026-10-24-2`). Its seed batches, the steer and the lead queue stay in it (homeRoot). The muse
// archive (readArchiveNights) is the other precedent and keeps its own `muse:` ids.

import { mkdir, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { outPath } from "../../fixtures/roots";
import { FoundryError, containedIn, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import {
  DEFAULT_ASSET_CAP,
  DEFAULT_CEILING_USD,
  DEFAULT_CLIP_CAP,
  DEFAULT_IDEA_CAP,
  DEFAULT_REEL_CAP,
  DEFAULT_TARGET,
  DEFAULT_TRACK_CAP,
  DEFAULT_STORYBOARD_CAP,
  DEFAULT_VISUALIZER_CAP,
  NIGHT_ID_RE,
  type Candidate,
  type CandidateId,
  type Night,
  type NightId,
  type NightSummary,
  type SourceId,
} from "./types";
import type { RootedNight } from "./characters";
import { WING_OUT_DIR, type ScoutWing } from "./wing";
import { activeWing, withWing } from "./wingScope";

const NIGHT_FILE = "night.json";

/** Files a night may serve to the Board: pictures, clips, a track's mp3s, the manifest. */
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json", ".mp4", ".webm", ".mp3"]);

/** The ACTIVE wing's root (wingScope.ts; `scout` outside any scope). Read per call. */
export function scoutRoot(): string {
  return rootOf(activeWing());
}

/** The env var that moves a wing's root (tests point it at a temp dir). Server-only: wing.ts is client-safe
 *  and must not spell an env var's name (check:bundle). */
export const WING_STORE_ENV: Readonly<Record<ScoutWing, string>> = { scout: "SCOUT_STORE_DIR", muse: "SCOUT_MUSE_STORE_DIR" };

/** A wing's root: its env var (SCOUT_STORE_DIR, SCOUT_MUSE_STORE_DIR), else `<out>/scout-nights`, `<out>/scout-muse`. */
export function rootOf(wing: ScoutWing): string {
  return process.env[WING_STORE_ENV[wing]]?.trim() || outPath(WING_OUT_DIR[wing]);
}

/** The env var that moves the pre-baseline archive (tests and rehearsals point it at a temp dir). */
export const PRE_BASELINE_ENV = "SCOUT_PREBASELINE_STORE_DIR";

/**
 * The PRE-BASELINE archive's root: its env var, else `<out>/scout` - unless the nights root itself is redirected
 * (SCOUT_STORE_DIR set, the var unset), where there is none: a test's or a rehearsal's world never reads the
 * checkout's archive, and its doors stay as they were before the baseline. Undefined also means the baseline is off.
 */
export function preBaselineRoot(): string | undefined {
  const env = process.env[PRE_BASELINE_ENV]?.trim();
  if (env) return env;
  return process.env[WING_STORE_ENV.scout]?.trim() ? undefined : outPath("scout");
}

/** The scout's files that are no night's (steer.json, seeds/, leads.json): the pre-baseline root's, kept where they were. */
export function homeRoot(): string {
  return (activeWing() === "scout" ? preBaselineRoot() : undefined) ?? scoutRoot();
}

/** True when `id` is a night of the pre-baseline archive (scout wing only; the new root wins a tie it never has). */
export function isPreBaselineNight(id: NightId): boolean {
  const archive = activeWing() === "scout" ? preBaselineRoot() : undefined;
  return archive !== undefined && NIGHT_ID_RE.test(id) && !existsSync(path.join(scoutRoot(), id)) && existsSync(path.join(archive, id));
}

/** True when the baseline is on and `id` (absent: any new night) is not an archived night: the old doors are shut there. */
export function onBaseline(id?: NightId): boolean {
  return activeWing() === "scout" && preBaselineRoot() !== undefined && (id === undefined || !isPreBaselineNight(id));
}

/** The root directory a night sits in: the archive's for a pre-baseline night, else the active wing's. */
export function nightRoot(id: NightId): string {
  const archive = isPreBaselineNight(id) ? preBaselineRoot() : undefined;
  return archive ?? scoutRoot();
}

export function nightDir(id: NightId): string {
  if (!NIGHT_ID_RE.test(id)) throw new FoundryError(`That is not a night id: ${id}.`, 400);
  return path.join(nightRoot(id), id);
}

/** The roots `listNights` walks: the active wing's, then (scout wing, baseline on) the pre-baseline archive. */
function nightRoots(): string[] {
  const archive = activeWing() === "scout" ? preBaselineRoot() : undefined;
  return archive === undefined || path.resolve(archive) === path.resolve(scoutRoot()) ? [scoutRoot()] : [scoutRoot(), archive];
}

/** Every night id under one root; a missing root is none. */
async function idsUnder(root: string): Promise<string[]> {
  try {
    return (await readdir(root)).filter((x) => NIGHT_ID_RE.test(x));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
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
  readonly ideaCap?: number;
  readonly reelCap?: number;
  readonly trackCap?: number;
  readonly visualizerCap?: number;
  readonly storyboardCap?: number;
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
  // Ids are unique across both roots: a date the pre-baseline archive holds is taken (its packets keep their ids).
  const archive = nightRoots()[1];
  for (let i = 0; i < 50; i++) {
    const id = i === 0 ? day : `${day}-${i + 1}`;
    if (archive !== undefined && existsSync(path.join(archive, id))) continue;
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
      ideaCap: o.ideaCap ?? DEFAULT_IDEA_CAP,
      reelCap: o.reelCap ?? DEFAULT_REEL_CAP,
      trackCap: o.trackCap ?? DEFAULT_TRACK_CAP,
      visualizerCap: o.visualizerCap ?? DEFAULT_VISUALIZER_CAP,
      storyboardCap: o.storyboardCap ?? DEFAULT_STORYBOARD_CAP,
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

/**
 * The night's rows by status - what the skill's stop rule (~20 rendered rows) reads. Idea artboards
 * are drawn beside the plan, not toward it, so they are not counted here (closeAct's `target` does
 * the same); the morning's `byKind` counts them under `idea`.
 */
export function summarise(n: Night): NightSummary {
  const count = (s: Candidate["status"]): number => n.candidates.filter((c) => c.kind !== "idea" && c.status === s).length;
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

/**
 * Every night on disk, newest first: the scout wing's spans the new root and the pre-baseline archive (ids are unique
 * across them; the new root wins a tie). A night whose manifest cannot be read is skipped, never fatal to the list.
 */
export async function listNights(): Promise<NightSummary[]> {
  const out: NightSummary[] = [];
  const seen = new Set<string>();
  for (const root of nightRoots()) {
    for (const id of await idsUnder(root)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const n = await readManifestFile<Night>(path.join(root, id, NIGHT_FILE), id, "night");
      if (n) out.push(summarise(n));
    }
  }
  return out.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/**
 * Every night on disk that can be read, newest first - the whole history (spark scout-decision-graph: the
 * graph and the seed doors read it). A night mid-write is skipped, never fatal.
 */
export async function readAllNights(): Promise<Night[]> {
  const out: Night[] = [];
  for (const s of await listNights()) {
    const n = await readNight(s.id).catch(() => undefined);
    if (n !== undefined) out.push(n);
  }
  return out;
}

/**
 * The muse ARCHIVE (spark scout-vision S3): the muse root's nights, read-only since the wings merged - every new night
 * is written to the scout root. Their ids COLLIDE with scout nights (2026-10-23 is in both), so a reader keeps the
 * root beside the night (characters.ts RootedNight) and addresses an archive night as `muse:<night>`.
 */
export async function readArchiveNights(): Promise<Night[]> {
  return withWing("muse", () => readAllNights());
}

/**
 * Every night a reader joins since the merge (spark scout-vision S3): the scout root's, then the archive's, each with its
 * root beside it - never merged by id. A missing root reads as no nights (listNights).
 */
export async function readRootedNights(): Promise<RootedNight[]> {
  const [scout, archive] = await Promise.all([withWing("scout", () => readAllNights()), readArchiveNights()]);
  return [...scout.map((night) => ({ root: "scout" as const, night })), ...archive.map((night) => ({ root: "archive" as const, night }))];
}

/** Every extract run a night's style candidate launched - the extract Weir leaves them to the night's packet. */
export async function scoutExtractRunIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const root of nightRoots()) {
    for (const id of await idsUnder(root)) {
      const n = await readManifestFile<Night>(path.join(root, id, NIGHT_FILE), id, "night");
      if (n) for (const c of n.candidates) if (c.kind === "style" && c.extractRunId !== undefined) ids.add(c.extractRunId);
    }
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
  return mutateNightWith(id, async (n) => fn(n));
}

/**
 * `mutateNight` whose change does file work first under the same lock (add-source copying a kept
 * idea's artboard into `sources/s-NN/`): the id it takes and the file it writes cannot be raced by
 * a second writer. A throw writes no manifest.
 */
export async function mutateNightWith(id: NightId, fn: (n: Night) => Promise<Night>): Promise<Night> {
  return withRunLock(nightDir(id), async () => {
    const before = await readNight(id);
    const after = await fn(before);
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
