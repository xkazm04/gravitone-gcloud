import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";
import { REEL_ARCHIVE } from "@gt/producers/publish/timers";

import type { TimerEntry, Worked } from "../../workers/timers.ts";
import { sweepReels } from "../reel/archive.ts";

// THE REEL RETENTION SWEEP, BOUND TO THIS WORKER (spark reel-studio): the worker's `reel-archive` timer runs
// lib/reel/archive.ts `sweepReels` every hour over the store the worker opened (its publications start the final
// cut's 3-day clock). Nothing here spends; it deletes only what lib/reel/retention.ts says is due, after the recipe.
// A reel that cannot be read is that reel's error in the detail, never the whole tick's.

export type ReelArchiveTimerOptions = { readonly store: Store };

export function reelArchiveTimer(o: ReelArchiveTimerOptions): TimerEntry {
  return {
    spec: REEL_ARCHIVE,
    async tick(ctx): Promise<Result<Worked>> {
      try {
        const r = await sweepReels({ now: ctx.now, store: o.store });
        const errors = r.swept.filter((s) => s.error !== undefined).map((s) => `${s.slug}: ${s.error ?? ""}`);
        return ok({ count: r.files, what: "reel file(s) archived", detail: { reels: r.reels, bytes: r.bytes, ...(errors.length === 0 ? {} : { errors: errors.slice(0, 5).join(" | ") }) } });
      } catch (e) {
        return err("unavailable", `the reel archive sweep failed: ${errorMessage(e)}`);
      }
    },
  };
}
