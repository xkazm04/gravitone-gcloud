import { spawn } from "node:child_process";
import path from "node:path";
import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { engineLane } from "@gt/domain/resource";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { enqueueIn } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import { requestProfileIn } from "@gt/kernel/resources/profiles";
import type { Store } from "@gt/kernel/store";
import { PROFILE, defineProfile, profileRunId, type Exit, type ProfilePorts } from "@gt/producers/profile/define";

import { machineProbe, nodePorts } from "../resources/probe.ts";

// THE PROFILE PRODUCER, BOUND TO THIS BOX (spark game-3d-assets WP1): the definition
// (packages/producers/src/profile/define.ts) over the machine probe (../resources/probe.ts) and a
// child process. One binding per lane an engine's work occupies (PROFILE_LANES), so the job runs
// where the engine it measures runs. The registry lines are
//
//   ...PROFILE_LANES.map((lane): Bound => ({ name: "profile", producer: profileProducer(lane) })),
//
// LAUNCHED AS SCOUT-INGEST IS: a free job enqueued directly - no receipt, no Run row, no ceiling,
// DRY (it calls no vendor) - with its command in a request row written in the same transaction
// (@gt/kernel/resources/profiles `requestProfileIn`). The command is spawned WITHOUT a shell: an
// argv is an argv, and a `.cmd` wrapper is named as `cmd /c <wrapper>` by whoever profiles it.

const TAIL_BYTES = 2_000;

/** Run `argv` with no shell; the exit code and the last of what it printed. */
export function spawnExit(argv: readonly string[], cwd: string | undefined): { readonly done: Promise<Exit> } {
  const [cmd, ...args] = argv;
  if (cmd === undefined) return { done: Promise.resolve({ code: null, tail: "no command" }) };
  return {
    done: new Promise((resolve) => {
      let tail = "";
      const keep = (b: Buffer): void => {
        tail = (tail + b.toString("utf8")).slice(-TAIL_BYTES);
      };
      const child = spawn(cmd, args, { ...(cwd === undefined ? {} : { cwd }), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      child.on("error", (e) => resolve({ code: null, tail: e.message }));
      child.on("close", (code) => resolve({ code, tail: tail.trim() }));
    }),
  };
}

export const profilePorts = (): ProfilePorts => {
  // Uncached: every sample a fresh commit-charge reading (lib/resources/probe.ts `machineProbe`).
  const probe = machineProbe(nodePorts, { cacheMs: 0 });
  return {
    probe: () => probe.probe(),
    cores: nodePorts.cpus().length,
    spawn: spawnExit,
    sleep: nodePorts.sleep,
    now: nodePorts.now,
  };
};

const MACHINE: Actor = { kind: "machine", id: "profile" };

/** The bound producer on `lane`; a test hands it a fake probe and a fake command. */
export const profileProducer = (lane: Producer["lane"], ports?: ProfilePorts): Producer => defineProfile(lane, ports ?? profilePorts(), MACHINE);

export type ProfileLaunch = { readonly engine: string; readonly argv: readonly string[]; readonly cwd?: string; readonly label?: string };

/** Enqueue a profile run of `engine` and its request row, together. Its job id is `job:run:<runId>`. */
export function launchProfile(store: Store, launch: ProfileLaunch, actor: Actor, now: Date = new Date()): Result<{ readonly jobId: string; readonly runId: string; readonly lane: Producer["lane"] }> {
  const lane = engineLane(launch.engine);
  if (lane === undefined) return { ok: false, error: new AppError("invalid", `no lane is known for engine "${launch.engine}"; profile one of comfy, ollama, blender, unreal, ffmpeg`) };
  const runId = profileRunId(launch.engine, now.toISOString().replace(/[-:.]/g, "").replace("T", "-"));
  const jobId = `job:run:${runId}`;
  const label = launch.label ?? launch.argv.slice(0, 3).join(" ").slice(0, 80);
  const r = store.tx((t) => {
    requestProfileIn(t, { runId, engine: launch.engine, argv: launch.argv, ...(launch.cwd === undefined ? {} : { cwd: launch.cwd }), label });
    enqueueIn(t, { id: jobId, of: { kind: "run", id: runId }, producer: PROFILE, lane }, actor);
  });
  return r.ok ? ok({ jobId, runId, lane }) : r;
}

/** Drive a profile job in this process (the CLI's default; the worker's otherwise). */
export function driveProfile(store: Store, location: string, jobId: string, lane: Producer["lane"], opts: RunOptions & { readonly ports?: ProfilePorts } = {}): Promise<Result<RunReport>> {
  const { ports, ...run } = opts;
  // Its own effects, not extract's `effectsFor`: this file is imported by a plain CLI, and extract's
  // module pulls v1 engines that only load under pipeline/lib-hooks.mts.
  const fx = liveEffects(store, blobStore(location === ":memory:" ? path.resolve("foundry-out", "blobs") : path.join(path.dirname(location), "blobs")));
  return runJob(fx, profileProducer(lane, ports), jobId, run);
}
