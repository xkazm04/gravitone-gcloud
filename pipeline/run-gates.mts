// THE GATE RUNNER - runs the gates pipeline/gates.mts declares and reports EVERY
// verdict. `npm run verify` is this file.
//
//   node pipeline/run-gates.mts                 the blocking set, serially, in registry order
//   node pipeline/run-gates.mts --all           blocking + advisory
//   node pipeline/run-gates.mts --only a,b      just those ids (a `needs` outside the selection is not waited for)
//   node pipeline/run-gates.mts --parallel [--jobs N]
//                                               independent gates at once (default N=4); `needs` still holds
//   node pipeline/run-gates.mts --list [--json] the selection, one gate per line - the pre-push banner prints this
//   node pipeline/run-gates.mts --liveness [--json]
//                                               only the liveness check (see LIVENESS_PATTERNS in gates.mts)
//   --report <file>  where the JSON report goes (default <root>/.gate-report.json)
//   --root <dir> --registry <file>  another tree and registry - the probe lane's stub gates use these
//
// WHAT THE `&&` CHAIN COULD NOT SAY, and this does:
//   - EVERY verdict. The chain stopped at the first non-zero exit, so one run
//     showed one failure and hid the rest behind it.
//   - COULD-NOT-RUN apart from FAIL. Four gates exit 2 when their own
//     instrument is broken (no build to read, no ffprobe, a manifest that parsed
//     to nothing). The chain read that as "failed". Here a gate's `outcomes`
//     decides: "012" reads 2 as could-not-run, "01" reads every non-zero as a
//     fail (tsc exits 2 on type errors).
//   - BLOCKED. A gate whose `needs` did not pass is never started - check:bundle
//     reading a stale .next/ after a failed build would "pass" and mean nothing.
//   - LIVENESS. A gate-shaped script that no registered gate runs is a FAIL row
//     in every run, so a regression cannot sit unwired for weeks again.
//
// EXIT: 1 if any gate failed, else 2 if any could not run, else 0. An invalid
// registry (unknown script, a `needs` that is unknown or declared later) is 2
// before anything runs.
//
// SERIAL BY DEFAULT, ON PURPOSE. On Windows `npm test` and `npm run build`
// contend for the same cores and both slow past their timeouts; `--parallel` is
// opt-in for a machine that has the room. CI does not use this runner at all: it
// keeps one step per gate (a red step names itself in the Actions UI), and
// tests/golden-path/verify-ci-parity.probe.spec.ts holds those steps to the
// registry. Both paths therefore run the same gates, in the same order.
//
// Runs under plain `node` (type stripping), not `npx tsx`: the gate that runs
// every other gate should not need a package fetched before it can start.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Gate } from "./gates.mts";

type Verdict = "pass" | "fail" | "could-not-run" | "blocked";
type Row = {
  id: string;
  npmScript: string;
  class: Gate["class"] | "meta";
  outcomes: Gate["outcomes"];
  needs: string[];
  verdict: Verdict;
  exitCode: number | null;
  signal: string | null;
  startedAt: number | null;
  endedAt: number | null;
  durationMs: number | null;
  note?: string;
};
type Registry = { GATES: readonly Gate[]; LIVENESS_PATTERNS: readonly RegExp[]; UNREGISTERED: Readonly<Record<string, string>> };

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── arguments ────────────────────────────────────────────────────────────────
const FLAGS = new Set(["--all", "--parallel", "--list", "--json", "--liveness", "--help"]);
const VALUED = new Set(["--root", "--registry", "--report", "--jobs", "--only"]);

