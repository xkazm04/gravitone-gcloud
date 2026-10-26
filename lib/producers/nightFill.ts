import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { storeLocation } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { NIGHT_FILL } from "@gt/producers/publish/timers";

import type { TimerEntry, Worked } from "../../workers/timers.ts";
import { OUT_DIRNAME } from "../fixtures/mode.ts";
import { nightFillTick, type NightFillOutcome } from "../foundry/scout/nightFill.ts";
import { planDoors, type PlanDoors } from "../foundry/scout/planDoors.ts";

// THE NIGHT-FILL, BOUND TO THIS WORKER (spark scout-vision S6): the worker's `night-fill` timer. Every five minutes
// it runs one tick of lib/foundry/scout/nightFill.ts over the store the worker opened - at most one plan item
// launched, or the night closed at its until. The shell's GRAVITONE_DRY_ONLY is read once, here, as every act
// reads it: a live night under a dry-only worker has its item refused with the act's own sentence.
//
// A TICK THAT THROWS (an unreadable night or plan, a store that will not open a transaction) returns its error,
// which the roster records as a failure and backs off; a door's throw never reaches here - it is the item's state.

export type NightFillTimerOptions = {
  readonly store: Store;
  /** The path the store was opened at: a launch carries it (the worker's own, by default). */
  readonly location?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** A test's doors; production binds planDoors() each tick, with the tick's stop. */
  readonly doors?: PlanDoors;
};

const counted = (o: NightFillOutcome): Worked => {
  if (o.kind === "idle") return { count: 0, what: "plan item(s) launched", detail: { idle: o.why, ...(o.night === undefined ? {} : { night: o.night }) } };
  if (o.kind === "closed") return { count: 0, what: "plan item(s) launched", detail: { night: o.night, closed: "deadline", expired: o.expired } };
  return { count: o.kind === "launched" ? 1 : 0, what: "plan item(s) launched", detail: { night: o.night, item: o.item, state: o.kind, ...(o.jobId === undefined ? {} : { jobId: o.jobId }), ...(o.reason === undefined ? {} : { reason: o.reason }) } };
};

export function nightFillTimer(o: NightFillTimerOptions): TimerEntry {
  const env = o.env ?? process.env;
  const location = o.location ?? storeLocation(OUT_DIRNAME, env["GRAVITONE_STORE_PATH"]);
  const dryOnly = dryOnlyFrom(env);
  return {
    spec: NIGHT_FILL,
    async tick(ctx): Promise<Result<Worked>> {
      try {
        const out = await nightFillTick({ store: o.store, location, now: ctx.now, dryOnly, doors: o.doors ?? planDoors({ signal: ctx.signal }) });
        return ok(counted(out));
      } catch (e) {
        return err("unavailable", `the night-fill tick failed: ${errorMessage(e)}`);
      }
    },
  };
}
