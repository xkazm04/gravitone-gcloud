// THE WORKER PROCESS (Phase 4): `npm run worker -- [--lanes a,b] [--once] [--json]`.
// workers/worker.ts holds the host and says why; this file binds it to the
// producers this checkout carries (lib/producers/registry.ts) and to the real
// process - its argv, its streams, its signals, its exit code.
import { producers } from "../lib/producers/registry.ts";
import { processSignals, runWorker } from "./worker.ts";

process.exitCode = await runWorker(process.argv.slice(2), producers(), {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
  env: process.env,
  onSignal: processSignals,
});
