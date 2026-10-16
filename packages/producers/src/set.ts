import { err, ok, type Result } from "@gt/domain/errors";
import { producerNameSchema, type ProducerName } from "@gt/domain/run";
import type { Producer } from "@gt/kernel/job-core";

// THE SET A WORKER RUNS (Phase 4, plan §4 `@gt/producers`). Each producer in this
// package is a pure definition over ports; `lib/producers/<name>.ts` binds the ports
// to v1's engines, and a worker, a CLI or a route hands the bound definitions to
// kernel `workLoop` as one map keyed by the job's `producer`. The map is built here,
// once, so the two ways it can be wrong are refused before a job is claimed rather
// than discovered by one: a name the domain does not know (a job could never name
// it), and the same name bound twice (the second silently wins in a plain Map).

export type Bound = { readonly name: ProducerName; readonly producer: Producer };

export function producerSet(bound: readonly Bound[]): Result<ReadonlyMap<ProducerName, Producer>> {
  const out = new Map<ProducerName, Producer>();
  for (const b of bound) {
    const name = producerNameSchema.safeParse(b.name);
    if (!name.success) return err("invalid", `producers: "${String(b.name)}" is not a producer the domain names`);
    if (out.has(name.data)) return err("invalid", `producers: ${name.data} is bound twice`);
    out.set(name.data, b.producer);
  }
  return ok(out);
}
