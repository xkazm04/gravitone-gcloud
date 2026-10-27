// THE GRAPH'S EFFORT - server only (spark scout-decision-graph WP-S2). What each candidate of every night cost,
// read from the kernel's own records, never from a figure a night keeps itself:
//
//   geminiUsd    the job's spend rows the night ceiling caps (./budget.ts `jobMoney` settled: Gemini, and a row
//                naming no model, erring high);
//   uncappedUsd  the rest of its booked rows: the studio's credits, Suno, the Claude seat;
//   gpuMin       claimed-to-ended of its jobs on `gpu.local`, from the append-only job events (`job.claimed` opens
//                a span; `job.done`, `job.failed`, `job.stopped`, `job.yielded` or `job.interrupted` ends it - a
//                yield or an interruption hands the card back as surely as a finish does). A span still open is
//                counted to `now`: it is effort being spent while the graph is read;
//   runs         1 per candidate: a candidate is one decision's worth of work, rendered or written.
//
// A JOB THAT SERVED SEVERAL CANDIDATES (the ideas job draws a batch of artboards, the reels job a batch of
// strips; their candidates all carry its id) is divided evenly over them, and each is marked `shared`, so a
// branch never claims a whole batch's money for its one idea - and the batch's total still adds back up.
//
// Events are read through the kernel's query API (@gt/kernel/events-query), never by SQL on its table.

import { eventTime } from "@gt/domain/event";
import { ok, type Result } from "@gt/domain/errors";
import type { GraphEffort } from "@gt/domain/scoutGraph";
import { queryEvents } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";

import { jobMoney } from "./budget";
import type { Night } from "./types";

export const GPU_LANE = "gpu.local";
const OPENS = "job.claimed";
const CLOSES: readonly string[] = ["job.done", "job.failed", "job.stopped", "job.yielded", "job.interrupted"];
/** The query API's own caps: subject ids per query, events per page. */
const IDS_PER_QUERY = 200;
const PAGE = 1000;

const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const min2 = (x: number): number => Math.round(x * 100) / 100;

/** Minutes each job held the GPU lane, by job id (a job that never claimed it is absent). */
export function gpuMinutes(store: Store, jobIds: readonly string[], now: Date): Result<Map<string, number>> {
  const ms = new Map<string, number>();
  const open = new Map<string, number>();
  for (let i = 0; i < jobIds.length; i += IDS_PER_QUERY) {
    const ids = jobIds.slice(i, i + IDS_PER_QUERY);
    let after = 0;
    for (;;) {
      const page = queryEvents(store, { type: [OPENS, ...CLOSES], lane: [GPU_LANE], subject: { kind: "job", ids }, order: "asc", after, limit: PAGE });
      if (!page.ok) return page;
      for (const e of page.value.events) {
        const id = e.subject.id;
        const at = Date.parse(eventTime(e));
        if (!Number.isFinite(at)) continue;
        if (e.type === OPENS) {
          if (!open.has(id)) open.set(id, at);
          continue;
        }
        const from = open.get(id);
        if (from === undefined) continue;
        open.delete(id);
        ms.set(id, (ms.get(id) ?? 0) + Math.max(0, at - from));
      }
      if (page.value.next === undefined) break;
      after = page.value.next;
    }
  }
  const nowMs = now.getTime();
  for (const [id, from] of open) ms.set(id, (ms.get(id) ?? 0) + Math.max(0, nowMs - from));
  return ok(new Map([...ms].map(([id, v]) => [id, v / 60_000])));
}

/** Every candidate's effort, by `<night>/<c-id>`. */
export function effortOf(store: Store, nights: readonly Night[], now: Date): Result<Map<string, GraphEffort>> {
  const served = new Map<string, string[]>();
  for (const n of nights) {
    for (const c of n.candidates) {
      if (c.jobId === undefined) continue;
      const keys = served.get(c.jobId) ?? [];
      keys.push(`${n.id}/${c.id}`);
      served.set(c.jobId, keys);
    }
  }
  const jobIds = [...served.keys()];
  const gpu = gpuMinutes(store, jobIds, now);
  if (!gpu.ok) return gpu;
  const money = store.read((r) => new Map(jobIds.map((id) => [id, jobMoney(r, id)])));
  if (!money.ok) return money;
  const out = new Map<string, GraphEffort>();
  for (const n of nights) {
    for (const c of n.candidates) {
      const key = `${n.id}/${c.id}`;
      const keys = c.jobId === undefined ? undefined : served.get(c.jobId);
      const m = c.jobId === undefined ? undefined : money.value.get(c.jobId);
      if (c.jobId === undefined || keys === undefined || m === undefined) {
        out.set(key, { runs: 1, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 });
        continue;
      }
      const share = 1 / keys.length;
      out.set(key, {
        runs: 1,
        gpuMin: min2((gpu.value.get(c.jobId) ?? 0) * share),
        geminiUsd: usd6(m.settledUsd * share),
        uncappedUsd: usd6(m.uncappedUsd * share),
        ...(keys.length > 1 ? { shared: true as const } : {}),
      });
    }
  }
  return ok(out);
}

/** Efforts summed (a group's): `shared` does not survive the sum - a group's total is whole. */
export function sumEffort(all: Iterable<GraphEffort | undefined>): GraphEffort {
  let runs = 0;
  let gpuMin = 0;
  let geminiUsd = 0;
  let uncappedUsd = 0;
  for (const e of all) {
    if (e === undefined) continue;
    runs += e.runs;
    gpuMin += e.gpuMin;
    geminiUsd += e.geminiUsd;
    uncappedUsd += e.uncappedUsd;
  }
  return { runs, gpuMin: min2(gpuMin), geminiUsd: usd6(geminiUsd), uncappedUsd: usd6(uncappedUsd) };
}
