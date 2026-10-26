import type { MachineLoad, WaitResource } from "./resource.ts";

// THE BOX'S LOAD OVER A NIGHT, AGAINST THE OPERATOR'S BAND - zod-free, pure, so a client may hold the
// summary a night's desk draws (spark night-load-band, 2026-10-23).
//
// The operator: "keep CPU/RAM/GPU usage in 60-80 percent range so we can learn from each run how to ideally
// balance scope for whole night period". The band is a TARGET for how much a night launches - distinct from
// admission's protective marks (./resource.ts MACHINE_MARKS: memory 0.85/0.75, CPU 0.90), which still hold
// the top. Under the band the box sat idle and the night was under-scoped; over it the night queued itself.
//
// A sample is one minute's reading by the always-on worker's `load-sample` timer (kernel module "load").
// A reading the probe could not take is ABSENT in the sample and is never averaged as zero: every resource
// reports how many samples READ it, so a half-read resource is visible as such.

/** The operator's band, as fractions of each resource's whole. */
export const LOAD_BAND = { low: 0.6, high: 0.8 } as const;
/** The night strip's slot: one bar per five minutes. */
export const LOAD_STRIP_MS = 5 * 60_000;
/** The sampler's cadence; a waiting job counts this long per sample it is seen waiting in. */
export const LOAD_SAMPLE_MS = 60_000;

/** One minute of the box, as the sampler stored it. */
export type LoadSample = {
  readonly atMs: number;
  /** The probe's reading (commit, VRAM, CPU busy, GPU busy, ComfyUI queue), absent fields unread. */
  readonly load: MachineLoad;
  readonly ramUsedGb?: number;
  readonly ramTotalGb?: number;
  readonly commitLimitGb?: number;
  /** Jobs the worker's admission was holding at that minute, and on what. */
  readonly waiting?: readonly { readonly jobId: string; readonly resource: WaitResource }[];
};

/** One banded resource over a window. Fractions 0..1. */
export type LoadResource = {
  readonly avg: number;
  readonly p95: number;
  /** Share of the samples that read it which fell inside the band. */
  readonly inBand: number;
  /** Samples that read this resource (of LoadSummary.samples). */
  readonly read: number;
  /** Mean per LOAD_STRIP_MS slot, in time order; -1 for a slot with no reading. */
  readonly strip: readonly number[];
};

export type LoadSummary = {
  readonly fromMs: number;
  readonly toMs: number;
  readonly samples: number;
  readonly band: { readonly low: number; readonly high: number };
  readonly cpu: LoadResource;
  readonly ram: LoadResource;
  readonly gpu: LoadResource;
  /** Commit charge: the limit admission holds, drawn as a line, not banded. Absent when never read. */
  readonly commit: { readonly peakGb?: number; readonly limitGb?: number };
  /** Minutes jobs waited, by what held them (one sample's interval per job seen waiting). */
  readonly waited: Partial<Readonly<Record<WaitResource, number>>>;
};

type Band = { readonly low: number; readonly high: number };

/** Fractions are kept to four places: a summary read twice is the same summary, and 0.7 averaged is 0.7. */
const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const unit = (x: number | undefined): number | undefined => (x === undefined || !Number.isFinite(x) ? undefined : Math.min(1, Math.max(0, x)));

/** What each banded resource read in one sample; undefined when the probe did not read it. */
const READS: { readonly [K in "cpu" | "ram" | "gpu"]: (s: LoadSample) => number | undefined } = {
  cpu: (s) => unit(s.load.cpuBusy),
  gpu: (s) => unit(s.load.gpuBusy),
  // RAM needs both halves: a used figure without its total is no fraction at all.
  ram: (s) => (s.ramUsedGb === undefined || s.ramTotalGb === undefined || !(s.ramTotalGb > 0) ? undefined : unit(s.ramUsedGb / s.ramTotalGb)),
};

function resourceOf(samples: readonly LoadSample[], read: (s: LoadSample) => number | undefined, band: Band, o: { readonly fromMs: number; readonly stripMs: number; readonly slots: number }): LoadResource {
  const values: number[] = [];
  const sums = new Array<number>(o.slots).fill(0);
  const counts = new Array<number>(o.slots).fill(0);
  for (const s of samples) {
    const v = read(s);
    if (v === undefined) continue;
    values.push(v);
    // A sample at the window's very end belongs to its last slot, not to one past it.
    const slot = Math.min(o.slots - 1, Math.floor((s.atMs - o.fromMs) / o.stripMs));
    sums[slot] = (sums[slot] ?? 0) + v;
    counts[slot] = (counts[slot] ?? 0) + 1;
  }
  const strip = sums.map((sum, i) => ((counts[i] ?? 0) === 0 ? -1 : r4(sum / (counts[i] ?? 1))));
  if (values.length === 0) return { avg: 0, p95: 0, inBand: 0, read: 0, strip };
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((a, v) => a + v, 0) / values.length;
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? 0;
  const inBand = values.filter((v) => v >= band.low && v <= band.high).length / values.length;
  return { avg: r4(avg), p95: r4(p95), inBand: r4(inBand), read: values.length, strip };
}

