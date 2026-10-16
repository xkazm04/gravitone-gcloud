// The child side of job.kill.test.ts: a real process that drives one job and
// blocks inside a step, so the parent can kill it with no chance to clean up.
// Every perform is appended to a log file BEFORE the step does anything, so
// the count survives the kill.
//
//   node job-kill-child.ts <db> <jobId> <lane> <log> <block-at-step>
import { appendFileSync } from "node:fs";
import { parseAt } from "@gt/domain/door";
import { resourceLaneSchema } from "@gt/domain/lane";
import { blobStore } from "../../src/blob.ts";
import { liveEffects } from "../../src/effects.ts";
import type { Producer } from "../../src/job-core.ts";
import { runJob } from "../../src/job-run.ts";
import { openStore } from "../../src/store.ts";

const [file, jobId, laneArg, log, blockAt] = process.argv.slice(2);
if (file === undefined || jobId === undefined || laneArg === undefined || log === undefined || blockAt === undefined) {
  process.stderr.write("usage: job-kill-child.ts <db> <jobId> <lane> <log> <block-at-step>\n");
  process.exit(2);
}
const laneOk = parseAt("lane", resourceLaneSchema, laneArg);
if (!laneOk.ok) {
  process.stderr.write(`lane: ${laneOk.error.message}\n`);
  process.exit(2);
}
const lane = laneOk.value;
const opened = openStore(file, { busyTimeoutMs: 30_000 });
if (!opened.ok) {
  process.stderr.write(`open: ${opened.error.message}\n`);
  process.exit(1);
}
const store = opened.value;
const fx = liveEffects(store, blobStore(`${file}.blobs`));

const producer: Producer = {
  lane,
  plan: (_job, outputs) => ["a", "b", "c"].filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0.01 } })),
  perform: async (step) => {
    appendFileSync(log, `child ${step.name}\n`);
    if (step.name === blockAt) {
      process.stdout.write(`blocked ${step.name}\n`);
      // Blocks until the process is killed: the step is in flight, unbooked.
      await new Promise<never>(() => setInterval(() => {}, 60_000));
    }
    return { kind: "produced", output: { by: "child", step: step.name } };
  },
};

const r = await runJob(fx, producer, jobId, { heartbeatMs: 1_000 });
process.stdout.write(`finished ${JSON.stringify(r.ok ? r.value.outcome : r.error.message)}\n`);
store.close();
