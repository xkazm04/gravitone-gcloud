// THE REEL FOLDER AS THE FOUR JOBS READ AND WRITE IT (spark reel-studio WP2). Node only; no `server-only` mark, the
// producers registry loads this in the worker and in CLIs.
//
// reel.json is written by more than one hand (these jobs, the bed upload, the CLI), so every write here is a
// read-modify-write under the reel's run lock (the one recordVerdict takes), written atomically: a reader never sees
// half a state and two writers never interleave.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { readJson, writeJsonAtomic } from "../../foundry/runStore.ts";
import { withRunLock } from "../../foundry/verdictLog.ts";
import { parseState } from "../../reel/state.ts";
import { reelDir, reelsRoot } from "../../reel/store.ts";
import { canonical, parseTable } from "../../reel/table.ts";
import { FILM_DIR, ReelError, type FilmFace, type ReelState, type ReelTable } from "../../reel/types.ts";

export const STATE_FILE = "reel.json";
export const PROGRESS_FILE = "progress.json";

export const filmDirOf = (dir: string): string => path.join(dir, FILM_DIR);

/** The reels' shared data (flags, geo, fonts) a film's `/data/` falls back to. */
export const sharedDataDir = (): string => path.join(reelsRoot(), "_shared", "data");

/** A seat turn's isolated workspace: `inputs/` and `out/` and nothing else (lib/agent/cliSeam.ts). */
export const workspaceOf = (dir: string, kind: "data" | "author"): string => path.join(dir, "_ws", kind);

export { reelDir };

export async function readState(dir: string): Promise<ReelState> {
  const file = path.join(dir, STATE_FILE);
  const raw = await readJson<unknown>(file);
  if (raw === null) throw new ReelError(`${path.basename(dir)} holds no reel.json`, "not-found");
  const state = parseState(raw);
  if (typeof state === "string") throw new ReelError(`${file}: ${state}`);
  return state;
}

/** Change reel.json under the reel's lock. `fn` returns the same object to write nothing. */
export function mutateState(dir: string, fn: (s: ReelState) => ReelState): Promise<ReelState> {
  return withRunLock(dir, async () => {
    const cur = await readState(dir);
    const next = fn(cur);
    if (next !== cur) await writeJsonAtomic(path.join(dir, STATE_FILE), next);
    return next;
  });
}

export const tableSha = (t: ReelTable): string => createHash("sha256").update(canonical(t)).digest("hex");

/** The reel's table as `data` landed it, or the sentence why there is none to author from. */
export async function readTable(dir: string, state: ReelState): Promise<ReelTable> {
  const file = path.join(dir, "table.json");
  if (!existsSync(file)) throw new ReelError("the reel has no table yet");
  const t = parseTable(JSON.parse(await readFile(file, "utf8")) as unknown);
  if (typeof t === "string") throw new ReelError(`table.json: ${t}`);
  if (state.tableSha !== undefined && tableSha(t) !== state.tableSha) throw new ReelError("table.json was edited after the data step read it");
  return t;
}

/* ── the render's frame progress ─────────────────────────────────────────── */

export type FilmProgress = { readonly face: FilmFace; readonly frame: number; readonly frames: number; readonly at: string };

export const writeProgress = (dir: string, p: FilmProgress): Promise<void> => writeJsonAtomic(path.join(filmDirOf(dir), PROGRESS_FILE), p);

export const clearProgress = (dir: string): Promise<void> => rm(path.join(filmDirOf(dir), PROGRESS_FILE), { force: true });

const isFace = (x: unknown): x is FilmFace => x === "desktop" || x === "phone";

/** The progress a running render left, or undefined when there is none or it does not read. */
export async function readProgress(dir: string): Promise<FilmProgress | undefined> {
  const raw = await readJson<unknown>(path.join(filmDirOf(dir), PROGRESS_FILE)).catch(() => null);
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const { face, frame, frames, at } = o;
  if (!isFace(face) || typeof frame !== "number" || typeof frames !== "number" || typeof at !== "string") return undefined;
  return { face, frame, frames, at };
}
