import "server-only";

import { abQueueKey, AB_WINDOW_S, YUE2_RIGHTS, type AbPair, type AbSource, type SongScores, type Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { parseAbPair } from "@gt/domain/audio.yue2.schema";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { EVENT_COLUMNS, rowToEvent } from "@gt/kernel/events";
import type { Store } from "@gt/kernel/store";

import type { AudioAnalysis } from "../audio/sidecar.ts";
import { enqueueYue2In, yue2JobId } from "../producers/yue2Jobs.ts";
import { readTakes, soundFailure } from "../sound/store.ts";
import { takeFileHref } from "../sound/takeHref.ts";
import { createTake, type IncomingFile } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";
import { proposePairs, queuePairs } from "./ab.ts";
import { allYue2Facts } from "./facts.ts";
import { readSongScores } from "./scores.ts";
import { takeSha } from "./sha.ts";

// THE SONG LAB'S DESK ACTS (spark yue2-song-lab WP3) - what the Server Actions
// (app/(studio)/audio/_songlab/acts.ts), the reference route and the agent door
// (app/_server/mcp/tools/songlab.ts) share beyond a launch (lib/producers/yue2Jobs.ts):
//
//   queueBlindPairs  WP4's proposal, queued (its side drawn there), then one `yue2-post` ab-window job
//                    per arm - the arm's take read off the QUEUED pair, so the side the files are cut
//                    by is the side the vote is revealed by;
//   fileReference    an uploaded reference as a take (`origin:"import"`, `use:"reference"`), no facts;
//   labTakes         the lab's takes with their facts, their newest scores and the rights line.

/** The rights line every listing carries (warn-only: shown, never blocking). */
export const RIGHTS_LINE = `${YUE2_RIGHTS.model} · ${YUE2_RIGHTS.licence} · non-commercial; ${YUE2_RIGHTS.policy}-only, nothing is blocked`;

/** A reference take's `use`: excluded from candidates by every reader (lib/yue2/ab.ts). */
export const REFERENCE_USE = "reference";

/* ── blind pairs ──────────────────────────────────────────────────────────── */

export type PairDeps = {
  readonly propose: (store: Store, source: AbSource, limit: number) => Promise<Result<readonly AbPair[]>>;
  readonly queue: (store: Store, pairs: readonly AbPair[], actor: Actor, at: string) => Result<readonly string[]>;
};
const LIVE_PAIRS: PairDeps = { propose: proposePairs, queue: queuePairs };

export type QueuedBlind = { readonly pairId: string; readonly jobIds: readonly string[] };

/** The pair as it was queued (its drawn side), read by its event key. */
export function queuedPair(store: Store, pairId: string): Result<AbPair | undefined> {
  return store.read((r) => {
    const row = r.get(`SELECT ${EVENT_COLUMNS} FROM events WHERE key = ?`, abQueueKey(pairId));
    if (row === undefined) return undefined;
    const e = rowToEvent(row);
    if (!e.ok) throw e.error;
    const p = parseAbPair(e.value.data);
    if (!p.ok) throw p.error;
    return p.value;
  });
}

export const abJobId = (pairId: string, arm: "a" | "b"): string => yue2JobId("yue2-post", `ab-${pairId}-${arm}`);

/** Propose, queue, then cut each queued pair's two windows (an arm whose job exists is not enqueued again). */
export async function queueBlindPairs(store: Store, source: AbSource, limit: number, actor: Actor, now = new Date(), deps: PairDeps = LIVE_PAIRS): Promise<Result<readonly QueuedBlind[]>> {
  const proposed = await deps.propose(store, source, limit);
  if (!proposed.ok) return proposed;
  if (proposed.value.length === 0) return ok([]);
  const ids = deps.queue(store, proposed.value, actor, now.toISOString());
  if (!ids.ok) return ids;
  const out: QueuedBlind[] = [];
  for (const pairId of ids.value) {
    const q = queuedPair(store, pairId);
    if (!q.ok) return q;
    const pair = q.value;
    if (pair === undefined) return err("internal", `pair ${pairId} was queued but its event is not in the ledger`);
    const arms = [
      { arm: "a" as const, takeId: pair.side === "ab" ? pair.takeA : pair.takeB },
      { arm: "b" as const, takeId: pair.side === "ab" ? pair.takeB : pair.takeA },
    ];
    const windowS = Math.min(120, Math.max(5, pair.windowS[1] - pair.windowS[0] || AB_WINDOW_S));
    const r = store.tx((t) => {
      const jobIds: string[] = [];
      for (const a of arms) {
        const jobId = abJobId(pairId, a.arm);
        jobIds.push(jobId);
        if (t.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) !== undefined) continue;
        enqueueYue2In(t, "yue2-post", jobId, { takeId: a.takeId, stages: [], op: "ab-window", windowS, pairId, arm: a.arm, by: actor.id }, actor);
      }
      return jobIds;
    });
    if (!r.ok) return r;
    out.push({ pairId, jobIds: r.value });
  }
  return ok(out);
}

