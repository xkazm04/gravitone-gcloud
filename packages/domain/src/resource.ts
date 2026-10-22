import type { ResourceLane } from "./lane.capacity.ts";

// WHAT A JOB COSTS THE MACHINE, AND WHETHER THE MACHINE CAN PAY IT NOW - zod-free, pure, so a
// client may hold the words a waiting job is explained in (spark game-3d-assets, WP1).
//
// The kernel counted SLOTS per lane (./lane.capacity.ts) and nothing else. That held while every
// engine on the box was the one 24 GB card's tenant and took turns by lease. This box (archemond:
// 64 GB of memory the GPU and the CPU share, 20 cores) runs engines with very different
// footprints side by side - ComfyUI with TRELLIS.2 (~12.5 GB on the GPU, the process up to ~55 GB
// private), Blender headless (CPU and RAM, EEVEE on the GPU), Ollama vision, ffmpeg - and a slot
// count cannot say which of them may overlap. The measurement that set the rule: a clip that takes
// 423 s took 8741 s while ComfyUI held 55 GB and the box paged. COMMIT CHARGE, not free RAM, is
// the limit that was crossed (~102-116 GB here), so it is the memory reading admission charges.
//
// The rules are the registry's admission-queue techniques, kept by name:
//   resource-denominated-bounds  charge the MEASURED resource (an engine's profiled peaks), not a
//     count of jobs;
//   load-aware-admission  CPU saturation heals itself, so it DEFERS; memory occupancy does not
//     (a paging box stays paging), so it refuses at a threshold short of the cliff, with
//     HYSTERESIS - refuse above the high-water mark and keep refusing until the reading falls
//     below the low-water mark, or the gate flaps with every reading across one line.
// Two of this repo's own:
//   an ENGINE WITH NO PROFILE runs ALONE. What it costs is unknown, and an unknown beside anything
//     else is the 55 GB surprise again; once it has run under the profiler it shares.
//   an UNREAD reading is not zero. A probe that could not read the commit charge has said nothing
//     about it, and admitting a memory-costly job on nothing is admitting it blind.

/** An engine's peaks while it works, over the machine's baseline before it started. */
export type ResourceCost = { readonly vramGb: number; readonly commitGb: number; readonly cpuCores: number };

/** The machine's totals and the marks admission holds them to (fractions of the total). */
export type MachineProfile = {
  readonly vramTotalGb: number;
  readonly commitLimitGb: number;
  readonly cores: number;
  /** Refuse a memory-costly job that would take the reading above this fraction. Default .85. */
  readonly memHigh: number;
  /** Once refused, keep refusing until the reading is below this fraction. Default .75. */
  readonly memLow: number;
  /** Defer a CPU-costly job while the CPU is busier than this fraction. Default .90. */
  readonly cpuHigh: number;
};

export const MACHINE_MARKS = { memHigh: 0.85, memLow: 0.75, cpuHigh: 0.9 } as const;

/**
 * One reading of the machine. Every field may be absent: the probe could not read it (no
 * nvidia-smi, a CIM call that timed out, ComfyUI down). Absent is NOT zero, and nothing here
 * reads it as zero.
 */
export type MachineLoad = {
  readonly vramUsedGb?: number;
  readonly commitUsedGb?: number;
  /** 0..1 over every core, foreign load included (other sessions' builds share this box). */
  readonly cpuBusy?: number;
  /** Prompts running or pending on the shared ComfyUI, whoever queued them. */
  readonly comfyQueue?: number;
};

/** An engine's measured footprint, as the profile job recorded it. */
export type EngineProfile = {
  readonly engine: string;
  readonly cost: ResourceCost;
  /** Probe readings taken while it ran. */
  readonly samples: number;
  readonly measuredAt: string;
  /** What it ran on, in a few words (`trellis chair 512`). */
  readonly sample: string;
};

/** The engines this box runs today. A producer may name another; the list is a vocabulary, not a gate. */
export const ENGINES = ["comfy", "ollama", "blender", "unreal", "ffmpeg"] as const;
export type KnownEngine = (typeof ENGINES)[number];

/**
 * The lane each engine's work occupies. ComfyUI and Ollama share the one card's lease (gpu.local);
 * Blender has its own row so a bake never queues behind an ffmpeg render; the UE editor renders on
 * the GPU (D3D12) and takes the card's lane.
 */
export const ENGINE_LANES: { readonly [E in KnownEngine]: ResourceLane } = {
  comfy: "gpu.local",
  ollama: "gpu.local",
  blender: "box.blender",
  unreal: "gpu.local",
  ffmpeg: "box.render",
};

export const engineLane = (engine: string): ResourceLane | undefined => (ENGINES as readonly string[]).includes(engine) ? ENGINE_LANES[engine as KnownEngine] : undefined;

/**
 * The engine a PROFILE job names (packages/producers profile/define.ts). It can never be profiled
 * (the kernel refuses to record it), so admission always runs a profile job alone - a footprint
 * measured beside another engine's work would be charged that work's memory too.
 */
export const PROFILER = "profile";

/** A job as admission sees it: its engine, and that engine's profile when it has one. */
export type Costed = { readonly engine: string; readonly cost?: ResourceCost };

export type WaitResource = "alone" | "memory" | "vram" | "cpu" | "comfy-queue" | "unread";

/**
 * The memory readings taken when the running set was last EMPTY - what its peaks sit on. A profile
 * is a peak OVER a baseline, so the running set's peaks add to that baseline, not to a reading
 * that already holds part of them. Unknown (absent), the peaks add to the reading itself: an
 * over-count, which only makes a job wait a look longer.
 */
