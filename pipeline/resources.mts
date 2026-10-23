// RESOURCES - the machine as admission reads it, and the engines' measured footprints
// (spark game-3d-assets WP1; docs/resources.md).
//
//   npx tsx pipeline/resources.mts probe [--json]
//   npx tsx pipeline/resources.mts profiles [--json]
//   npx tsx pipeline/resources.mts profile <engine> [--label "x"] [--cwd <dir>] [--json] -- <argv...>
//
// `probe` reads the box (commit charge, GPU memory, CPU, ComfyUI's queue) and prints the reading
// and the machine profile admission would hold it to; it opens no store. `profiles` prints every
// engine's recorded footprint. `profile` enqueues a profile job for <engine> with <argv> as its
// command and drives it here: the command runs under the probe, and its peaks over the baseline
// become the engine's profile (a re-profile replaces it).
//
// READ-ONLY TOWARD COMFYUI: this CLI never POSTs /free and never starts or restarts ComfyUI -
// other executors share it (ASSET-PIPELINE.md). Profiling ComfyUI work means queueing a prompt
// through the command you name, nothing more.
//
// THE STORE: GRAVITONE_STORE_PATH, else the app's own (lib/kernelProcess.ts `storeLocation`).
// --json: one JSON document on stdout. EXIT 0 ok · 1 failed · 2 usage.

import { parseArgs } from "node:util";
import { errorMessage } from "@gt/domain/errors";

const USAGE = "usage: npx tsx pipeline/resources.mts probe [--json] | profiles [--json] | profile <engine> [--label x] [--cwd dir] [--json] -- <argv...>";

const argv = process.argv.slice(2);
const dash = argv.indexOf("--");
const own = dash < 0 ? argv : argv.slice(0, dash);
const command = dash < 0 ? [] : argv.slice(dash + 1);

let parsed;
try {
  parsed = parseArgs({ args: own, options: { json: { type: "boolean" }, label: { type: "string" }, cwd: { type: "string" } }, allowPositionals: true, strict: true });
} catch (e) {
  console.error(`resources: ${errorMessage(e)}\n${USAGE}`);
  process.exit(2);
}
const { values, positionals } = parsed;
const json = values.json === true;
const [verb, engine, ...extra] = positionals;
const out = (human: string, doc: unknown): void => console.log(json ? JSON.stringify(doc, null, 2) : human);

async function main(): Promise<number> {
  if (verb === "probe" && engine === undefined) {
    const { machineProbe, machineProfile } = await import("../lib/resources/probe.ts");
    const reading = await machineProbe().read();
    const { profile, unread } = machineProfile(reading.totals);
    const l = reading.load;
    const t = reading.totals;
    const show = (v: number | undefined, unit = " GB"): string => (v === undefined ? "unread" : `${v}${unit}`);
    out(
      [
        `commit   ${show(l.commitUsedGb)} of ${show(t.commitLimitGb)}`,
        `RAM      ${t.ramTotalGb === undefined || t.ramFreeGb === undefined ? "unread" : `${Math.round((t.ramTotalGb - t.ramFreeGb) * 100) / 100} GB of ${t.ramTotalGb} GB`}`,
        `GPU      ${show(l.vramUsedGb)} of ${show(t.vramTotalGb)}`,
        `CPU      ${l.cpuBusy === undefined ? "unread" : `${Math.round(l.cpuBusy * 100)}% of ${t.cores} cores`}`,
        `ComfyUI  ${l.comfyQueue === undefined ? "not answering" : `${l.comfyQueue} queued`}`,
        `marks    memory ${profile.memHigh}/${profile.memLow}, CPU ${profile.cpuHigh}${unread.length === 0 ? "" : `; unread totals: ${unread.join(", ")}`}`,
      ].join("\n"),
      { load: l, totals: t, machine: profile, unread },
    );
    return 0;
  }

  if (verb === "profiles" && engine === undefined) {
    const { openKernel } = await import("@gt/kernel/kernel");
    const { readProfiles } = await import("@gt/kernel/resources/profiles");
    const { storeLocation } = await import("../lib/kernelProcess.ts");
    const k = openKernel(storeLocation());
    if (!k.ok) throw k.error;
    try {
      const r = k.value.store.read((rd) => [...readProfiles(rd).values()]);
      if (!r.ok) throw r.error;
      const rows = r.value.map((p) => `${p.engine.padEnd(10)} commit ${String(p.cost.commitGb).padStart(7)} GB  GPU ${String(p.cost.vramGb).padStart(6)} GB  CPU ${String(p.cost.cpuCores).padStart(5)} cores  ${p.samples} samples  ${p.measuredAt}  ${p.sample}`);
      out(rows.length === 0 ? "no engine is profiled yet: every engine job runs alone" : rows.join("\n"), { profiles: r.value });
    } finally {
      k.value.close();
    }
    return 0;
  }

  if (verb === "profile" && engine !== undefined && extra.length === 0 && command.length > 0) {
    const { openKernel } = await import("@gt/kernel/kernel");
    const { storeLocation } = await import("../lib/kernelProcess.ts");
    const { driveProfile, launchProfile } = await import("../lib/producers/profile.ts");
    const location = storeLocation();
    const k = openKernel(location);
    if (!k.ok) throw k.error;
    try {
      const launched = launchProfile(k.value.store, { engine, argv: command, ...(values.cwd === undefined ? {} : { cwd: values.cwd }), ...(values.label === undefined ? {} : { label: values.label }) }, { kind: "operator", id: "resources-cli" });
      if (!launched.ok) throw launched.error;
      console.error(`resources: ${launched.value.jobId} measures ${engine} running ${command.join(" ")}`);
      const report = await driveProfile(k.value.store, location, launched.value.jobId, launched.value.lane);
      if (!report.ok) throw report.error;
      const r = report.value;
      const failed = r.job?.state !== "done";
      out(failed ? `${launched.value.jobId}: ${r.outcome}${r.job?.error === undefined ? "" : ` - ${r.job.error.message}`}` : `${engine} profiled (${launched.value.jobId})`, { jobId: launched.value.jobId, outcome: r.outcome, state: r.job?.state, ...(r.job?.error === undefined ? {} : { error: r.job.error.message }) });
      return failed ? 1 : 0;
    } finally {
      k.value.close();
    }
  }

  console.error(USAGE);
  return 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`resources: ${errorMessage(e)}`);
    process.exitCode = 1;
  },
);
