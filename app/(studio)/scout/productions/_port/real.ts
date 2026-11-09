import "server-only";

// THE REAL SIDE - the kernel's production record (lib/producers/production.ts and @gt/kernel/productions/store), and
// the concepts that can Start from Scout's own files (lib/foundry/scout/concepts.ts). A stage is read from the record,
// never inferred from a night. A concept with a production no longer offers Start.
//
// The later-stage panels keep drawing the scripted slate until S2-S6 (`scripted` on the view).

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { listProductions } from "@gt/kernel/productions/store";

import { keptConcepts } from "../../../../../lib/foundry/scout/concepts.ts";
import { blobRoute } from "../../../../../lib/library/media.ts";
import { jobOfTake, markProven, moveProduction, requestTake, startProduction } from "../../../../../lib/producers/production.ts";
import { kernel } from "../../../../../lib/kernelStore.ts";
import type { Production, ProductionId } from "@gt/domain/production";

import type { KeptConcept, ProductionEntry, ProductionFrame, ProductionsView, TakeLaunchView, TakeProgress, TakeRequestInput } from "./contract.ts";
import { fixtureProductions } from "./fixture.ts";
import type { ServerProductions } from "./port.ts";

const served = (sha: string, mime: string): string => blobRoute(sha, mime) ?? `/api/blob/${sha}`;

function framesOf(p: Production): readonly ProductionFrame[] {
  return p.board.panels.map((x) => ({ id: x.id, beat: x.beat, prompt: x.prompt, src: served(x.still.sha256, x.still.mime) }));
}

function entryOf(p: Production, store: Parameters<typeof jobOfTake>[0]): ProductionEntry {
  const frames = framesOf(p);
  const progress: Record<string, TakeProgress> = {};
  for (const t of p.takes) {
    if (t.state !== "rendering" || t.jobId === undefined) continue;
    const job = jobOfTake(store, t.jobId);
    if (job !== undefined) progress[t.id] = { jobState: job.state, done: job.progress.done, total: job.progress.total, ...(job.progress.stage === undefined ? {} : { step: job.progress.stage }) };
  }
  const first = frames[0];
  return { production: p, logline: p.board.logline, ...(first === undefined ? {} : { poster: first.src }), frames, progress, rounds: [], lessons: [] };
}

/** The screen's whole view: the record's productions, the concepts still to start, and the scripted panels. */
export async function realView(): Promise<Result<ProductionsView>> {
  const k = kernel();
  if (!k.ok) return k;
  const store = k.value.store;
  try {
    const productions = store.read((r) => listProductions(r));
    if (!productions.ok) return productions;
    const started = new Set(productions.value.map((p) => `${p.source.kind}:${p.source.ref}`));
    const kept: readonly KeptConcept[] = (await keptConcepts()).filter((c) => !started.has(`${c.source.kind}:${c.source.ref}`));
    const script = fixtureProductions();
    const scripted = script.ok ? script.value.scripted : undefined;
    return ok({ entries: productions.value.map((p) => entryOf(p, store)), kept, ventures: [], ...(scripted === undefined ? {} : { scripted }) });
  } catch (e) {
    return err("unavailable", errorMessage(e));
  }
}

async function view(): Promise<Result<ProductionsView>> {
  return realView();
}

async function then<T>(r: Result<T>): Promise<Result<ProductionsView>> {
  if (!r.ok) return r;
  return view();
}

export const realProductions: ServerProductions = {
  view,
  start: async (source, who) => then(await startProduction({ source, by: who.id })),
  launch: async (input: TakeRequestInput, who: Actor) => {
    const r = await requestTake({ id: input.id, kind: input.kind, frames: input.frames, ...(input.prompt === undefined ? {} : { prompt: input.prompt }), mode: input.mode, by: who.id, actor: who, ...(input.token === undefined ? {} : { token: input.token }), dryOnly: dryOnlyFrom(process.env) });
    if (!r.ok) return r;
    const v = await view();
    if (!v.ok) return v;
    const launch: TakeLaunchView["launch"] = r.value.kind === "launched" ? { kind: "launched", jobId: r.value.jobId, takeId: r.value.takeId } : r.value.kind === "stale" ? { kind: "stale", receipt: r.value.fresh } : { kind: "receipt", receipt: r.value.receipt };
    return ok({ view: v.value, launch });
  },
  proven: async (id: ProductionId, takeId: string, who: Actor) => then(await markProven({ id, takeId, by: who.id, actor: who.kind })),
  drop: async (id: ProductionId, who: Actor) => then(await moveProduction({ id, to: "dropped", by: who.id, actor: who.kind })),
  move: async (id, to, who) => then(await moveProduction({ id, to, by: who.id, actor: who.kind })),
};