function couldNotRun(headline: string, lines: string[] = []): never {
  console.error(`\nCOULD NOT RUN: ${headline}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error("");
  process.exit(2);
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS.has(a)) flags.add(a);
    else if (VALUED.has(a)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) couldNotRun(`${a} needs a value`);
      values[a] = v;
    } else couldNotRun(`unknown argument ${a}`, ["see the header of pipeline/run-gates.mts"]);
  }
  return { flags, values };
}

const { flags, values } = parseArgs(process.argv.slice(2));
if (flags.has("--help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 14).join("\n"));
  process.exit(0);
}

const ROOT = path.resolve(values["--root"] ?? path.join(HERE, ".."));
const REGISTRY = path.resolve(values["--registry"] ?? path.join(HERE, "gates.mts"));
const REPORT = path.resolve(values["--report"] ?? path.join(ROOT, ".gate-report.json"));
const JOBS = Number(values["--jobs"] ?? 4);
if (!Number.isInteger(JOBS) || JOBS < 1) couldNotRun(`--jobs must be a positive integer, got ${values["--jobs"]}`);

// ── the registry, validated before anything runs ─────────────────────────────
async function loadRegistry(): Promise<Registry> {
  if (!existsSync(REGISTRY)) couldNotRun(`no gate registry at ${REGISTRY}`);
  const mod = (await import(pathToFileURL(REGISTRY).href)) as Partial<Registry>;
  if (!Array.isArray(mod.GATES) || mod.GATES.length === 0) couldNotRun(`${REGISTRY} exports no GATES - a registry of nothing would pass everything`);
  if (!Array.isArray(mod.LIVENESS_PATTERNS)) couldNotRun(`${REGISTRY} exports no LIVENESS_PATTERNS`);
  return { GATES: mod.GATES, LIVENESS_PATTERNS: mod.LIVENESS_PATTERNS, UNREGISTERED: mod.UNREGISTERED ?? {} };
}

function readScripts(): Record<string, string> {
  const pkg = path.join(ROOT, "package.json");
  if (!existsSync(pkg)) couldNotRun(`no package.json at ${ROOT}`);
  return (JSON.parse(readFileSync(pkg, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
}

function validate(gates: readonly Gate[], scripts: Record<string, string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const g of gates) {
    if (!g.id || seen.has(g.id)) errors.push(`gate id ${JSON.stringify(g.id)} is empty or declared twice`);
    // The script name reaches a shell; a name that needs quoting is refused rather than quoted.
    if (!/^[\w:.@/-]+$/.test(g.npmScript ?? "")) errors.push(`gate ${g.id}: npmScript ${JSON.stringify(g.npmScript)} is not a plain script name`);
    else if (!(g.npmScript in scripts)) errors.push(`gate ${g.id}: package.json has no "${g.npmScript}" script`);
    if (g.class !== "blocking" && g.class !== "advisory") errors.push(`gate ${g.id}: class must be blocking or advisory`);
    if (g.outcomes !== "012" && g.outcomes !== "01") errors.push(`gate ${g.id}: outcomes must be "012" or "01"`);
    for (const n of g.needs ?? [])
      if (!seen.has(n)) errors.push(`gate ${g.id} needs "${n}", which is not declared before it`);
    seen.add(g.id);
  }
  return errors;
}

// ── liveness ─────────────────────────────────────────────────────────────────
type Liveness = { candidates: string[]; orphans: string[]; stale: string[]; missing: boolean };

function liveness(reg: Registry, scripts: Record<string, string>): Liveness {
  const dir = path.join(ROOT, "pipeline");
  if (!existsSync(dir)) return { candidates: [], orphans: [], stale: [], missing: true };
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && reg.LIVENESS_PATTERNS.some((p) => p.test(e.name)))
    .map((e) => e.name)
    .sort();
  const bodies = reg.GATES.map((g) => scripts[g.npmScript] ?? "");
  const excused = (n: string) => typeof reg.UNREGISTERED[n] === "string" && reg.UNREGISTERED[n].trim() !== "";
  const runs = (n: string) => bodies.some((b) => b.includes(`pipeline/${n}`));
  return {
    candidates: names.map((n) => `pipeline/${n}`),
    orphans: names.filter((n) => !runs(n) && !excused(n)).map((n) => `pipeline/${n}`),
    // An excuse for a file that is gone, or that a gate now runs, is a record nobody reads.
    stale: Object.keys(reg.UNREGISTERED)
      .filter((n) => !names.includes(n) || runs(n))
      .map((n) => `pipeline/${n}`),
    missing: false,
  };
}

function livenessLines(l: Liveness): string[] {
  return [
    ...l.orphans.map((p) => `${p} is gate-shaped and no registered gate runs it - register it in pipeline/gates.mts, or add it to UNREGISTERED with the reason`),
    ...l.stale.map((p) => `${p} is excused in UNREGISTERED but is absent or already registered - delete the excuse`),
  ];
}

// ── running ──────────────────────────────────────────────────────────────────
function classify(code: number | null, signal: string | null, outcomes: Gate["outcomes"]): Verdict {
  if (code === null || signal) return "could-not-run";
  if (code === 0) return "pass";
  if (outcomes === "012" && code === 2) return "could-not-run";
  return "fail";
}

const rowFor = (g: Gate): Row => ({
  id: g.id,
  npmScript: g.npmScript,
  class: g.class,
  outcomes: g.outcomes,
  needs: [...(g.needs ?? [])],
  verdict: "blocked",
  exitCode: null,
  signal: null,
  startedAt: null,
  endedAt: null,
  durationMs: null,
});

function runGate(g: Gate, row: Row, buffered: boolean): Promise<void> {
  return new Promise((resolve) => {
    const header = `\n── gate ${g.id} · npm run ${g.npmScript}`;
    if (!buffered) console.log(header);
    row.startedAt = Date.now();
    const chunks: Buffer[] = [];
    // One command string with shell:true - `npm` is npm.cmd on Windows - and the
    // script name was validated as plain, so nothing here needs quoting.
    const child = spawn(`npm run ${g.npmScript}`, {
      cwd: ROOT,
      // The playwright configs refuse a committed `.only` when this is set. CI sets
      // CI instead; the pre-push hook sets neither, and CI=1 there would also
      // change `next build` and eslint.
      env: { ...process.env, PW_FORBID_ONLY: "1" },
      shell: true,
      stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    child.stdout?.on("data", (d: Buffer) => chunks.push(d));
    child.stderr?.on("data", (d: Buffer) => chunks.push(d));
    let settled = false;
    const finish = (code: number | null, signal: string | null, note?: string) => {
      if (settled) return;
      settled = true;
      row.endedAt = Date.now();
      row.durationMs = row.endedAt - row.startedAt!;
      row.exitCode = code;
      row.signal = signal;
      row.verdict = note ? "could-not-run" : classify(code, signal, g.outcomes);
      if (note) row.note = note;
      else if (signal) row.note = `killed by ${signal}`;
      if (buffered) {
        console.log(`${header} · ${row.verdict}`);
        process.stdout.write(Buffer.concat(chunks));
      }
      resolve();
    };
    child.on("error", (e) => finish(null, null, `could not start: ${e.message}`));
    child.on("close", (code, signal) => finish(code, signal));
  });
}

async function runSerial(gates: readonly Gate[], rows: Map<string, Row>) {
  for (const g of gates) {
    const row = rows.get(g.id)!;
    const unmet = (g.needs ?? []).filter((n) => rows.has(n) && rows.get(n)!.verdict !== "pass");
    if (unmet.length) {
      row.note = `not started: ${unmet.join(", ")} did not pass`;
      continue;
    }
    await runGate(g, row, false);
  }
}

async function runParallel(gates: readonly Gate[], rows: Map<string, Row>) {
  const pending = [...gates];
  const done = new Set<string>();
  const running = new Set<Promise<void>>();
  const settledNeed = (n: string) => !rows.has(n) || done.has(n);
  while (pending.length || running.size) {
    for (let i = 0; i < pending.length && running.size < JOBS; ) {
      const g = pending[i];
      const needs = g.needs ?? [];
      if (!needs.every(settledNeed)) {
        i++;
        continue;
      }
      pending.splice(i, 1);
      const row = rows.get(g.id)!;
      const unmet = needs.filter((n) => rows.has(n) && rows.get(n)!.verdict !== "pass");
      if (unmet.length) {
        row.note = `not started: ${unmet.join(", ")} did not pass`;
        done.add(g.id);
        i = 0; // a blocked gate settles its dependents too
        continue;
      }
      const p: Promise<void> = runGate(g, row, true).then(() => {
        done.add(g.id);
        running.delete(p);
      });
      running.add(p);
    }
    if (running.size) await Promise.race(running);
    else if (pending.length) {
      // Nothing running and nothing startable: only an invalid `needs` gets here, and validate() refuses those.
      for (const g of pending.splice(0)) rows.get(g.id)!.note = "not started: its needs never settled";
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
function exitFor(rows: Row[]): number {
  if (rows.some((r) => r.verdict === "fail")) return 1;
  if (rows.some((r) => r.verdict === "could-not-run")) return 2;
  return 0;
}

function writeReport(rows: Row[], exitCode: number, extra: Record<string, unknown> = {}) {
  const counts = { pass: 0, fail: 0, "could-not-run": 0, blocked: 0 } as Record<Verdict, number>;
  for (const r of rows) counts[r.verdict]++;
  const report = {
    schema: "gate-report/1",
    at: new Date().toISOString(),
    registry: path.relative(ROOT, REGISTRY).replace(/\\/g, "/"),
    mode: flags.has("--parallel") ? "parallel" : "serial",
    selection: values["--only"] ? `only:${values["--only"]}` : flags.has("--all") ? "all" : "blocking",
    exitCode,
    counts,
    gates: rows,
    ...extra,
  };
  try {
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  } catch (e) {
    console.error(`run-gates: could not write ${REPORT}: ${(e as Error).message}`);
  }
  return counts;
}

function printTable(rows: Row[], counts: Record<Verdict, number>, exitCode: number) {
  const w = Math.max(...rows.map((r) => r.id.length), 8);
  console.log("\n── gates ──────────────────────────────────────────────");
  for (const r of rows) {
    const exit = r.exitCode === null ? "" : `exit ${r.exitCode}`;
    const time = r.durationMs === null ? "" : `${(r.durationMs / 1000).toFixed(1)}s`;
    console.log(`  ${r.id.padEnd(w)}  ${r.verdict.padEnd(13)}  ${exit.padEnd(7)}  ${time.padStart(7)}${r.note ? `  ${r.note}` : ""}`);
  }
  console.log(
    `  ${counts.pass} pass · ${counts.fail} fail · ${counts["could-not-run"]} could-not-run · ${counts.blocked} blocked` +
      `  ->  exit ${exitCode}   (${path.relative(process.cwd(), REPORT) || REPORT})`,
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
const reg = await loadRegistry();
const scripts = readScripts();
const errors = validate(reg.GATES, scripts);
if (errors.length) {
  writeReport([], 2, { errors });
  couldNotRun(`the gate registry is invalid (${path.relative(process.cwd(), REGISTRY) || REGISTRY})`, errors);
}

let selected: Gate[];
if (values["--only"]) {
  const ids = values["--only"].split(",").map((s) => s.trim());
  const unknown = ids.filter((id) => !reg.GATES.some((g) => g.id === id));
  if (unknown.length) couldNotRun(`--only names unknown gate(s): ${unknown.join(", ")}`);
  selected = reg.GATES.filter((g) => ids.includes(g.id));
} else selected = reg.GATES.filter((g) => flags.has("--all") || g.class === "blocking");

if (flags.has("--list")) {
  if (flags.has("--json")) {
    console.log(JSON.stringify(selected.map((g) => ({ ...g, needs: [...(g.needs ?? [])] })), null, 2));
  } else {
    const w = Math.max(...selected.map((g) => g.id.length));
    for (const g of selected) console.log(`  ${g.id.padEnd(w)}  npm run ${g.npmScript}${g.class === "advisory" ? "  (advisory)" : ""}`);
  }
  process.exit(0);
}

const live = liveness(reg, scripts);
if (flags.has("--liveness")) {
  if (flags.has("--json")) console.log(JSON.stringify(live, null, 2));
  else {
    for (const l of livenessLines(live)) console.error(l);
    console.log(`liveness: ${live.candidates.length} gate-shaped file(s), ${live.orphans.length} orphan(s), ${live.stale.length} stale excuse(s)`);
  }
  if (live.missing) couldNotRun(`no pipeline/ directory under ${ROOT}`);
  process.exit(live.orphans.length || live.stale.length ? 1 : 0);
}

const livenessRow: Row = {
  id: "liveness",
  npmScript: "",
  class: "meta",
  outcomes: "012",
  needs: [],
  verdict: live.missing ? "could-not-run" : live.orphans.length || live.stale.length ? "fail" : "pass",
  exitCode: null,
  signal: null,
  startedAt: Date.now(),
  endedAt: Date.now(),
  durationMs: 0,
  note: live.missing ? "no pipeline/ directory" : livenessLines(live).join("; ") || `${live.candidates.length} gate-shaped files, all registered`,
};

const rows = new Map<string, Row>(selected.map((g) => [g.id, rowFor(g)]));
if (flags.has("--parallel")) await runParallel(selected, rows);
else await runSerial(selected, rows);

const all = [livenessRow, ...rows.values()];
const exitCode = exitFor(all);
const counts = writeReport(all, exitCode);
printTable(all, counts, exitCode);
process.exit(exitCode);
