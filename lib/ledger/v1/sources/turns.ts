import "server-only";

import { readdir, stat } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { JobState } from "@gt/domain/job";
import type { MediaLane, ResourceLane } from "@gt/domain/lane";

import { readJson } from "../../../../lib/foundry/runStore.ts";
import { pidAlive } from "../../../../lib/gpu/lease.ts";
import { currentBootId, TURN_ID_RE, turnDir } from "../../../../lib/turns/ledger.ts";
import { bump, facts, instant, laneOfEngine, readEach } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source } from "../types.ts";
import { universeRoot } from "./roots.ts";

// THE TURN LEDGER, PROJECTED - <turn dir>/tn-<12 hex>.json (lib/turns/ledger.ts),
// one durable record per AI turn, read with v1's `readJson` at the root
// roots.ts picks (turnDir() ignores the fixture switch; TEXT_TURN_DIR wins).
//
// Recorded: turn.start (`startedAt`, written once by newRecord) and turn.end
// (`endedAt`, written once by the terminal transition - done, failed,
// cancelled or orphaned - with the error's kind and message verbatim).
// Observed: turn.status for the two live statuses, which v1 moves through
// in place with no instant of their own (`updatedAt` is restamped on every
// write and is no fact). The receipt's cost rides in `data.costUsd`: a text
// turn books a text-usd row, which the spend source projects as money.
//
// LIVE: accepted / running (ledger.ts LIVE) - running only while the owner
// is alive by v1's own rule (ledger.ts ownerAlive, not exported, so repeated
// here): our bootId; else a different or absent host is gone; else our pid
// with a foreign bootId is an earlier boot of this process, gone; else ask the
// pid. A live record whose owner is gone is what v1's next sweep marks
// `orphaned`, and orphaned IS the kernel's `interrupted` (the holder died;
// look before re-spending - a turn is never re-dispatched by v1). So it is
// drawn interrupted before the sweep has even run.
//
// THE LANE comes from the receipt, which only a settled turn has (text:
// `provider`; imaging: `provenance.provider`; local: the GPU box). A live turn
// has no receipt yet, so its lane is taken from its turn class and says so.

const STATUSES = ["accepted", "running", "done", "failed", "cancelled", "orphaned"] as const;
const recordSchema = z.object({
  id: z.string().min(1),
  kind: z.string(),
  turn: z.string(),
  projectId: z.string(),
  slot: z.string().nullable(),
  status: z.enum(STATUSES),
  bootId: z.string(),
  pid: z.number(),
  host: z.string().optional(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  receipt: z
    .object({
      lane: z.enum(["imaging", "local"]).optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
      costUsd: z.number().optional(),
      provenance: z.object({ provider: z.string(), model: z.string(), costUsd: z.number().optional() }).optional(),
    })
    .optional(),
  error: z.object({ kind: z.string(), message: z.string() }).optional(),
});

type Turn = { readonly rec: Parsed<z.output<typeof recordSchema>>; readonly owner: "alive" | "gone" };
export type TurnsSnapshot = { readonly turns: readonly Turn[]; readonly skipped: readonly Skipped[] };

export const TURNS_READ_CAP = 2000;
const LIVE: readonly string[] = ["accepted", "running"];
const HREF = "/studio";

// v1 provider ids facts.ts's vendor table does not name (lib/imaging/types.ts
// PROVIDER_IDS, lib/text/types.ts TEXT_PROVIDER_IDS): the Leonardo studio is
// driven over CDP in the render box's Chrome; the retrieve rung is the same
// operator CLI as claude-cli.
const PROVIDER_LANES: Readonly<Record<string, ResourceLane>> = { "leonardo-studio": "box.chrome", "claude-cli-retrieve": "seat.text" };

// What a turn class works on (lib/text/types.ts TurnClass, ledger.ts WorkTurn).
const MEDIA: Readonly<Record<string, MediaLane>> = {
  "sound-hunt": "audio", "sound-lesson": "audio", "suno-propose": "audio", "suno-riff": "audio",
  "style-synthesis": "image", "image-generate": "image",
};

export const turnsRoot = (): string => universeRoot("turns", turnDir, "TEXT_TURN_DIR");

/** lib/turns/ledger.ts ownerAlive, over a parsed record. */
function ownerOf(r: { bootId: string; host?: string; pid: number }): Turn["owner"] {
  if (r.bootId === currentBootId()) return "alive";
  if (r.host === undefined || r.host !== hostname()) return "gone";
  if (r.pid === process.pid) return "gone";
  return pidAlive(r.pid) ? "alive" : "gone";
}

/**
 * The `cap` most recently written records. A turn id is `tn-` + random hex (ledger.ts mintTurnId), so
 * the ids' order is no clock and a lexical cut keeps an arbitrary set - live turns included. v1
 * rewrites a record on every transition, so its mtime is its last write: the live and the newly
 * settled sort first. A record gone between the listing and its stat is simply not kept.
 */
async function newest(root: string, ids: readonly string[], cap: number): Promise<string[]> {
  const got = await readEach(ids, async (id) => ({ id, ms: (await stat(path.join(root, `${id}.json`))).mtimeMs }));
  return got.items.sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id)).slice(0, cap).map((x) => x.id);
}

