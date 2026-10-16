// THE WORKER PROCESS (Phase 4): `npm run worker -- [--lanes a,b] [--once] [--json]`.
// workers/worker.ts holds the host and says why; this file binds it to the
// producers this checkout carries (lib/producers/registry.ts) and to the real
// process - its argv, its streams, its signals, its exit code.
// The hooks first: lib/producers binds v1 engines written for a bundler, so the
// registry is imported only after they are registered (a static import would resolve
// before any module body runs).
import "../pipeline/lib-hooks.mts";

import { processSignals, runWorker } from "./worker.ts";

const { producers } = await import("../lib/producers/registry.ts");

process.exitCode = await runWorker(process.argv.slice(2), producers(), {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
  env: process.env,
  onSignal: processSignals,
});
