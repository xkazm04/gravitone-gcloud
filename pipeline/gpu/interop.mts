// Node side of pipeline/gpu/selftest.py case 4 (Python <-> Node on one lease directory).
//
//   tsx pipeline/gpu/interop.mts hold <tenant> <engine>   acquire, print "held", wait for "release" on stdin
//   tsx pipeline/gpu/interop.mts crash <tenant> <engine>  acquire, print "held", then die WITHOUT releasing
//   tsx pipeline/gpu/interop.mts try  <tenant> <engine>   one try; print "granted" or "blocked <holder>"
//
// GRAVITONE_STORE_PATH names the shared kernel store (the lease is gpu.local#1 there since
// Phase 4, L27). Not part of the app: a test fixture.
import { createInterface } from "node:readline";

import { GpuBroker, LeaseTimeout, type GpuEngine } from "../../lib/gpu/lease";

const [mode, tenant, engine] = process.argv.slice(2);
const broker = new GpuBroker();

if (mode === "hold") {
  const handle = await broker.acquire({ tenant, engine: engine as GpuEngine, vramGb: 20 });
  console.log("held");
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (line.trim() === "release") break;
  }
  rl.close();
  await handle.release();
  process.exit(0);
} else if (mode === "crash") {
  // A holder whose process vanishes: the lease stays on disk with a dead pid.
  await broker.acquire({ tenant, engine: engine as GpuEngine, vramGb: 20 });
  console.log("held");
  process.exit(1);
} else if (mode === "try") {
  try {
    const handle = await broker.acquire({ tenant, engine: engine as GpuEngine, vramGb: 20 });
    console.log("granted");
    await handle.release();
  } catch (e) {
    if (!(e instanceof LeaseTimeout)) throw e;
    console.log(`blocked ${e.holder?.tenant ?? "?"}`);
  }
} else {
  console.error("usage: interop.mts hold|try <tenant> <engine>");
  process.exit(2);
}
