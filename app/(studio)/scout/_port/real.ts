import "server-only";

// THE REAL SIDE - the scout store on disk (nights, seed batches, the steer) through lib/foundry/scout/graph.ts
// buildGraph, one graph over the scout root and the muse archive, with effort read from the process's kernel store as the Board's real port opens it
// (lib/kernelStore.ts kernel()). Pause, resume and the split are steer.ts's own writers; each answers with the
// graph rebuilt after it, so the screen draws what the store now holds. A read that throws (a manifest
// mid-write, the store unopenable) answers with its own sentence, verbatim.
//
// The backlog (spark scout-vision) is the scout root's - the archive has no seeds and no storyboards - read inside
// that root's scope with the same readers the graph uses, and counted by backlog.ts backlogOf. A backlog that cannot
// be counted is left out of the view (the head draws no mark), never guessed; the graph still draws.
//
// The live ventures (spark scout-vision S2) are the kernel's heads (listVentures); none, and the view carries none.

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";
import { listVentures } from "@gt/kernel/ventures/store";

import { kernel } from "../../../../lib/kernelStore.ts";
import { backlogOf } from "../../../../lib/foundry/scout/backlog.ts";
import { buildGraph } from "../../../../lib/foundry/scout/graph.ts";
import { listSeedBatches } from "../../../../lib/foundry/scout/seedStore.ts";
import { pauseBranch, readSteer, resumeBranch, setSplit } from "../../../../lib/foundry/scout/steer.ts";
import { readAllNights } from "../../../../lib/foundry/scout/store.ts";
import type { Steer } from "../../../../lib/foundry/scout/types.ts";
import { withWing } from "../../../../lib/foundry/scout/wingScope.ts";
import type { ScoutBacklog, ScoutVenture, ScoutView } from "./contract.ts";
import type { ServerScout } from "./port.ts";

async function backlog(): Promise<ScoutBacklog | undefined> {
  const [nights, batches, steer] = await withWing("scout", () => Promise.all([readAllNights(), listSeedBatches(), readSteer()]));
  try {
    const b = backlogOf(nights, batches, steer);
    return { waiting: b.waiting.length, seedsWaiting: b.seedsWaiting, gated: b.gated, freshAllowed: b.freshAllowed };
  } catch {
    return undefined;
  }
}

/** The live ventures, for the filter (spark scout-vision S2); a read that fails leaves the filter out, never guesses. */
function ventures(store: Store): readonly ScoutVenture[] {
  const r = store.read((x) => listVentures(x));
  return r.ok ? r.value.filter((v) => v.retiredAt === undefined).map((v) => ({ id: v.id, name: v.name })) : [];
}

async function view(): Promise<Result<ScoutView>> {
  const k = kernel();
  if (!k.ok) return k;
  try {
    // Outside any scope the steer read is the scout root's: the only one with a split to edit.
    const [graph, steer, b] = await Promise.all([buildGraph({ store: k.value.store }), readSteer(), backlog()]);
    const vs = ventures(k.value.store);
    return ok({ graph, ...(steer.split === undefined ? {} : { split: steer.split }), ...(b === undefined ? {} : { backlog: b }), ...(vs.length === 0 ? {} : { ventures: vs }) });
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