export type Baseline = { readonly commitGb?: number; readonly vramGb?: number };

/** `tight` is the memory gate's state AFTER this decision: the caller carries it to the next. */
export type Admission =
  | { readonly ok: true; readonly tight: boolean }
  | { readonly ok: false; readonly resource: WaitResource; readonly why: string; readonly tight: boolean };

const gb = (x: number): string => `${x.toFixed(1)} GB`;

/**
 * May `job` start now, beside `running`, on a machine reading `load`?
 *
 * `tight` is the hysteresis: true once a memory refusal has been made and not yet released. Both
 * marks are read in the same terms - what the pool WOULD hold with this job in it (the reading or
 * the running set's peaks, whichever is larger, plus the job's own peak). A reading held to the
 * high mark and released at the low one would be two different quantities: a 25 GB job on a
 * 100 GB limit is refused above a 60 GB reading, and "release below a 75 GB reading" would release
 * it at once - no hysteresis at all. So: refuse when the projection crosses the high mark; once
 * refused, keep refusing until a projection falls below the low mark. One flag for commit and GPU
 * memory together, because on unified memory they are two views of one pool. A job that costs no
 * memory is never held by it, and leaves the flag as it found it.
 */
export function admit(job: Costed, running: readonly Costed[], load: MachineLoad, m: MachineProfile, tight: boolean, base: Baseline = {}): Admission {
  const refuse = (resource: WaitResource, why: string, t = tight): Admission => ({ ok: false, resource, why, tight: t });

  const unprofiled = running.find((r) => r.cost === undefined);
  if (unprofiled !== undefined) return refuse("alone", `${unprofiled.engine} has no profile and runs alone`);
  const cost = job.cost;
  if (cost === undefined) {
    if (running.length > 0) return refuse("alone", `${job.engine} has no profile: it waits for ${running.map((r) => r.engine).join(", ")} to finish`);
    return { ok: true, tight };
  }

  const pool = [
    { resource: "memory" as const, need: cost.commitGb, used: load.commitUsedGb, peaks: sum(running, (c) => c.commitGb), base: base.commitGb, total: m.commitLimitGb, what: "commit charge" },
    { resource: "vram" as const, need: cost.vramGb, used: load.vramUsedGb, peaks: sum(running, (c) => c.vramGb), base: base.vramGb, total: m.vramTotalGb, what: "GPU memory" },
  ];
  let costly = false;
  for (const p of pool) {
    if (p.need <= 0) continue;
    costly = true;
    if (p.used === undefined) return refuse("unread", `${p.what} is unread; ${job.engine} needs ${gb(p.need)}`);
    // What the pool holds once every running job has peaked: the reading, or the baseline the
    // running set sits on plus its peaks, whichever is larger - then this job's own peak on top.
    const projected = (p.base === undefined ? p.used + p.peaks : Math.max(p.used, p.base + p.peaks)) + p.need;
    if (tight && projected >= m.memLow * p.total) return refuse(p.resource, `${p.what} would reach ${gb(projected)}; held since the last refusal until under ${gb(m.memLow * p.total)}`);
    if (projected > m.memHigh * p.total) return refuse(p.resource, `${p.what} would reach ${gb(projected)} of ${gb(p.total)}; the mark is ${gb(m.memHigh * p.total)}`, true);
  }
  const state = costly ? false : tight;

  if (cost.cpuCores > 0 && load.cpuBusy !== undefined && load.cpuBusy > m.cpuHigh) {
    return refuse("cpu", `CPU ${Math.round(load.cpuBusy * 100)}% busy; the mark is ${Math.round(m.cpuHigh * 100)}%`, state);
  }
  if (job.engine === "comfy" && load.comfyQueue !== undefined && load.comfyQueue > 0) {
    return refuse("comfy-queue", `ComfyUI has ${load.comfyQueue} prompt(s) queued`, state);
  }
  return { ok: true, tight: state };
}

function sum(running: readonly Costed[], of: (c: ResourceCost) => number): number {
  let s = 0;
  for (const r of running) if (r.cost !== undefined) s += of(r.cost);
  return s;
}

/**
 * An engine's profile from a run's readings: the peak of each over the baseline taken before it
 * started, never negative (an engine that ran while something else let go of memory still cost
 * nothing less than nothing). A reading absent from every sample is a peak of zero ONLY because
 * the profile has no other way to say it; `unread` names which, so the caller can refuse to
 * record a profile that never saw the commit charge.
 */
export function peaksOver(baseline: MachineLoad, samples: readonly MachineLoad[], cores: number): { cost: ResourceCost; unread: readonly ("commit" | "vram" | "cpu")[] } {
  const peak = (base: number | undefined, read: (l: MachineLoad) => number | undefined): number | undefined => {
    let max: number | undefined;
    for (const s of samples) {
      const v = read(s);
      if (v !== undefined && (max === undefined || v > max)) max = v;
    }
    return max === undefined || base === undefined ? undefined : Math.max(0, max - base);
  };
  const commit = peak(baseline.commitUsedGb, (l) => l.commitUsedGb);
  const vram = peak(baseline.vramUsedGb, (l) => l.vramUsedGb);
  const cpu = peak(baseline.cpuBusy, (l) => l.cpuBusy);
  const round = (x: number): number => Math.round(x * 100) / 100;
  const unread = [...(commit === undefined ? ["commit" as const] : []), ...(vram === undefined ? ["vram" as const] : []), ...(cpu === undefined ? ["cpu" as const] : [])];
  return { cost: { commitGb: round(commit ?? 0), vramGb: round(vram ?? 0), cpuCores: round((cpu ?? 0) * cores) }, unread };
}
