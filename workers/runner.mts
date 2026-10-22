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
const { publishDeps, publishTimers } = await import("../lib/producers/publish.ts");
const { machineAdmission } = await import("../lib/resources/probe.ts");

process.exitCode = await runWorker(process.argv.slice(2), producers(), {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
  env: process.env,
  onSignal: processSignals,
  // The publish tick and the metrics refresh (Phase 6, L62), over the store the worker opened.
  timers: (store) => {
    const deps = publishDeps({ store });
    return deps.ok ? { ok: true, value: publishTimers(deps.value) } : deps;
  },
  // Engine work admitted by the box's measured load (spark game-3d-assets WP1); --no-admission skips it.
  admission: () => machineAdmission(),
});
