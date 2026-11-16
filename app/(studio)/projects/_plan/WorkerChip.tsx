// THE WORKER, AS THE PLAN AND RUNS DRAW IT (./workerRead.ts reads it; @gt/kernel/worker-pulse-core
// decides it). One chip, and only when it changes what the operator should do: jobs are queued
// and no worker has beaten, so nothing will move until one starts. Quiet (nothing queued) and
// alive (a beat within its TTL) draw nothing. A read that failed says so in the store's words,
// never an absence that reads as "a worker is up".
//
// What starts a worker (`npm run worker`) is not said on screen: the chip states the fact, the
// operator knows the remedy, and the reason lives here.
//
// No hooks and no directive, so a Server Component and the client islands render the same markup.
import type { WorkerVerdict } from "@gt/kernel/worker-pulse-core";
import type { ActionResult } from "../../../_server/actionCore.ts";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import { when } from "../runs/_runs/view.ts";

export type WorkerRead = { readonly verdict: WorkerVerdict } | { readonly problem: string };

/** What a page hands the Plan: the read it made, and the guarded action that makes it again. */
export type WorkerDoor = { readonly read: WorkerRead; readonly reread: () => Promise<ActionResult<WorkerRead>> };

/** The chip's words, or null when nothing is drawn. Exported for the unit test. */
export function workerWords(read: WorkerRead, now: number): { readonly label: string; readonly value: string; readonly tone: "amber" | "rose"; readonly name: string } | null {
  if ("problem" in read) return { label: "worker", value: "unread", tone: "rose", name: `the worker could not be read: ${read.problem}` };
  const v = read.verdict;
  if (v.kind !== "none") return null;
  const last = v.lastBeat === null ? null : Date.parse(v.lastBeat);
  const since = v.queuedSince === null ? null : Date.parse(v.queuedSince);
  const queued = `${v.queued} queued${since === null ? "" : ` since ${when(since, now)}`}`;
  return {
    label: "no worker",
    value: last === null ? "never seen" : `last ${when(last, now)}`,
    tone: "amber",
    name: `no worker: ${queued}; ${last === null ? "no worker heartbeat on record" : `last worker heartbeat ${when(last, now)}`}`,
  };
}

export function WorkerChip({ read, now }: { readonly read: WorkerRead | null; readonly now: number }) {
  const w = read === null ? null : workerWords(read, now);
  return w === null ? null : <Chip label={w.label} value={w.value} tone={w.tone} name={w.name} />;
}
