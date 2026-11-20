// THE REEL RETENTION SWEEP, BY HAND (spark reel-studio). The worker's `reel-archive` timer runs the same sweep
// hourly; this is for counting before it does, or for running it on a box with no worker.
//
//   npx tsx pipeline/reel-archive.mts [--dry] [--slug <slug>] [--now <ISO>] [--json]
//
// --dry writes nothing (no recipe, no deletion) and prints what is due. Without --dry it writes each reel's
// recipe.json + RECIPE.md, deletes what lib/reel/retention.ts says is due, and records it in reel.json.

import { parseArgs } from "node:util";

import { sweepReels } from "../lib/reel/archive.ts";

const { values } = parseArgs({ options: { dry: { type: "boolean" }, slug: { type: "string" }, now: { type: "string" }, json: { type: "boolean" } } });
const now = values.now === undefined ? new Date() : new Date(values.now);
if (Number.isNaN(now.getTime())) {
  process.stderr.write(`--now ${values.now ?? ""} is not a date\n`);
  process.exit(2);
}
const r = await sweepReels({ now, ...(values.dry === true ? { dry: true } : {}), ...(values.slug === undefined ? {} : { slug: values.slug }) });
if (values.json === true) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
else {
  const mb = (n: number): string => `${(n / 1e6).toFixed(1)} MB`;
  for (const s of r.swept) {
    if (s.error !== undefined) process.stdout.write(`${s.slug}: ${s.error}\n`);
    for (const f of s.deleted) process.stdout.write(`${s.slug}: ${r.dry ? "due" : "deleted"} ${f.file} ${mb(f.bytes)} (${f.rule})\n`);
    for (const f of s.missing) process.stdout.write(`${s.slug}: already gone ${f.file} (${f.rule})\n`);
  }
  process.stdout.write(`${r.dry ? "due" : "archived"}: ${r.files} file(s), ${mb(r.bytes)} over ${r.reels} reel(s)\n`);
}
process.exit(r.swept.some((s) => s.error !== undefined) ? 1 : 0);
