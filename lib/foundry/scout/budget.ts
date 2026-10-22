import { ok, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { loadJob } from "@gt/kernel/job";
import { loadRun } from "@gt/kernel/records/schema";
import { meterOf } from "@gt/kernel/spend/projection";
import type { Reader, Store } from "@gt/kernel/store";

import type { Night } from "./types";

// THE NIGHT'S MONEY - what is left of its ceiling, read from the kernel's own
// records over the jobs the night launched (`night.jobs`), never from a figure the
// night keeps itself. Every launch passes `remainingUsd` as its job's ceiling, and
// the CLI refuses a launch whose worst case is over it (pipeline/scout.mts).
//
//   settled  what the METER booked against each job: spend_rows by job id
//            (kernel spend/projection.ts `meterOf`, the authority a job's own
//            `spend` is a projection of - decision 7). A dry job books nothing.
//   held     what is promised and not yet booked:
//            - an unfinished LIVE job (planned, queued, running, paused,
//              interrupted) holds the rest of its worst case - the Run row's
//              confirmed estimate (records/schema.ts `loadRun`), capped by the
//              job's own ceiling, or that ceiling when no Run row priced it - less
//              what it already booked, and never less than its open meter holds;
//            - any job, finished or not, holds its meter reservations still
//              `held` or `lapsed` (spend/ledger.ts: a lapsed hold's outcome is
//              unknown and keeps counting at its estimate).
//            A `failed` job promises nothing more until an operator retries it,
//            and a retry is not the night's act.
//   clips    scene candidates that asked for a clip (`clipRequested`) and did not end
//            `failed`: a clip the vendor refused leaves its scene `rendered` with
//            `error: clip: ...` and still counts (a refused clip is not retried free),
//            while a scene that failed at its read or its stills never reached the
//            clip step - counting it spent the night's two clips on recipes the door
//            refused (2026-10-22 dry campaign: two failed reads left the third scene
//            stills-only).

export type NightBudget = {
  readonly ceilingUsd: number;
  readonly settledUsd: number;
  readonly heldUsd: number;
  readonly remainingUsd: number;
  readonly clipsUsed: number;
  readonly clipCap: number;
};

const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const OPEN: readonly Job["state"][] = ["planned", "queued", "running", "paused", "interrupted"];

/** The worst case a job was launched on: its Run row's estimate, else its ceiling. */
function promiseOf(r: Reader, job: Job): number | undefined {
  const row = r.get("SELECT id FROM runs WHERE job_id = ?", job.id);
  const est = row === undefined ? undefined : loadRun(r, String(row["id"])).run.estimate.usd;
  const quoted = est === null || est === undefined ? undefined : est;
  if (quoted === undefined) return job.ceilingUsd;
  return job.ceilingUsd === undefined ? quoted : Math.min(quoted, job.ceilingUsd);
}

/** One job's settled and held dollars. A job id the store does not know (a launch that died before its enqueue) is $0. */
export function jobMoney(r: Reader, jobId: string): { readonly settledUsd: number; readonly heldUsd: number } {
  if (r.get("SELECT 1 AS x FROM jobs WHERE id = ?", jobId) === undefined) return { settledUsd: 0, heldUsd: 0 };
  const { job } = loadJob(r, jobId);
  const settledUsd = meterOf(r, jobId).usd;
  const open = num(r.get("SELECT total(amount) AS v FROM spend_reservations WHERE job_id = ? AND state = 'held'", jobId)?.["v"]);
  const lapsed = num(r.get("SELECT total(amount) AS v FROM spend_reservations WHERE job_id = ? AND state = 'lapsed'", jobId)?.["v"]);
  let heldUsd = open + lapsed;
  if (job.mode.kind === "live" && OPEN.includes(job.state)) {
    const promise = promiseOf(r, job);
    if (promise !== undefined) heldUsd = Math.max(heldUsd, promise - settledUsd);
  }
  return { settledUsd: usd6(settledUsd), heldUsd: usd6(Math.max(0, heldUsd)) };
}

export function nightBudget(store: Store, night: Night): Result<NightBudget> {
  const money = store.read((r) => night.jobs.map((id) => jobMoney(r, id)));
  if (!money.ok) return money;
  const settledUsd = usd6(money.value.reduce((a, m) => a + m.settledUsd, 0));
  const heldUsd = usd6(money.value.reduce((a, m) => a + m.heldUsd, 0));
  const clipsUsed = night.candidates.filter((c) => c.kind === "scene" && c.clipRequested === true && c.status !== "failed").length;
  return ok({ ceilingUsd: night.ceilingUsd, settledUsd, heldUsd, remainingUsd: usd6(Math.max(0, night.ceilingUsd - settledUsd - heldUsd)), clipsUsed, clipCap: night.clipCap });
}
