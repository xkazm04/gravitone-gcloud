import type { Result } from "@gt/domain/errors";
import type { ProducerName } from "@gt/domain/run";
import type { Producer } from "@gt/kernel/job-core";
import { producerSet, type Bound } from "@gt/producers/set";

import { articleProducer } from "./article.ts";
import { extractProducer } from "./extract.ts";
import { mvProducer } from "./mv.ts";
import { sunoProducer } from "./suno.ts";
import { sunoDriver } from "../sound/suno/drivers.ts";

// THE PRODUCERS THIS CHECKOUT CAN RUN (Phase 4, plan §4). One list, read by every
// process that drives a job - the worker (workers/runner.mts), a producer's CLI, a
// route - so "which producers exist" has one answer and the worker can never be
// missing a producer the CLI runs. Each producer lot binds its definition's ports
// to v1's engines in `lib/producers/<name>.ts` and adds ONE line here:
//
//   { name: "extract", producer: extractProducer() },
//
// The list is plain data on purpose: `producerSet` (packages/producers/src/set.ts)
// is where a name the domain does not know, or a name bound twice, is refused -
// at start, before a job is claimed, never by the job that would have hit it.
// A head job naming a producer that is absent here is reported by `workLoop`
// (`unknown`) and left queued: a missing binding parks work, it does not fail it.

export const BOUND: readonly Bound[] = [
  { name: "extract", producer: extractProducer() },
  { name: "article", producer: articleProducer() },
  { name: "mv", producer: mvProducer() },
  { name: "suno", producer: sunoProducer({ driver: sunoDriver() }) },
];

/** The map a worker hands kernel `workLoop`, keyed by the job's `producer`. */
export function producers(): Result<ReadonlyMap<ProducerName, Producer>> {
  return producerSet(BOUND);
}
