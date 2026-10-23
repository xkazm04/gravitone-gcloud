import type { Actor } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { PROFILER, engineLane, peaksOver, type EngineProfile, type MachineLoad } from "@gt/domain/resource";
import type { Producer } from "@gt/kernel/job-core";
import { readProfileRequest, recordProfileIn } from "@gt/kernel/resources/profiles";

// THE PROFILE JOB (spark game-3d-assets WP1) - an engine run once under the machine probe, its
// peaks over the baseline recorded as the engine's profile, the figures admission then charges
// every job of that engine by (@gt/domain/resource `admit`). One step: run and measure. The
// command is the operator's (`pipeline/resources.mts profile <engine> -- <argv...>`), read from
// the job's request row (@gt/kernel/resources/profiles `ProfileRequest`).
//
// RUNS ALONE. The binding names the engine `profile`, which never has a profile, so admission
// starts it only on a machine with no engine work in flight and starts no engine work beside it:
// a measurement taken next to a ComfyUI render would charge the bake for the render's memory.
// Work that names no engine (a vendor call, a seat turn) still runs beside it - it is light, and
// the baseline taken at the start carries whatever load was already there.
//
// FREE AND LOCAL, as scout-ingest is: $0 estimated and reported, no meter, dry and live the same
// act. A command that exits non-zero records nothing - the job fails with its own last lines - and
// a run whose commit charge was never read records nothing either: a profile missing the one
// figure that took the box down is not a profile.

export const PROFILE = "profile";
/** Every lane an engine's work occupies, so the job runs where the engine's work runs. */
export const PROFILE_LANES: readonly ResourceLane[] = ["gpu.local", "box.blender", "box.render"];
export const PROFILE_STEP = "measure";
export const SAMPLE_MS = 500;

export type Exit = { readonly code: number | null; readonly tail: string };

export type ProfilePorts = {
  /** One machine reading; absent fields are unread (lib/resources/probe.ts). */
  probe(): Promise<MachineLoad>;
  readonly cores: number;
  /** Start the command; `done` settles when it exits, with its exit code and the last of its output. */
  spawn(argv: readonly string[], cwd: string | undefined): { readonly done: Promise<Exit> };
  sleep(ms: number): Promise<void>;
  now(): number;
};

export const profileRunId = (engine: string, stamp: string): string => `${PROFILE}:${engine}:${stamp}`;

/** The run's readings: a baseline before the command, then one every SAMPLE_MS until it exits. */
export async function measure(ports: ProfilePorts, argv: readonly string[], cwd: string | undefined): Promise<{ baseline: MachineLoad; samples: MachineLoad[]; exit: Exit }> {
  const baseline = await ports.probe();
  const run = ports.spawn(argv, cwd);
  let exit: Exit | undefined;
  void run.done.then((e) => (exit = e), () => (exit = { code: null, tail: "the command could not be started" }));
  const samples: MachineLoad[] = [];
  // At least one reading while it runs, however short it is.
  do {
    const t0 = ports.now();
    samples.push(await ports.probe());
    const left = SAMPLE_MS - (ports.now() - t0);
    if (exit === undefined && left > 0) await Promise.race([ports.sleep(left), run.done.catch(() => undefined)]);
  } while (exit === undefined);
  return { baseline, samples, exit };
}

export function defineProfile(lane: ResourceLane, ports: ProfilePorts, actor: Actor): Producer {
  return {
    lane,
    engine: PROFILER,
    plan: (_job: Job, outputs) => (outputs.has(PROFILE_STEP) ? [] : [{ name: PROFILE_STEP, estimate: { seconds: 60, usd: 0 } }]),
    async perform(step, ctx) {
      if (step.name !== PROFILE_STEP) return { kind: "fatal", code: "internal", message: `profile planned ${step.name}, which is not its step` };
      const req = ctx.fx.tx("profile.request", (t) => readProfileRequest(t, ctx.job.of.id));
      if (!req.ok) return { kind: "fatal", code: req.error.code, message: req.error.message };
      const { engine, argv, cwd, label } = req.value;
      const want = engineLane(engine);
      if (want !== undefined && want !== ctx.job.lane) return { kind: "fatal", code: "invalid", message: `${engine} runs on ${want}; this profile job is on ${ctx.job.lane}` };
      const m = await measure(ports, argv, cwd);
      if (m.exit.code !== 0) return { kind: "fatal", code: "unavailable", message: `${argv[0] ?? "the command"} exited ${String(m.exit.code)}; no profile recorded. ${m.exit.tail}`.trim() };
      const { cost, unread } = peaksOver(m.baseline, m.samples, ports.cores);
      if (unread.includes("commit")) return { kind: "fatal", code: "unavailable", message: `the commit charge was never read while ${engine} ran; no profile recorded` };
      const profile: EngineProfile = { engine, cost, samples: m.samples.length, measuredAt: new Date(ports.now()).toISOString(), sample: label };
      const rec = ctx.fx.tx("profile.record", (t) => recordProfileIn(t, profile, actor));
      if (!rec.ok) return { kind: "fatal", code: rec.error.code, message: rec.error.message };
      return { kind: "produced", output: { engine, ...cost, samples: profile.samples, sample: label, ...(unread.length === 0 ? {} : { unread: [...unread] }) }, costUsd: 0 };
    },
  };
}

