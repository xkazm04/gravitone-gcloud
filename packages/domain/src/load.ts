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

/**
 * The window's summary. Pure. WP-L0 CONTRACT STUB: the signature is final; WP-L2 (spark night-load-band) fills
 * the body - avg/p95/inBand per resource over the samples that read it, the strip, commit peak and limit, waited
 * minutes.
 */
export function summarizeLoad(
  _samples: readonly LoadSample[],
  o: { readonly fromMs: number; readonly toMs: number; readonly band?: { readonly low: number; readonly high: number }; readonly stripMs?: number; readonly sampleMs?: number },
): LoadSummary {
  const none: LoadResource = { avg: 0, p95: 0, inBand: 0, read: 0, strip: [] };
  return { fromMs: o.fromMs, toMs: o.toMs, samples: 0, band: o.band ?? LOAD_BAND, cpu: none, ram: none, gpu: none, commit: {}, waited: {} };
}