/**
 * The window's summary. Pure. The rules, each one a decision:
 *
 * - THE WINDOW is [fromMs, toMs], both ends in, as the kernel's reader returns it; a sample outside it is
 *   not counted, and `samples` is the count inside. A window that ends before it starts holds nothing.
 * - EACH BANDED RESOURCE is read over the samples that READ it, never over all of them: cpu is
 *   `load.cpuBusy`, gpu `load.gpuBusy`, ram `ramUsedGb / ramTotalGb` (both present, the total above zero).
 *   A value outside 0..1 is clamped into it; a non-finite one is unread. `read` says how many samples
 *   did read it, so a resource read for half the night shows as such; one never read is all zeros with
 *   `read: 0`, which the reader must tell apart from an idle box by that count.
 * - avg is the mean; p95 the NEAREST RANK (the ceil(0.95 n)-th smallest, a value that was read, not an
 *   interpolation); inBand the share of the reads with low <= v <= high, both marks inside.
 * - THE STRIP is one slot per `stripMs` from fromMs, ceil((toMs - fromMs) / stripMs) of them and at least
 *   one: the mean of the slot's reads, or -1 for a slot with none (the sampler was down, or the probe
 *   could not read it) - a gap is drawn as a gap, not as an idle box.
 * - COMMIT is not banded: peakGb the largest `commitUsedGb` read, limitGb the newest `commitLimitGb`
 *   (the limit grows when Windows grows the page file); each absent when never read.
 * - WAITED: every job a sample saw admission holding adds one sample interval (`sampleMs`) to the
 *   resource it waited on, summed in minutes and rounded to a tenth.
 * - Fractions are rounded to four places. Zero samples is a summary with `samples: 0`: whether that is
 *   shown is the caller's call (a night before the sampler has nothing to show).
 */
export function summarizeLoad(samples: readonly LoadSample[], o: { readonly fromMs: number; readonly toMs: number; readonly band?: Band; readonly stripMs?: number; readonly sampleMs?: number }): LoadSummary {
  const band = o.band ?? LOAD_BAND;
  const stripMs = o.stripMs ?? LOAD_STRIP_MS;
  const sampleMs = o.sampleMs ?? LOAD_SAMPLE_MS;
  const inside = o.toMs < o.fromMs ? [] : samples.filter((s) => s.atMs >= o.fromMs && s.atMs <= o.toMs);
  const slots = Math.max(1, Math.ceil((o.toMs - o.fromMs) / stripMs));
  const at = { fromMs: o.fromMs, stripMs, slots };

  let peakGb: number | undefined;
  let limit: { readonly atMs: number; readonly gb: number } | undefined;
  const minutes = new Map<WaitResource, number>();
  for (const s of inside) {
    const used = s.load.commitUsedGb;
    if (used !== undefined && Number.isFinite(used) && (peakGb === undefined || used > peakGb)) peakGb = used;
    if (s.commitLimitGb !== undefined && Number.isFinite(s.commitLimitGb) && (limit === undefined || s.atMs >= limit.atMs)) limit = { atMs: s.atMs, gb: s.commitLimitGb };
    for (const w of s.waiting ?? []) minutes.set(w.resource, (minutes.get(w.resource) ?? 0) + sampleMs / 60_000);
  }
  const waited: Partial<Record<WaitResource, number>> = {};
  for (const [k, m] of minutes) waited[k] = Math.round(m * 10) / 10;

  return {
    fromMs: o.fromMs,
    toMs: o.toMs,
    samples: inside.length,
    band,
    cpu: resourceOf(inside, READS.cpu, band, at),
    ram: resourceOf(inside, READS.ram, band, at),
    gpu: resourceOf(inside, READS.gpu, band, at),
    commit: { ...(peakGb === undefined ? {} : { peakGb }), ...(limit === undefined ? {} : { limitGb: limit.gb }) },
    waited,
  };
}
