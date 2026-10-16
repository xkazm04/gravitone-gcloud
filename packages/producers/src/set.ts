import { err, ok, type Result } from "@gt/domain/errors";
import { producerNameSchema, type ProducerName } from "@gt/domain/run";
import type { Producer } from "@gt/kernel/job-core";
import { producerKey, type ProducerKey } from "@gt/kernel/job-queue-core";

// THE SET A WORKER RUNS (Phase 4, plan §4 `@gt/producers`). Each producer in this
// package is a pure definition over ports; `lib/producers/<name>.ts` binds the ports
// to v1's engines, and a worker, a CLI or a route hands the bound definitions to
// kernel `workLoop` as one map keyed by `<name>@<lane>` (job-queue-core `producerKey`).
// The map is built here, once, so the two ways it can be wrong are refused before a
// job is claimed rather than discovered by one: a name the domain does not know (a job
// could never name it), and the same name bound twice ON ONE LANE (the second silently
// wins in a plain Map).
//
// ONE NAME, SEVERAL LANES (L41). A part's option decides its lane - research on the
// text seat or on Gemini, frames on the card or on Nano Banana - and the job carries
// the lane it was launched on. Keyed by name alone, a worker could bind a step producer
// on one lane only, and every part whose option chose another sat queued behind a head
// the worker "carried" and runJob then refused. The key is the lane the producer
// declares (`Producer.lane`), never a second copy of it beside the binding.

export type Bound = { readonly name: ProducerName; readonly producer: Producer };

export function producerSet(bound: readonly Bound[]): Result<ReadonlyMap<ProducerKey, Producer>> {
  const out = new Map<ProducerKey, Producer>();
  for (const b of bound) {
    const name = producerNameSchema.safeParse(b.name);
    if (!name.success) return err("invalid", `producers: "${String(b.name)}" is not a producer the domain names`);
    const key = producerKey(name.data, b.producer.lane);
    if (out.has(key)) return err("invalid", `producers: ${name.data} is bound twice on ${b.producer.lane}`);
    out.set(key, b.producer);
  }
  return ok(out);
}
