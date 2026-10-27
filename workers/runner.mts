// THE WORKER PROCESS (Phase 4): `npm run worker -- [--lanes a,b] [--once] [--json]`.
// workers/worker.ts holds the host and says why; this file binds it to the
// producers this checkout carries (lib/producers/registry.ts) and to the real
// process - its argv, its streams, its signals, its exit code.
// The hooks first: lib/producers binds v1 engines written for a bundler, so the
// registry is imported only after they are registered (a static import would resolve
// before any module body runs).
import "../pipeline/lib-hooks.mts";

import path from "node:path";

import { loadEnvFiles } from "../lib/envFile.ts";

// The env files next, before any module that reads the environment is even evaluated - which is why
// the host itself is imported dynamically below. Started at logon (pipeline/worker-service.ps1) this
// process inherits no shell's exports, and a worker without the repo's keys fails every vendor drive
// as unauthenticated. An exported value still wins; the names read are said, never the values.
const ROOT = path.resolve(import.meta.dirname, "..");
const read = loadEnvFiles(ROOT);
if (read.length > 0) process.stderr.write(`[worker] env: ${read.length} name(s) from .env/.env.local: ${read.join(", ")}\n`);

const { processSignals, runWorker } = await import("./worker.ts");
const { producers } = await import("../lib/producers/registry.ts");
const { publishDeps, publishTimers } = await import("../lib/producers/publish.ts");
const { loadSampleTimer } = await import("../lib/producers/loadSample.ts");
const { machineAdmission } = await import("../lib/resources/probe.ts");

process.exitCode = await runWorker(process.argv.slice(2), producers(), {
  out: (line) => void process.stdout.write(`${line}\n`),
  err: (line) => void process.stderr.write(`${line}\n`),
  env: process.env,
  onSignal: processSignals,
  // The publish tick and the metrics refresh (Phase 6, L62), and the box's load a minute at a time
  // (spark night-load-band), over the store the worker opened.
  timers: (store) => {
    const deps = publishDeps({ store });
    return deps.ok ? { ok: true, value: [...publishTimers(deps.value), loadSampleTimer({ store })] } : deps;
  },
  // Engine work admitted by the box's measured load (spark game-3d-assets WP1); --no-admission skips it.
  admission: () => machineAdmission(),
});