export async function readTurns(root: string, cap = TURNS_READ_CAP): Promise<Result<TurnsSnapshot>> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) return err("unavailable", `turns: listing ${root} failed: ${errorMessage(e)}`, { cause: e });
    names = [];
  }
  const all = names.filter((n) => n.endsWith(".json") && TURN_ID_RE.test(n.slice(0, -5))).map((n) => n.slice(0, -5));
  const ids = (all.length <= cap ? all : await newest(root, all, cap)).sort();
  const got = await readEach(ids, async (id) => ({ id, raw: await readJson<unknown>(path.join(root, `${id}.json`)) }));
  const turns: Turn[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    if (d.raw === null) continue;
    const rec = parseAt(`turn ${d.id}`, recordSchema, d.raw);
    if (rec.ok) turns.push({ rec: rec.value, owner: ownerOf(rec.value) });
    else skipped.push({ id: d.id, reason: rec.error.message });
  }
  return ok({ turns, skipped });
}

type Rec = Turn["rec"];

/** The settled turn's lane from its receipt, or the live turn's from its class (with the reason). */
export function laneOf(r: Rec): { lane: ResourceLane; laneFrom?: string } {
  const provider = r.receipt?.provenance?.provider ?? r.receipt?.provider;
  if (r.receipt?.lane === "local" || r.turn === "local-render") return { lane: "gpu.local" };
  if (provider !== undefined) {
    const lane = PROVIDER_LANES[provider] ?? laneOfEngine(provider);
    if (lane !== null) return { lane };
    return { lane: "seat.text", laneFrom: `no resource lane for provider "${provider}"; drawn on the text seat` };
  }
  if (r.turn === "image-generate") return { lane: "cloud.google", laneFrom: "an unsettled imaging turn names no provider until its receipt; drawn on Google, the imaging router's first planned generator (lib/imaging/router.ts PLAN)" };
  return { lane: "seat.text", laneFrom: "an unsettled text turn names no provider until its receipt; drawn on the text seat, the router's first rung" };
}

function eventsOf({ rec }: Turn, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("turns", ctx);
  const subject = { kind: "turn", id: rec.id };
  const { lane } = laneOf(rec);
  const data: EventData = { runId: rec.id, projectId: rec.projectId, kind: rec.kind, turn: rec.turn };
  const actor = { kind: "agent", id: rec.turn } as const;
  const out: IngestEvent[] = [f.recorded(rec.id, "start", rec.startedAt, { actor, type: "turn.start", subject, lane, data })];
  if (LIVE.includes(rec.status)) out.push(f.observed(rec.id, `status.${rec.status}`, { actor, type: "turn.status", subject, lane, data: { ...data, status: rec.status } }));
  if (rec.endedAt !== undefined) {
    const cost = rec.receipt?.provenance?.costUsd ?? rec.receipt?.costUsd;
    const model = rec.receipt?.provenance?.model ?? rec.receipt?.model;
    const end: EventData = {
      ...data,
      status: rec.status,
      ...(model === undefined ? {} : { model }),
      ...(cost === undefined ? {} : { costUsd: cost }),
      ...(rec.error === undefined ? {} : { error: rec.error.message, errorKind: rec.error.kind }),
    };
    out.push(f.recorded(rec.id, `end.${rec.status}`, rec.endedAt, { actor, type: "turn.end", subject, lane, data: end }));
  }
  return out;
}

function tallyOf(turns: readonly Turn[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const { rec } of turns) {
    bump(records, `turn.${rec.status}`);
    bump(fs, "turn.start");
    if (LIVE.includes(rec.status)) bump(fs, "turn.status");
    if (rec.endedAt !== undefined) bump(fs, "turn.end");
  }
  return { records, facts: fs };
}

function liveOf({ rec, owner }: Turn): LiveJob | null {
  if (!LIVE.includes(rec.status)) return null;
  const state: JobState = owner === "gone" ? "interrupted" : rec.status === "accepted" ? "queued" : "running";
  const startedAt = instant(rec.startedAt);
  return {
    source: "turns",
    id: rec.id,
    title: `${rec.kind} · ${rec.projectId}`,
    ...laneOf(rec),
    media: MEDIA[rec.turn] ?? "video",
    state,
    ...(startedAt === null ? {} : { startedAt }),
    ...(owner === "gone" ? { error: `the server that dispatched this turn (pid ${rec.pid}${rec.host === undefined ? "" : ` on ${rec.host}`}) is gone; v1's next sweep marks it orphaned` } : {}),
    href: HREF,
  };
}

export function projectTurns(s: TurnsSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.turns.flatMap((t) => eventsOf(t, ctx)),
    live: s.turns.map(liveOf).filter((j) => j !== null),
    weir: [],
    tally: tallyOf(s.turns),
    skipped: s.skipped,
  };
}

export const turnsSource: Source<TurnsSnapshot> = { id: "turns", read: () => readTurns(turnsRoot()), project: projectTurns };
