import type { Holder } from "@gt/domain/job";
import { laneOfSlot } from "@gt/domain/lane";
import type { Alive } from "./lease-core.ts";
import { statusIn } from "./lease.ts";
import type { Reader } from "./store.ts";
import { INTO_QUEUE, type WorkerPulse } from "./worker-pulse-core.ts";

// THE WORKER'S PULSE, READ - the facts ./worker-pulse-core.ts decides on, gathered inside the
// caller's read transaction (one snapshot: a beat landing between two statements cannot make the
// queue and the leases disagree). Never a write.
//
// The timer resources are the caller's to name (`timer:<name>` is @gt/producers/publish/timers'
// spelling, a layer above this one); the lane slots are the kernel's own (`<lane>#<i>`). A bare
// lane resource (`gpu.local`) is the v1 GPU broker's and the Python tools' lease, not a drive, and
// is not read. Bounded: the leases table holds a row per resource ever claimed (tens), and the
// queued-since read looks at the oldest QUEUED_CAP queued jobs.

export const QUEUED_CAP = 500;

const isSlot = (resource: string): boolean => resource.includes("#") && laneOfSlot(resource) !== undefined;

/** Held, within its TTL, and its holder not provably gone (lease-core staleReason). */
function fresh(r: Reader, resource: string, me: Holder, alive: Alive): boolean {
  const s = statusIn(r, resource, me, alive);
  return s.holder !== undefined && s.stale === undefined;
}

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const newest = (xs: readonly (string | null)[]): string | null => xs.reduce<string | null>((a, x) => (x !== null && (a === null || Date.parse(x) > Date.parse(a)) ? x : a), null);

export function workerPulseIn(r: Reader, timers: readonly string[], me: Holder, alive: Alive): WorkerPulse {
  const queuedRow = r.get("SELECT count(*) AS c FROM jobs WHERE state = 'queued'");
  const queued = typeof queuedRow?.["c"] === "number" ? queuedRow["c"] : 0;
  const into = INTO_QUEUE.map(() => "?").join(", ");
  const since =
    queued === 0
      ? null
      : str(
          r.get(
            `SELECT min(t) AS m FROM (SELECT (SELECT max(e.at) FROM events e WHERE e.subject_id = j.id AND e.type IN (${into})) AS t FROM jobs j WHERE j.state = 'queued' ORDER BY j.n LIMIT ?)`,
            ...INTO_QUEUE,
            QUEUED_CAP,
          )?.["m"],
        );

  const named = new Set(timers);
  const rows = r.all("SELECT resource, heartbeat_at FROM leases").flatMap((row) => {
    const resource = String(row["resource"]);
    return named.has(resource) || isSlot(resource) ? [{ resource, beat: str(row["heartbeat_at"]) }] : [];
  });
  const timerBeating = rows.some((x) => named.has(x.resource) && x.beat !== null && fresh(r, x.resource, me, alive));

  const running = r.all("SELECT json_extract(record, '$.slot') AS slot FROM jobs WHERE state = 'running'");
  const driving = running.filter((row) => {
    const slot = str(row["slot"]);
    return slot !== null && fresh(r, slot, me, alive);
  }).length;

  // The last instant anything that drives was seen: a heartbeat still on a held row, or the
  // claim, release or take-over of one (a heartbeat is not an event; those three are).
  const ids = rows.map((x) => x.resource);
  const acted =
    ids.length === 0
      ? null
      : str(r.get(`SELECT max(at) AS m FROM events WHERE type IN ('lease.claimed', 'lease.released', 'lease.reclaimed') AND subject_id IN (${ids.map(() => "?").join(", ")})`, ...ids)?.["m"]);
  const lastBeat = newest([...rows.map((x) => x.beat), acted]);

  return { at: r.at, queued, queuedSince: since, timerBeating, driving, lastBeat };
}
