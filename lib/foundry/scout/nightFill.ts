import type { ResourceLane } from "@gt/domain/lane";
import type { Actor } from "@gt/domain/event";
import { laneHold } from "@gt/kernel/job-queue";
import type { Reader, Store } from "@gt/kernel/store";

import { closeAct, Refusal, type ActContext } from "./acts";
import { settleDeadNight } from "./deadNight";
import { bandResourcesOf, overBandOn } from "./laneBand";
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
//                 not touched again. (An open night past its until with NO plan is closed too, see A DEAD NIGHT.) Of several, the newest by startedAt is filled.
//   ITS UNTIL     once passed, the night's queued items become `expired` ("the night's until passed") and the
//                 night is closed by the same close `close <id> --stop deadline` runs (./acts.ts closeAct).
//   THE BAND      a launch only while the last 15 minutes of load samples (./load.ts recentLoad, the reading
//                 `status` prints) average under the band's low on every resource the ITEM'S LANES load
//                 (./laneBand.ts: a draft is judged on cpu and ram, Flux on all three, a cloud lane on none).
//                 No samples is no launch of an item that loads the box: an unread box is not an idle one.
//   THE LANE      the oldest queued item whose every lane (./planDoors.ts) holds no queued, planned or running
//                 job and no kernel hold (an interrupted paid job: laneHold) - a busy or held lane does not block an
//                 item behind it on another lane, and when nothing else can go the idle reason names the hold. The
//                 tick never clears a hold.
//   A DEAD NIGHT  open, past its until, no plan: closed as the deadline closes it, its stranded pending candidates
//                 failed first where their jobs are provably gone (./deadNight.ts).
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

/** Under the band on every resource the samples read: the whole box, the judgement of an item whose lanes are unknown. */
export function overBand(l: RecentLoad): string | undefined {
  return overBandOn(l, ["cpu", "ram", "gpu"]);
}

/** Jobs on `lane` the kernel still has to run or is running. */
export function laneLoad(r: Reader, lane: ResourceLane): number {
  const v = r.get("SELECT count(*) AS c FROM jobs WHERE lane = ? AND state IN ('queued', 'planned', 'running')", lane)?.["c"];
  return typeof v === "number" ? v : 0;
}

/** The open scout nights with an until, newest first, each with whether it holds a plan. */
async function openNights(): Promise<{ readonly night: Night; readonly planned: boolean }[]> {
  const out: { night: Night; planned: boolean }[] = [];
  for (const s of await listNights()) {
    if (s.state !== "open") continue;
    const n = await readNight(s.id).catch(() => undefined);
    if (n === undefined || n.state !== "open" || n.deadline === undefined) continue;
    out.push({ night: n, planned: await hasPlan(n.id) });
  }
  return out;
}

/** The lane's hold as a sentence for the idle reason. The tick never clears one: a paid step may have died unbooked. */
function holdLine(lane: ResourceLane, h: { readonly jobId: string; readonly stage?: string; readonly at: string }): string {
  return `lane ${lane} is held by interrupted job ${h.jobId}${h.stage === undefined ? "" : ` at ${h.stage}`} since ${h.at}: a paid step may have died unbooked, look before releasing it`;
}

/** Close a night that died without a plan as the deadline does: its stranded candidates are settled first. */
async function closeDead(o: NightFillOptions, n: Night): Promise<NightFillOutcome> {
  const settled = await settleDeadNight(o.store, n);
  await closeAct({ store: o.store, now: () => o.now }, n.id, "deadline");
  o.say?.(`night ${n.id} had no plan and passed its until ${n.deadline ?? ""}: closed; ${settled.failed.length} pending candidate(s) failed${settled.left.length === 0 ? "" : `; left: ${settled.left.join("; ")}`}`);
  return { kind: "closed", night: n.id, expired: 0 };
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
    const open = await openNights();
    const nowMs = o.now.getTime();
    const past = (n: Night): boolean => Date.parse(n.deadline ?? "") <= nowMs;
    // Every night whose until has passed is closed, oldest first, planned or not; the newest is the tick's report.
    let closed: NightFillOutcome | undefined;
    for (const x of open.filter((y) => past(y.night)).reverse()) closed = x.planned ? await closeAtUntil(o, x.night) : await closeDead(o, x.night);
    const night = open.find((x) => x.planned && !past(x.night))?.night;
    if (night === undefined) return closed ?? { kind: "idle", why: "no open night with an until and a plan" };

    const queued = (await readPlan(night.id)).filter((x) => x.state === "queued");
    if (queued.length === 0) return { kind: "idle", why: "the plan has nothing queued", night: night.id };
    const load = recentLoad(o.store, nowMs, NIGHT_FILL_WINDOW_MIN);

    // First fit, as before: the oldest item whose lanes are free AND whose own lanes' resources are under the band.
    let held: string | undefined;
    let hold: string | undefined;
    const busy = o.store.read((r) => {
      const seen = new Map<ResourceLane, boolean>();
      const isBusy = (lane: ResourceLane): boolean => {
        const h = laneHold(r, lane);
        if (h !== undefined) hold ??= holdLine(lane, h);
        const b = seen.get(lane) ?? (h !== undefined || laneLoad(r, lane) > 0);
        seen.set(lane, b);
        return b;
      };
      return queued.filter((x) => {
        const lanes = o.doors[x.kind].lanes();
        if (lanes.some(isBusy)) return false;
        const over = overBandOn(load, bandResourcesOf(lanes));
        if (over !== undefined) held ??= over;
        return over === undefined;
      });
    });
    if (!busy.ok) return { kind: "idle", why: `the queue did not read: ${busy.error.message}`, night: night.id };
    const eligible = busy.value;
    if (eligible.length === 0 && hold !== undefined) return { kind: "idle", why: hold, night: night.id };
    if (eligible.length === 0 && held !== undefined) return { kind: "idle", why: held, night: night.id };
    if (eligible.length === 0) return { kind: "idle", why: `every queued item's lane is busy (${queued.length} queued)`, night: night.id };

    const ctx: ActContext = { store: o.store, location: o.location, actor: NIGHT_FILL_ACTOR, dryOnly: o.dryOnly, live: !night.dry, detach: true, say: (l) => o.say?.(`  ${l}`), now: () => o.now };
    const item = eligible[0];
    if (item === undefined) return { kind: "idle", why: `every queued item's lane is busy (${queued.length} queued)`, night: night.id };
    let next: Pick<PlanItem, "state" | "at" | "jobId" | "reason">;
    try {
      const r = await o.doors[item.kind].launch(ctx, night.id, item);
      next = { state: "launched", at: o.now.toISOString(), ...(r.jobId === undefined ? {} : { jobId: r.jobId }) };
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      next = { state: e instanceof Refusal ? "refused" : "failed", at: o.now.toISOString(), reason };
    }
    const settled = next;
    await mutatePlan(night.id, (items) => settleItem(items, item.id, settled));
    o.say?.(`${night.id} ${item.id} ${item.kind} ${next.state}${next.jobId === undefined ? "" : ` as ${next.jobId}`}${next.reason === undefined ? "" : ` · ${next.reason}`}`);
    return { kind: next.state as "launched" | "refused" | "failed", night: night.id, item: item.id, ...(next.jobId === undefined ? {} : { jobId: next.jobId }), ...(next.reason === undefined ? {} : { reason: next.reason }) };
  });
}
