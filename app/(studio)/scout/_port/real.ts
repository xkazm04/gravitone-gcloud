import "server-only";

// THE REAL SIDE - the scout store on disk (nights, seed batches, the steer) through lib/foundry/scout/graph.ts
// buildGraphs, one graph per wing's root, with effort read from the process's kernel store as the Board's real port opens it
// (lib/kernelStore.ts kernel()). Pause, resume and the split are steer.ts's own writers; each answers with the
// graph rebuilt after it, so the screen draws what the store now holds. A read that throws (a manifest
// mid-write, the store unopenable) answers with its own sentence, verbatim.

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";

import { kernel } from "../../../../lib/kernelStore.ts";
import { buildGraphs } from "../../../../lib/foundry/scout/graph.ts";
import { pauseBranch, readSteer, resumeBranch, setSplit } from "../../../../lib/foundry/scout/steer.ts";
import type { Steer } from "../../../../lib/foundry/scout/types.ts";
import type { ScoutView } from "./contract.ts";
import type { ServerScout } from "./port.ts";

async function view(): Promise<Result<ScoutView>> {
  const k = kernel();
  if (!k.ok) return k;
  try {
    // Outside any wing's scope the steer read is the scout wing's: the only one with a split to edit.
    const [graphs, steer] = await Promise.all([buildGraphs({ store: k.value.store }), readSteer()]);
    return ok({ graphs, ...(steer.split === undefined ? {} : { split: steer.split }) });
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

async function then(write: Promise<Result<Steer>>): Promise<Result<ScoutView>> {
  try {
    const r = await write;
    return r.ok ? view() : r;
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

export const realScout: ServerScout = {
  view,
  pause: (ref, by) => then(pauseBranch(ref, by)),
  resume: (ref, by) => then(resumeBranch(ref, by)),
  split: (split, by) => then(setSplit(split, by)),
};
