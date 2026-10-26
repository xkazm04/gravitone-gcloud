import { execFile } from "node:child_process";
import os from "node:os";
import { MACHINE_MARKS, type MachineLoad, type MachineProfile } from "@gt/domain/resource";

// THE MACHINE PROBE - what admission reads the box by (spark game-3d-assets WP1;
// @gt/domain/resource says what each reading is charged against and why).
//
// Five readings, each from the one place this box answers it truthfully, each BOUNDED and each
// ABSENT when it cannot be had - never a throw, never a zero:
//   commit charge  Win32_OperatingSystem TotalVirtualMemorySize / FreeVirtualMemory, one CIM call.
//                  Not free RAM: the measured failure here was a 55 GB ComfyUI paging the box
//                  while RAM still looked fine (a 423 s clip took 8741 s). The same call carries
//                  physical RAM, reported beside it for the operator and charged against nothing.
//   GPU memory     nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu (MiB). On this
//                  box's unified memory it is the card's view of the same 64 GB; on a box without
//                  the driver it is absent, and a GPU-costly job waits as `unread` rather than guessing.
//   GPU busy       the same call's utilization.gpu (spark night-load-band): whether the card WORKED,
//                  which its memory cannot say - a loaded model idles at full VRAM. Charged against
//                  nothing; the night's load band reads it.
//   CPU            two os.cpus() samples a quarter second apart, every core, foreign load included
//                  (other sessions' builds share this box; CPU is their ceiling).
//   ComfyUI queue  GET /queue, running + pending, whoever queued them. Read, never written: this
//                  probe never POSTs /free and never starts ComfyUI (ASSET-PIPELINE.md: other
//                  executors share it). Down is absent, not 0.
//
// The CIM call costs ~0.5-1 s of PowerShell start-up, so its answer is cached for CACHE_MS; the
// worker reads the machine once per look, and looks run faster than that while drives finish.

export const CACHE_MS = 2_000;
const CIM_TIMEOUT_MS = 8_000;
const SMI_TIMEOUT_MS = 4_000;
const COMFY_TIMEOUT_MS = 1_000;
const CPU_WINDOW_MS = 250;

/** The parts of a reading admission does not charge, but the operator reads beside it. */
export type MachineTotals = {
  readonly commitLimitGb?: number;
  readonly vramTotalGb?: number;
  readonly ramTotalGb?: number;
  readonly ramFreeGb?: number;
  readonly cores: number;
};

export type MachineReading = { readonly load: MachineLoad; readonly totals: MachineTotals };

/** The probe's reach into the box, injectable so a test never runs PowerShell or nvidia-smi. */
export type ProbePorts = {
  /** Run a command; its stdout, or undefined on any failure or past `timeoutMs`. */
  run(cmd: string, args: readonly string[], timeoutMs: number): Promise<string | undefined>;
  /** GET a URL as JSON; undefined on any failure or past `timeoutMs`. */
  getJson(url: string, timeoutMs: number): Promise<unknown>;
  cpus(): readonly { readonly times: { readonly user: number; readonly nice: number; readonly sys: number; readonly idle: number; readonly irq: number } }[];
  sleep(ms: number): Promise<void>;
  now(): number;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export const nodePorts: ProbePorts = {
  run: (cmd, args, timeoutMs) =>
    new Promise((resolve) => {
      execFile(cmd, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (e, stdout) => resolve(e === null ? String(stdout) : undefined));
    }),
  getJson: async (url, timeoutMs) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return r.ok ? await r.json() : undefined;
    } catch {
      return undefined;
    }
  },
  cpus: () => os.cpus(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
  env: process.env,
};

const KB_PER_GB = 1024 * 1024;
const MIB_PER_GB = 1024;
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** `a b c d` KB from the CIM call -> GB, or undefined unless all four are numbers. */
export function parseCim(out: string | undefined): { commitUsedGb: number; commitLimitGb: number; ramFreeGb: number; ramTotalGb: number } | undefined {
  const xs = (out ?? "").trim().split(/\s+/).map(Number);
  if (xs.length !== 4 || xs.some((x) => !Number.isFinite(x) || x < 0)) return undefined;
  const [totalVirt = 0, freeVirt = 0, freePhys = 0, totalPhys = 0] = xs;
  if (totalVirt <= 0) return undefined;
  return { commitUsedGb: round2((totalVirt - freeVirt) / KB_PER_GB), commitLimitGb: round2(totalVirt / KB_PER_GB), ramFreeGb: round2(freePhys / KB_PER_GB), ramTotalGb: round2(totalPhys / KB_PER_GB) };
}

