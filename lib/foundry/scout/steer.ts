// THE OPERATOR'S STEER - server only (spark scout-decision-graph). `<homeRoot>/steer.json` (./types.ts Steer):
// the advisory split of a night's runs by audience, then genre, and the branches paused. Written by the /scout
// screen's actions, read by the graph (lib/foundry/scout/graph.ts), the next night's brief (taste.ts) and the
// doors that take a seed (pausedUnder). Nothing here enforces the split: the operator chose advisory (wave 1).
//
// Every change APPENDS a history entry beside the current state, so a split set a month ago can be read back
// and set again (registry marketing/budget-reallocation-prescription: a prescription that cannot be read back
// is a button that once did something). A missing file is the empty steer: no split, nothing paused.
//
// READ-ONLY SINCE THE BASELINE (spark project-baseline): the file stays in the pre-baseline root (store.ts homeRoot)
// and every write answers ./baseline.ts ARCHIVED_DOOR while the archive is on - the steer split a spread that stopped.

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";

import { FoundryError, readManifestFile, writeJsonAtomic } from "../runStore";
import { withRunLock } from "../verdictLog";
import { archivedDoor } from "./baseline";
import { homeRoot } from "./store";
import { GENRE_MAX, SEED_AUDIENCES, SEED_REF_RE, type SeedAudience, type SeedRef, type Steer, type SteerEntry, type SteerSplit } from "./types";

const STEER_FILE = "steer.json";
export const EMPTY_STEER: Steer = { paused: [], history: [] };

const steerFile = (): string => path.join(homeRoot(), STEER_FILE);

export async function readSteer(): Promise<Steer> {
  const s = await readManifestFile<Steer>(steerFile(), "steer", "steer");
  if (s === undefined) throw new FoundryError(`The steer is unreadable - a writer may be mid-write; try again, else inspect ${steerFile()}.`, 503);
  return s ?? EMPTY_STEER;
}

async function mutateSteer(fn: (s: Steer) => Steer): Promise<Steer> {
  await mkdir(homeRoot(), { recursive: true });
  return withRunLock(homeRoot(), async () => {
    const before = await readSteer();
    const after = fn(before);
    if (after !== before) await writeJsonAtomic(steerFile(), after);
    return after;
  });
}

/* ── The split ────────────────────────────────────────────────────────────── */

const isAudience = (x: string): x is SeedAudience => (SEED_AUDIENCES as readonly string[]).includes(x);

/** Whole percents from 0 to 100 that sum to 100 - one level of a split. */
function sharesProblem(label: string, shares: Readonly<Record<string, number>>): string | undefined {
  const values = Object.values(shares);
  if (values.length === 0) return `${label} names no share`;
  for (const [k, v] of Object.entries(shares)) if (!Number.isInteger(v) || v < 0 || v > 100) return `${label}: ${k} is ${v}; a share is a whole percent from 0 to 100`;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum === 100 ? undefined : `${label} sums to ${sum}; it must sum to 100`;
}

/** The split door: audiences from SEED_AUDIENCES, genres one line each, every level summing to 100. */
export function checkSplit(split: SteerSplit): Result<SteerSplit> {
  for (const a of Object.keys(split.audience)) if (!isAudience(a)) return err("invalid", `unknown audience "${a}" (known: ${SEED_AUDIENCES.join(", ")})`);
  const top = sharesProblem("the audience split", split.audience);
  if (top !== undefined) return err("invalid", top);
  for (const [a, genres] of Object.entries(split.genre ?? {})) {
    if (!isAudience(a)) return err("invalid", `unknown audience "${a}" in the genre split`);
    if (genres === undefined) continue;
    for (const g of Object.keys(genres)) if (g.trim() === "" || g.length > GENRE_MAX || g.includes("\n")) return err("invalid", `a genre is one line of at most ${GENRE_MAX} characters, got "${g}"`);
    const p = sharesProblem(`the ${a} genre split`, genres);
    if (p !== undefined) return err("invalid", p);
  }
  return ok(split);
}

export async function setSplit(split: SteerSplit, by: string, now: Date = new Date()): Promise<Result<Steer>> {
  const shut = archivedDoor();
  if (shut !== undefined) return err("refused", shut);
  const c = checkSplit(split);
  if (!c.ok) return c;
  const entry: SteerEntry = { at: now.toISOString(), by, act: "split", split: c.value };
  return ok(await mutateSteer((s) => ({ ...s, split: c.value, history: [...s.history, entry] })));
}

/* ── Pause ────────────────────────────────────────────────────────────────── */

export async function pauseBranch(ref: SeedRef, by: string, now: Date = new Date()): Promise<Result<Steer>> {
  if (!SEED_REF_RE.test(ref)) return err("invalid", `not a seed ref: ${ref} (want <batch>/sd-NNN)`);
  const shut = archivedDoor();
  if (shut !== undefined) return err("refused", shut);
  return ok(
    await mutateSteer((s) => (s.paused.includes(ref) ? s : { ...s, paused: [...s.paused, ref], history: [...s.history, { at: now.toISOString(), by, act: "pause", ref }] })),
  );
}

export async function resumeBranch(ref: SeedRef, by: string, now: Date = new Date()): Promise<Result<Steer>> {
  if (!SEED_REF_RE.test(ref)) return err("invalid", `not a seed ref: ${ref} (want <batch>/sd-NNN)`);
  const shut = archivedDoor();
  if (shut !== undefined) return err("refused", shut);
  return ok(
    await mutateSteer((s) =>
      s.paused.includes(ref) ? { ...s, paused: s.paused.filter((r) => r !== ref), history: [...s.history, { at: now.toISOString(), by, act: "resume", ref }] } : s,
    ),
  );
}

/**
 * The paused seed a ref sits under - itself or the nearest paused ancestor - or undefined. `ancestry` is the
 * ref's chain nearest first, itself included (seedStore.ts ancestryOf).
 */
export function pausedUnder(steer: Steer, ancestry: readonly SeedRef[]): SeedRef | undefined {
  return ancestry.find((r) => steer.paused.includes(r));
}
