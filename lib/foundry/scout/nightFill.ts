import type { ResourceLane } from "@gt/domain/lane";
import type { Actor } from "@gt/domain/event";
import type { Reader, Store } from "@gt/kernel/store";

import { closeAct, Refusal, type ActContext } from "./acts";
import { recentLoad, type RecentLoad } from "./load";
import { hasPlan, mutatePlan, readPlan, settleItem, type PlanItem } from "./plan";
import type { PlanDoors } from "./planDoors";
import { listNights, readNight } from "./store";
import type { Night, NightId } from "./types";
import { withWing } from "./wingScope";

// THE NIGHT-FILL - one tick of the worker's `night-fill` timer (spark scout-vision S6; bound in
// lib/producers/nightFill.ts). The seat opens a night with an `until`, launches its first wave, writes the rest
// as a plan (./plan.ts) and ends its turn; this tick carries the night the rest of the way:
//
//   THE NIGHT     a scout-root night that is open, has an `until` and a plan file. A night closed by the seat is
//                 not touched again. Of several, the newest by startedAt is filled.
//   ITS UNTIL     once passed, the night's queued items become `expired` ("the night's until passed") and the
//                 night is closed by the same close `close <id> --stop deadline` runs (./acts.ts closeAct).
//   THE BAND      a launch only while the last 15 minutes of load samples (./load.ts recentLoad, the reading
//                 `status` prints) average under the band's low on every resource the samples read. No samples is
//                 no launch: an unread box is not an idle one.
//   THE LANE      the oldest queued item whose every lane (./planDoors.ts) holds no queued, planned or running
//                 job - a busy lane does not block an item behind it on another lane.
//   ONE LAUNCH    a tick, through the item's door in the night's own mode (a dry night dry, a live one live - the
//                 shell's GRAVITONE_DRY_ONLY still refuses a live one), detached, the actor naming the timer. A
//                 Refusal (a cap, the money, a kept idea no longer kept) is `refused`; any other throw `failed`;
//                 neither is retried.

export const NIGHT_FILL_ACTOR: Actor = { kind: "machine", id: "night-fill" };
export const NIGHT_FILL_WINDOW_MIN = 15;
export const EXPIRED_REASON = "the night's until passed";

export type NightFillOptions = {
  readonly store: Store;
  readonly location: string;
  readonly now: Date;
  readonly dryOnly: boolean;
  readonly doors: PlanDoors;
  readonly say?: (line: string) => void;
};

/** What one tick did, for the roster's line. */
export type NightFillOutcome =
  | { readonly kind: "idle"; readonly why: string; readonly night?: NightId }
  | { readonly kind: "closed"; readonly night: NightId; readonly expired: number }
  | { readonly kind: "launched" | "refused" | "failed"; readonly night: NightId; readonly item: string; readonly jobId?: string; readonly reason?: string };

/** Under the band: every resource the window's samples read averages below its low. Undefined when it is; the reason otherwise. */
export function overBand(l: RecentLoad): string | undefined {
  if (l.samples === 0) return `no load samples in the last ${l.minutes} min`;
  const read = (["cpu", "ram", "gpu"] as const).filter((k) => l.avg[k] !== undefined);
  if (read.length === 0) return `no resource read in the last ${l.minutes} min`;
  const high = read.filter((k) => (l.avg[k] ?? 0) >= l.band.low);
  if (high.length === 0) return undefined;
  return `the box is at the band: ${high.map((k) => `${k} ${Math.round((l.avg[k] ?? 0) * 100)}%`).join(" · ")} over ${l.minutes} min (low ${Math.round(l.band.low * 100)}%)`;
}

/** Jobs on `lane` the kernel still has to run or is running. */
export function laneLoad(r: Reader, lane: ResourceLane): number {
  const v = r.get("SELECT count(*) AS c FROM jobs WHERE lane = ? AND state IN ('queued', 'planned', 'running')", lane)?.["c"];
  return typeof v === "number" ? v : 0;
}