/**
 * `used, total, utilization` per device line (MiB, MiB, percent) -> GB summed over the devices that
 * report memory, or undefined when none does. A device that reports `[N/A]` memory has no memory of
 * its own to count and is skipped whole, its utilisation with it: archemond lists its NPU beside the
 * GPU that way (measured 2026-10-22: "1788, 64000" then "[N/A], [N/A]"). A device whose memory reads
 * but whose utilisation is `[N/A]` counts its memory and says nothing about how busy it is: gpuBusy
 * is the busiest device that answered (spark night-load-band - on one card, that card), absent when
 * none did.
 */
export function parseSmi(out: string | undefined): { vramUsedGb: number; vramTotalGb: number; gpuBusy?: number } | undefined {
  let used = 0;
  let total = 0;
  let read = 0;
  let busy: number | undefined;
  for (const l of (out ?? "").split(/\r?\n/)) {
    const fields = l.split(",").map((s) => (s.trim() === "" ? Number.NaN : Number(s.trim())));
    if (fields.length > 3) continue;
    const [u, t, util] = fields;
    if (u === undefined || t === undefined || !Number.isFinite(u) || !Number.isFinite(t) || t <= 0) continue;
    used += u;
    total += t;
    read++;
    if (util !== undefined && Number.isFinite(util) && util >= 0 && util <= 100 && (busy === undefined || util / 100 > busy)) busy = util / 100;
  }
  return read === 0 ? undefined : { vramUsedGb: round2(used / MIB_PER_GB), vramTotalGb: round2(total / MIB_PER_GB), ...(busy === undefined ? {} : { gpuBusy: round2(busy) }) };
}

/** ComfyUI's /queue -> prompts running plus pending, or undefined when it is not that shape. */
export function parseQueue(body: unknown): number | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const q = body as { queue_running?: unknown; queue_pending?: unknown };
  if (!Array.isArray(q.queue_running) || !Array.isArray(q.queue_pending)) return undefined;
  return q.queue_running.length + q.queue_pending.length;
}

/** The busy fraction between two os.cpus() samples, over every core. */
export function busyBetween(a: ReturnType<ProbePorts["cpus"]>, b: ReturnType<ProbePorts["cpus"]>): number | undefined {
  if (a.length === 0 || a.length !== b.length) return undefined;
  let busy = 0;
  let all = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]?.times;
    const y = b[i]?.times;
    if (x === undefined || y === undefined) return undefined;
    const idle = y.idle - x.idle;
    const total = y.user - x.user + (y.nice - x.nice) + (y.sys - x.sys) + (y.irq - x.irq) + idle;
    busy += total - idle;
    all += total;
  }
  return all > 0 ? round2(Math.min(1, Math.max(0, busy / all))) : undefined;
}

const CIM = "$o=Get-CimInstance Win32_OperatingSystem; '{0} {1} {2} {3}' -f $o.TotalVirtualMemorySize,$o.FreeVirtualMemory,$o.FreePhysicalMemory,$o.TotalVisibleMemorySize";

export type Probe = {
  /** The load admission charges, and the totals beside it. */
  read(): Promise<MachineReading>;
  probe(): Promise<MachineLoad>;
};

/**
 * `cacheMs` 0 for a profile run: its baseline and its samples must each be a fresh reading, or a
 * 2 s cache hands the baseline's commit charge to every sample and the engine profiles at 0 GB
 * (measured 2026-10-22: a 1 GB allocation under the profiler recorded `commit 0`). Uncached, a
 * sample costs the CIM call's start-up (~0.5-1 s), so a profile samples about once a second.
 */
