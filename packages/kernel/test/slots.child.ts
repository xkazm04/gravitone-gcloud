// One of the processes in slots.process.test.ts: open the kernel at <db>, run <n> claiming
// sweeps as a tick would, print the ids it claimed (and any it judged interrupted) as one JSON
// line, and exit WITHOUT recording any outcome - its claims are left held by a process then gone.
//
//   node slots.child.ts <db> <n> <nowIso>
import { openKernel } from "../src/kernel.ts";
import { sweep } from "../src/slots/sweep.ts";

const [file, times, nowIso] = process.argv.slice(2);
if (file === undefined || times === undefined || nowIso === undefined) {
  process.stderr.write("usage: slots.child.ts <db> <n> <nowIso>\n");
  process.exit(2);
}
const now = Date.parse(nowIso);
const opened = openKernel(file, { busyTimeoutMs: 30_000, clock: () => new Date(now) });
if (!opened.ok) {
  process.stderr.write(`open: ${opened.error.message}\n`);
  process.exit(1);
}
const k = opened.value;
const claimed: string[] = [];
const interrupted: string[] = [];
let failures = 0;
for (let i = 0; i < Number(times); i++) {
  const r = sweep(k.store, { now, windowMs: 3_600_000, wired: new Set(["youtube"]), itemExists: () => true }, { claim: true });
  if (r.ok) {
    claimed.push(...r.value.claimed.map((c) => c.slot.id));
    interrupted.push(...r.value.interrupted);
  } else {
    failures++;
    process.stderr.write(`sweep ${i}: ${r.error.code} ${r.error.message}\n`);
  }
}
k.close();
process.stdout.write(`${JSON.stringify({ claimed, interrupted, failures, pid: process.pid })}\n`);
process.exit(failures === 0 ? 0 : 1);
