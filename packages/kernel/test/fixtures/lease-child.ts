// The Node side of lease.mixed.test.ts (py/lease_contend.py is the Python side).
// Takes one lease N times; under each grant it writes `enter`, holds briefly,
// writes `exit` - both FENCED - then releases. Overlapping holders would show
// as two enters in a row in `lease_probe`.
//
//   node lease-child.ts <db> <resource> <rounds> <name>
import { blobStore } from "../../src/blob.ts";
import { liveEffects } from "../../src/effects.ts";
import { acquire, assertFence, releaseIn } from "../../src/lease.ts";
import { openStore } from "../../src/store.ts";

const [file, resource, rounds, name] = process.argv.slice(2);
if (file === undefined || resource === undefined || rounds === undefined || name === undefined) {
  process.stderr.write("usage: lease-child.ts <db> <resource> <rounds> <name>\n");
  process.exit(2);
}
const opened = openStore(file, { busyTimeoutMs: 30_000 });
if (!opened.ok) {
  process.stderr.write(`open: ${opened.error.message}\n`);
  process.exit(1);
}
const store = opened.value;
const fx = liveEffects(store, blobStore(`${file}.blobs`));
const hold = (n: number) => new Promise<void>((r) => setTimeout(r, n));

function fail(what: string, message: string): never {
  process.stderr.write(`${name} ${what}: ${message}\n`);
  store.close();
  process.exit(1);
}

for (let i = 0; i < Number(rounds); i++) {
  const got = await acquire(fx, resource, { waitMs: 60_000, pollMs: 3, ttlS: 30 });
  if (!got.ok) fail("acquire", got.error.message);
  const fence = got.value.fence;
  const probe = (phase: string) =>
    store.tx((t) => {
      assertFence(t, resource, fence);
      t.run("INSERT INTO lease_probe (who, fence, phase) VALUES (?, ?, ?)", name, fence, phase);
    });
  const enter = probe("enter");
  if (!enter.ok) fail("enter", enter.error.message);
  await hold(4);
  const exit = probe("exit");
  if (!exit.ok) fail("exit", exit.error.message);
  const rel = store.tx((t) => releaseIn(t, resource, fence));
  if (!rel.ok || !rel.value) fail("release", rel.ok ? "not held" : rel.error.message);
}
store.close();
process.stdout.write(JSON.stringify({ name, rounds: Number(rounds) }) + "\n");