export function machineProbe(ports: ProbePorts = nodePorts, opts: { readonly cacheMs?: number } = {}): Probe {
  const cacheMs = opts.cacheMs ?? CACHE_MS;
  let cim: { at: number; value: Promise<ReturnType<typeof parseCim>> } | undefined;
  const comfy = (ports.env["COMFY_URL"] ?? "http://127.0.0.1:8188").replace(/\/+$/, "");
  const memory = (): Promise<ReturnType<typeof parseCim>> => {
    const now = ports.now();
    if (cim === undefined || now - cim.at >= cacheMs) {
      // Off Windows there is no PowerShell to answer: the run fails, and the reading is absent.
      cim = { at: now, value: ports.run("powershell", ["-NoProfile", "-NonInteractive", "-Command", CIM], CIM_TIMEOUT_MS).then(parseCim) };
    }
    return cim.value;
  };
  const cpu = async (): Promise<number | undefined> => {
    const a = ports.cpus();
    await ports.sleep(CPU_WINDOW_MS);
    return busyBetween(a, ports.cpus());
  };
  const read = async (): Promise<MachineReading> => {
    const [mem, gpu, cpuBusy, queue] = await Promise.all([
      memory(),
      ports.run("nvidia-smi", ["--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"], SMI_TIMEOUT_MS).then(parseSmi),
      cpu(),
      ports.getJson(`${comfy}/queue`, COMFY_TIMEOUT_MS).then(parseQueue),
    ]);
    const load: MachineLoad = {
      ...(gpu === undefined ? {} : { vramUsedGb: gpu.vramUsedGb }),
      ...(gpu?.gpuBusy === undefined ? {} : { gpuBusy: gpu.gpuBusy }),
      ...(mem === undefined ? {} : { commitUsedGb: mem.commitUsedGb }),
      ...(cpuBusy === undefined ? {} : { cpuBusy }),
      ...(queue === undefined ? {} : { comfyQueue: queue }),
    };
    const totals: MachineTotals = {
      ...(mem === undefined ? {} : { commitLimitGb: mem.commitLimitGb, ramTotalGb: mem.ramTotalGb, ramFreeGb: mem.ramFreeGb }),
      ...(gpu === undefined ? {} : { vramTotalGb: gpu.vramTotalGb }),
      cores: ports.cpus().length,
    };
    return { load, totals };
  };
  return { read, probe: async () => (await read()).load };
}

/** A fraction from the environment, or the default when it is unset or not one. */
function fraction(env: ProbePorts["env"], name: string, dflt: number): number {
  const raw = env[name];
  const v = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(v) && v > 0 && v <= 1 ? v : dflt;
}

function gbFrom(env: ProbePorts["env"], name: string): number | undefined {
  const raw = env[name];
  const v = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * The machine's profile from a reading's totals, each overridable from the environment
 * (MACHINE_COMMIT_LIMIT_GB, MACHINE_VRAM_GB, MACHINE_CORES, MACHINE_MEM_HIGH, MACHINE_MEM_LOW,
 * MACHINE_CPU_HIGH). `unread` names a memory total that neither the box nor the environment gave:
 * a profile with that total at 0 refuses every job that costs it, which is the honest answer to
 * "how much is there" when nobody could say.
 */
export function machineProfile(totals: MachineTotals, env: ProbePorts["env"] = process.env): { profile: MachineProfile; unread: readonly ("commit" | "vram")[] } {
  const commit = gbFrom(env, "MACHINE_COMMIT_LIMIT_GB") ?? totals.commitLimitGb;
  const vram = gbFrom(env, "MACHINE_VRAM_GB") ?? totals.vramTotalGb;
  const cores = gbFrom(env, "MACHINE_CORES") ?? totals.cores;
  const memHigh = fraction(env, "MACHINE_MEM_HIGH", MACHINE_MARKS.memHigh);
  const memLow = Math.min(fraction(env, "MACHINE_MEM_LOW", MACHINE_MARKS.memLow), memHigh);
  return {
    profile: { commitLimitGb: commit ?? 0, vramTotalGb: vram ?? 0, cores: Math.round(cores), memHigh, memLow, cpuHigh: fraction(env, "MACHINE_CPU_HIGH", MACHINE_MARKS.cpuHigh) },
    unread: [...(commit === undefined ? ["commit" as const] : []), ...(vram === undefined ? ["vram" as const] : [])],
  };
}

/**
 * The worker's admission source: this box's probe, and the machine profile its FIRST reading gives.
 * Lazy on purpose: a worker that never meets engine work never pays the CIM call's PowerShell
 * start-up (the kernel gate probes only when a pick names an engine, and reads `machine` only
 * after that probe). Before the first reading the profile is all zeros - every job that costs
 * memory waits - and a memory total nobody could read stays 0, its readings absent, so such a job
 * waits as `unread`, said on the worker's stderr, rather than running blind.
 */
export function machineAdmission(ports: ProbePorts = nodePorts): { probe(): Promise<MachineLoad>; readonly machine: MachineProfile } {
  const p = machineProbe(ports);
  let machine: MachineProfile | undefined;
  const unknown: MachineProfile = { commitLimitGb: 0, vramTotalGb: 0, cores: 0, ...MACHINE_MARKS };
  return {
    probe: async () => {
      const r = await p.read();
      machine ??= machineProfile(r.totals, ports.env).profile;
      return r.load;
    },
    get machine() {
      return machine ?? unknown;
    },
  };
}