/* ── a reference ──────────────────────────────────────────────────────────── */

/** File an uploaded reference with its analysis: a take for the master stage to match, never a candidate. */
export async function fileReference(file: IncomingFile, analysis: AudioAnalysis, now = new Date()): Promise<Result<SoundTake>> {
  const m = analysis.measure;
  try {
    const { take } = await createTake(
      {
        kind: "music",
        origin: "import",
        provider: "local",
        op: "manual",
        use: REFERENCE_USE,
        title: file.name.replace(/\.[A-Za-z0-9]{1,6}$/, "").slice(0, 200) || "reference",
        durationS: analysis.durationS > 0 ? analysis.durationS : null,
        tempoBpm: analysis.tempo?.bpm ?? null,
        key: analysis.key?.name ?? null,
        measured: {
          tempoBpm: analysis.tempo?.bpm ?? null,
          key: analysis.key?.name ?? null,
          energy: null,
          durationS: analysis.durationS > 0 ? analysis.durationS : null,
          lufs: m.integratedLufs,
          truePeakDb: m.truePeakDb,
        },
      },
      file,
      now,
    );
    return ok(take);
  } catch (e) {
    return soundFailure(e);
  }
}

/* ── the listing ──────────────────────────────────────────────────────────── */

export type LabTake = {
  readonly takeId: string;
  readonly title: string;
  readonly href: string;
  readonly createdAt: string;
  readonly parentId?: string;
  readonly facts: Yue2TakeFacts;
  /** The newest scorer's row; absent = not scored yet. */
  readonly scores?: SongScores;
};

export type LabDeps = {
  readonly facts: () => Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>>;
  readonly scores: (store: Store, shas: readonly string[]) => Result<Readonly<Record<string, SongScores>>>;
};
const LIVE_LAB: LabDeps = { facts: allYue2Facts, scores: readSongScores };

/** The newest `limit` YuE2 takes (a take without facts is not one), each with its newest scores. */
export async function labTakes(store: Store, limit: number, deps: LabDeps = LIVE_LAB): Promise<Result<readonly LabTake[]>> {
  const facts = await deps.facts();
  if (!facts.ok) return facts;
  let takes: readonly SoundTake[];
  try {
    takes = (await readTakes()).takes;
  } catch (e) {
    return soundFailure(e);
  }
  const lab = takes
    .filter((t) => facts.value[t.id] !== undefined && t.file !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
  const shas = new Map<string, string>();
  for (const t of lab) {
    // A take's sha is its facts' (cached at filing, S2), so its scores outlive its file; a pre-S2 take whose
    // file is gone has no sha to read and is listed unscored.
    const sha = await takeSha(t);
    if (sha.ok) shas.set(t.id, sha.value);
  }
  const rows = deps.scores(store, [...new Set(shas.values())]);
  if (!rows.ok) return rows;
  return ok(
    lab.map((t): LabTake => {
      const sha = shas.get(t.id);
      const s = sha === undefined ? undefined : rows.value[sha];
      return {
        takeId: t.id,
        title: t.title,
        href: takeFileHref(t.id),
        createdAt: t.createdAt,
        ...(t.parentId === null ? {} : { parentId: t.parentId }),
        facts: facts.value[t.id]!,
        ...(s === undefined ? {} : { scores: s }),
      };
    }),
  );
}
