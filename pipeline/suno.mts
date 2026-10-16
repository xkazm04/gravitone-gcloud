// SUNO — the headless surface of the Suno queue (lib/sound/suno, lib/producers/suno.ts).
// Its first queue CLI: v1 drove Suno only from the audio canvas's Queue column.
//
//   npx tsx pipeline/suno.mts status
//   npx tsx pipeline/suno.mts enqueue <proposalId> [<proposalId>...]
//   npx tsx pipeline/suno.mts cancel <jobId>
//   npx tsx pipeline/suno.mts start (--yes | --dry) [--budget-usd X] [--detach]
//
//   status   the proposals' jobs with their kernel jobs' running state, the
//            driver's health, and the box.chrome hold if a crash left one. A
//            READ: it starts nothing.
//   enqueue  a record per proposal, queued - it NEVER spends, whatever the
//            column's switch says. A proposal that has rendered is refused
//            ("riff it"); one already queued returns its live job.
//   cancel   a waiting job (record and kernel job). One that is creating is
//            refused: its credits are already spent.
//   start    the waiting records LAUNCHED as kernel jobs on box.chrome (a
//            receipt, confirmed by --yes), then every queued Suno job of that
//            mode driven on this process in queue order, unless --detach leaves
//            them to the worker. A held lane (a crash may have spent credits)
//            stops the drive with the hold's sentence: look at the Suno
//            library, then press Start on the canvas (it acknowledges).
//
//   --dry         launch DRY jobs: each create is answered by its stand-in
//                 (lib/sound/suno/fakeDriver.ts standClipRefs) and booked as a
//                 would-call; the fake driver is bound so no browser is asked.
//   --budget-usd  the job ceiling. Suno credits are not dollars: each create is
//                 admitted under it and booked unpriced with its reason.
//   --json        one JSON document on stdout, progress on stderr.
//   Exit 0 ok · 1 a job failed, was refused, or the drive stopped short · 2 usage.
//
// IT OWNS NO LOGIC: lib/sound/suno/cli.ts runs the verbs (a test drives it in
// process); this file is the process - the real store unless --fixtures, the
// environment, stdout and the exit code. Suno's Chrome is SUNO_CDP
// (lib/suno/browser.ts).

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");

/** .env then .env.local, never clobbering an exported value. */
function loadEnv(root: string) {
  for (const f of [".env", ".env.local"]) {
    const at = path.join(root, f);
    if (!fs.existsSync(at)) continue;
    for (const line of fs.readFileSync(at, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
      if (v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
// Pinned BEFORE the loader and before any lib import: lib/fixtures/mode.ts reads it once, at import.
if (!argv.includes("--fixtures")) process.env.NEXT_PUBLIC_GRAVITONE_DATA = "real";
loadEnv(ROOT);
process.chdir(ROOT);

const emit = (s: string) => process.stdout.write(`${s}\n`);
if (JSON_OUT) console.log = (...a: unknown[]) => console.error(...a);

const { runSunoCli } = await import("../lib/sound/suno/cli");

try {
  const r = await runSunoCli(argv);
  if (JSON_OUT) emit(JSON.stringify(r.doc));
  else for (const line of r.lines) console.error(line);
  process.exitCode = r.code;
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (JSON_OUT) emit(JSON.stringify({ error: msg }));
  else console.error(`suno: ${msg}`);
  process.exitCode = 1;
}
// The browser's CDP socket and any timer would keep node alive.
process.exit(process.exitCode ?? 0);
