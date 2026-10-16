// THE SUNO QUEUE CLI, AS A FUNCTION - the verbs of pipeline/suno.mts, which is
// only the process around this (env, the real store, stdout, the exit code).
// Kept here so a test drives the very code the CLI runs, in process, on the
// same job records a route acts on. Server-only.
//
// Exit codes: 0 ok · 1 a job failed, was refused, or the drive stopped short ·
// 2 usage. `doc` is the one JSON document --json prints; `lines` are the human
// lines printed to stderr otherwise.

import { laneHold } from "@gt/kernel/job-queue";

import { driveSuno, launchSunoNow } from "@/lib/producers/suno";
import { OPERATOR, soundKernel } from "@/lib/producers/sound";

import { FAKE_SUNO_DRIVER, sunoDriver, type SunoDriver } from "./drivers";
import { cancelJob, enqueueProposals, queuedSunoJobs, sunoSnapshot, waitingSunoIds } from "./queue";

export type CliResult = { readonly code: 0 | 1 | 2; readonly doc: unknown; readonly lines: readonly string[] };

export const SUNO_USAGE =
  "usage: npx tsx pipeline/suno.mts <status|enqueue|cancel|start> [--json]\n" +
  "  enqueue <proposalId>...   cancel <jobId>   start (--yes | --dry) [--budget-usd X] [--detach]   [--fixtures]";

const BOOLEAN = ["--json", "--fixtures", "--yes", "--dry", "--detach"];

const usage = (error: string): CliResult => ({ code: 2, doc: { error }, lines: [`suno: ${error}`, SUNO_USAGE] });

/** Run one verb. `driver` overrides the live driver (a test's fake); --dry always binds the fake. */
export async function runSunoCli(argv: readonly string[], opts: { readonly driver?: SunoDriver } = {}): Promise<CliResult> {
  const has = (f: string): boolean => argv.includes(f);
  const args = argv.filter((a) => !BOOLEAN.includes(a));
  const value = (name: string): string | undefined | null => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = args[i + 1];
    return v === undefined || v.startsWith("--") ? null : v;
  };
  const positional = args.slice(1).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--budget-usd");
  const [cmd] = args;

  if (cmd === "status") {
    const s = await sunoSnapshot();
    const hold = soundKernel().store.read((r) => laneHold(r, "box.chrome"));
    if (!hold.ok) throw hold.error;
    const held = hold.value;
    const lines = [`suno ${s.driver.ok ? "ready" : s.driver.reason} · switch ${s.queue.running ? "on" : "off"}${s.queue.interrupted ? ` (${s.queue.interrupted})` : ""}`];
    if (held !== undefined) lines.push(`box.chrome HELD by ${held.jobId}${held.stage ? ` at ${held.stage}` : ""}: credits may be spent - look first`);
    for (const j of s.jobs) lines.push(`  ${j.id} ${j.state.padEnd(9)} ${j.model ?? ""} ${j.fields.title ?? j.fields.style}${j.error ? `  (${j.error})` : ""}`);
    return { code: 0, doc: { ...s, ...(held === undefined ? {} : { hold: held }) }, lines };
  }
  if (cmd === "enqueue") {
    if (!positional.length) return usage("name at least one proposal id");
    // Enqueue never spends, whatever the column's switch says.
    const jobs = await enqueueProposals(positional, Date.now(), { launch: false });
    return { code: 0, doc: { jobs }, lines: jobs.map((j) => `  ${j.id} ${j.state} ${j.fields.title ?? j.fields.style}`) };
  }
  if (cmd === "cancel") {
    const [id] = positional;
    if (id === undefined) return usage("name the job id");
    const job = await cancelJob(id);
    return { code: 0, doc: { job }, lines: [`  ${job.id} ${job.state}`] };
  }
  if (cmd === "start") {
    const dry = has("--dry");
    if (!has("--yes") && !dry) return usage("start spends Suno credits on every waiting prompt; add --yes, or --dry for a dry run");
    const raw = value("budget-usd");
    if (raw === null) return usage("--budget-usd needs a value");
    const ceilingUsd = raw === undefined ? undefined : Number(raw);
    if (ceilingUsd !== undefined && (!Number.isFinite(ceilingUsd) || ceilingUsd <= 0 || ceilingUsd > 10_000)) return usage("--budget-usd must be a dollar amount above 0 and at most 10000");
    const waiting = await waitingSunoIds();
    const launched = waiting.length ? await launchSunoNow(waiting, { mode: dry ? "dry" : "live", actor: OPERATOR, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }) : undefined;
    const lines: string[] = [];
    if (launched) lines.push(`launched ${launched.jobIds.length} ${dry ? "dry" : "live"} job(s) · receipt ${launched.receipt.token.slice(0, 12)} · eta ${launched.receipt.etaAt}`);
    // A dry drive binds the fake: its probe answers ok and its create is never reached (the stand-in is).
    const driver = dry ? FAKE_SUNO_DRIVER : (opts.driver ?? sunoDriver());
    const drive = has("--detach") ? undefined : await driveSuno(queuedSunoJobs(dry ? "dry" : "live"), { driver });
    const after = await sunoSnapshot();
    const mine = new Set([...(launched?.jobIds ?? []), ...(drive?.reports.map((r) => r.jobId) ?? [])]);
    const jobs = after.jobs.filter((j) => j.job !== undefined && mine.has(j.job));
    const short = drive === undefined ? [] : jobs.filter((j) => j.state !== "done");
    for (const j of jobs) lines.push(`  ${j.state.padEnd(9)} ${j.fields.title ?? j.fields.style}${j.error ? `  (${j.error})` : ""}`);
    if (drive?.stopped) lines.push(`stopped short: ${drive.stopped}`);
    if (drive === undefined) lines.push("detached: the worker drives the launched jobs");
    return { code: short.length || drive?.stopped ? 1 : 0, doc: { receipt: launched?.receipt ?? null, jobs, ...(drive?.stopped ? { stopped: drive.stopped } : {}) }, lines };
  }
  return usage(cmd ? `unknown command ${cmd}` : "name a command");
}
