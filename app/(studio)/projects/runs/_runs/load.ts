import "server-only";

import type { Event } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { queryEvents } from "@gt/kernel/events-query";
import { list } from "@gt/kernel/job";

import { FIXTURE_MODE } from "../../../../../lib/fixtures/mode.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";
import { freshLedger, liveNow } from "../../../../../lib/ledger/v1/sync.ts";
import { buildRuns, spanAround, type KernelJobInput, type RunsModel } from "./model.ts";

// RUNS' ONE READ, at render time and server-side only (Server Component data, plan §9.2).
//
// What it reads, each bounded:
//   v1 live work   liveNow() walks every registered source (lib/ledger/v1/sources.ts); each
//                  adapter bounds its own fan-out (its READ_CAP, facts.ts readEach width 8);
//   kernel jobs    @gt/kernel/job list(): at most KERNEL_CAP, newest last (Phase 4 adds the
//                  rows; list() itself has no limit yet - reported, not worked around here);
//   ledger past    one time-ordered page of run.start/run.end/commit in the window (at most
//                  LEDGER_CAP), plus the starts of runs that ended inside it but began before
//                  it, by subject id, at most 200 ids a query.
// It also asks for a fresh ledger (freshLedger: a non-blocking sync under the store's claim,
// at most every 30 s), so watching Runs is what keeps the ledger's past current - and the
// events that sync appends reach this page through the SSE stream as a refresh.

export const LEDGER_CAP = 1000;
export const KERNEL_CAP = 500;
const IDS_PER_QUERY = 200;

export type RunsData = {
  readonly model: RunsModel;
  /** The ledger's newest seq at render: the SSE stream continues from here. */
  readonly head: number;
  readonly universe: "real" | "fixture";
  /** The ledger or the kernel could not be read; the live half still renders. */
  readonly problems: readonly { readonly source: string; readonly error: string }[];
};

function kernelInput(j: Job): KernelJobInput {
  return {
    id: j.id,
    title: `${j.of.kind} ${j.of.id}`,
    lane: j.lane,
    state: j.state,
    ...(j.lease === undefined ? {} : { startedAt: j.lease.acquiredAt }),
    progress: j.progress,
    attempt: j.attempt,
    ...(j.error === undefined ? {} : { error: j.error.message }),
  };
}

export async function loadRuns(now: number = Date.now()): Promise<RunsData> {
  const problems: { source: string; error: string }[] = [];
  const sync = freshLedger();
  if (!sync.ok) problems.push({ source: "ledger-sync", error: sync.error.message });

  const live = await liveNow();
  const span = spanAround(now);
  const ledger: Event[] = [];
  const jobs: KernelJobInput[] = [];
  let head = 0;

  const k = kernel();
  if (!k.ok) problems.push({ source: "kernel", error: k.error.message });
  else {
    const store = k.value.store;
    const page = queryEvents(store, { type: ["run.start", "run.end", "commit"], since: new Date(span.from).toISOString(), by: "time", order: "desc", limit: LEDGER_CAP });
    if (!page.ok) problems.push({ source: "ledger", error: page.error.message });
    else {
      head = page.value.head;
      ledger.push(...page.value.events);
      if (page.value.capped) problems.push({ source: "ledger", error: `more than ${LEDGER_CAP} run events in the window; the oldest are not drawn` });
      const started = new Set(page.value.events.filter((e) => e.type === "run.start").map((e) => e.subject.id));
      const orphans = [...new Set(page.value.events.filter((e) => e.type === "run.end" && !started.has(e.subject.id)).map((e) => e.subject.id))];
      for (let i = 0; i < orphans.length; i += IDS_PER_QUERY) {
        const more = queryEvents(store, { type: ["run.start"], subject: { ids: orphans.slice(i, i + IDS_PER_QUERY) }, limit: LEDGER_CAP });
        if (!more.ok) problems.push({ source: "ledger", error: more.error.message });
        else ledger.push(...more.value.events);
      }
    }
    const kj = list(store);
    if (!kj.ok) problems.push({ source: "kernel jobs", error: kj.error.message });
    else jobs.push(...kj.value.slice(-KERNEL_CAP).map(kernelInput));
  }

  return {
    model: buildRuns({ now, live, kernel: jobs, ledger }),
    head,
    universe: FIXTURE_MODE ? "fixture" : "real",
    problems,
  };
}
