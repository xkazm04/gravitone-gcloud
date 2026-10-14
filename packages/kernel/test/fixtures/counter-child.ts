// One of the two processes in store.process.test.ts. It increments a shared
// counter N times, each a read-modify-write in its own transaction - the exact
// shape that lost updates in v1 before lib/diskTx.ts fenced it.
//
//   node counter-child.ts <db> <n>
import { openStore } from "../../src/store.ts";

const [file, times] = process.argv.slice(2);
if (file === undefined || times === undefined) {
  process.stderr.write("usage: counter-child.ts <db> <n>\n");
  process.exit(2);
}
const opened = openStore(file, { busyTimeoutMs: 30_000 });
if (!opened.ok) {
  process.stderr.write(`open: ${opened.error.message}\n`);
  process.exit(1);
}
const store = opened.value;
let failures = 0;
for (let i = 0; i < Number(times); i++) {
  const r = store.tx((t) => {
    const v = t.get("SELECT v FROM counter WHERE id = 1")?.["v"];
    t.run("UPDATE counter SET v = ? WHERE id = 1", (typeof v === "number" ? v : 0) + 1);
  });
  if (!r.ok) {
    failures++;
    process.stderr.write(`tx ${i}: ${r.error.code} ${r.error.message}\n`);
  }
}
store.close();
process.stdout.write(JSON.stringify({ failures }) + "\n");
process.exit(failures === 0 ? 0 : 1);
