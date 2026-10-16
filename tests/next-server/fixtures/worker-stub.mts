// The worker process with a STUB producer bound, for tests/next-server/worker.test.ts:
// workers/runner.mts binds lib/producers/registry.ts, which carries the producers
// this checkout has (none yet in wave B); this entry binds one the test controls
// and is otherwise the same host, argv, streams and exit code.
//
//   node tests/next-server/fixtures/worker-stub.mts [worker flags]
//
// The stub is `research` on seat.text: two steps, each booked with the job's id;
// a job whose id contains "fail" fails its second step fatally.
import { producerSet } from "@gt/producers/set";
import type { Producer } from "@gt/kernel/job-core";

import { processSignals, runWorker } from "../../../workers/worker.ts";

const stub: Producer = {
  lane: "seat.text",
  plan: (_job, outputs) => ["outline", "draft"].filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0 } })),
  perform: async (step, ctx) =>
    step.name === "draft" && ctx.job.id.includes("fail")
      ? { kind: "fatal", code: "invalid", message: `the stub refuses ${ctx.job.id}` }
      : { kind: "produced", output: { step: step.name, job: ctx.job.id } },
};

process.exitCode = await runWorker(process.argv.slice(2), producerSet([{ name: "research", producer: stub }]), {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
  env: process.env,
  onSignal: processSignals,
});