/** The open scout nights with an until and a plan, newest first. */
async function plannedNights(): Promise<Night[]> {
  const out: Night[] = [];
  for (const s of await listNights()) {
    if (s.state !== "open") continue;
    const n = await readNight(s.id).catch(() => undefined);
    if (n === undefined || n.state !== "open" || n.deadline === undefined) continue;
    if (await hasPlan(n.id)) out.push(n);
  }
  return out;
}

/** Expire what is still queued and close the night as `close --stop deadline` does. */
async function closeAtUntil(o: NightFillOptions, n: Night): Promise<NightFillOutcome> {
  const at = o.now.toISOString();
  let expired = 0;
  await mutatePlan(n.id, (items) => {
    const queued = items.filter((x) => x.state === "queued");
    expired = queued.length;
    return queued.reduce<readonly PlanItem[]>((acc, x) => settleItem(acc, x.id, { state: "expired", at, reason: EXPIRED_REASON }), items);
  });
  await closeAct({ store: o.store, now: () => o.now }, n.id, "deadline");
  o.say?.(`night ${n.id} closed at its until ${n.deadline ?? ""}: ${expired} plan item(s) expired`);
  return { kind: "closed", night: n.id, expired };
}

/** One tick. Never throws for a launch's sake: a door's throw is the item's state. */
export async function nightFillTick(o: NightFillOptions): Promise<NightFillOutcome> {
  return withWing("scout", async () => {
    const nights = await plannedNights();
    const nowMs = o.now.getTime();
    const passed = nights.filter((n) => Date.parse(n.deadline ?? "") <= nowMs);
    // Every night whose until has passed is closed, oldest first; the newest is the tick's report.
    let closed: NightFillOutcome | undefined;
    for (const n of [...passed].reverse()) closed = await closeAtUntil(o, n);
    const night = nights.find((n) => Date.parse(n.deadline ?? "") > nowMs);
    if (night === undefined) return closed ?? { kind: "idle", why: "no open night with an until and a plan" };

    const queued = (await readPlan(night.id)).filter((x) => x.state === "queued");
    if (queued.length === 0) return { kind: "idle", why: "the plan has nothing queued", night: night.id };
    const over = overBand(recentLoad(o.store, nowMs, NIGHT_FILL_WINDOW_MIN));
    if (over !== undefined) return { kind: "idle", why: over, night: night.id };

    const busy = o.store.read((r) => {
      const seen = new Map<ResourceLane, boolean>();
      const isBusy = (lane: ResourceLane): boolean => {
        const b = seen.get(lane) ?? laneLoad(r, lane) > 0;
        seen.set(lane, b);
        return b;
      };
      return queued.find((x) => !o.doors[x.kind].lanes().some(isBusy));
    });
    if (!busy.ok) return { kind: "idle", why: `the queue did not read: ${busy.error.message}`, night: night.id };
    const item = busy.value;
    if (item === undefined) return { kind: "idle", why: `every queued item's lane is busy (${queued.length} queued)`, night: night.id };

    const ctx: ActContext = { store: o.store, location: o.location, actor: NIGHT_FILL_ACTOR, dryOnly: o.dryOnly, live: !night.dry, detach: true, say: (l) => o.say?.(`  ${l}`), now: () => o.now };
    let next: Pick<PlanItem, "state" | "at" | "jobId" | "reason">;
    try {
      const r = await o.doors[item.kind].launch(ctx, night.id, item);
      next = { state: "launched", at: o.now.toISOString(), ...(r.jobId === undefined ? {} : { jobId: r.jobId }) };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      next = { state: e instanceof Refusal ? "refused" : "failed", at: o.now.toISOString(), reason };
    }
    await mutatePlan(night.id, (items) => settleItem(items, item.id, next));
    o.say?.(`${night.id} ${item.id} ${item.kind} ${next.state}${next.jobId === undefined ? "" : ` as ${next.jobId}`}${next.reason === undefined ? "" : ` · ${next.reason}`}`);
    return { kind: next.state as "launched" | "refused" | "failed", night: night.id, item: item.id, ...(next.jobId === undefined ? {} : { jobId: next.jobId }), ...(next.reason === undefined ? {} : { reason: next.reason }) };
  });
}
