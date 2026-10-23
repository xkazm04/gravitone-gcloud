import { LOAD_BAND, summarizeLoad, type LoadSample, type LoadSummary } from "@gt/domain/load";
import type { WaitResource } from "@gt/domain/resource";
import { readLoadSamples } from "@gt/kernel/resources/load";
import type { Reader, Store } from "@gt/kernel/store";

import { kernel } from "../../kernelProcess";
import { readNight } from "./store";
import type { Night } from "./types";

// A NIGHT'S LOAD - the box's minutes over the night's own window, read from the always-on worker's samples
// (kernel module "load", @gt/kernel/resources/load) and summarised against the operator's band
// (@gt/domain/load summarizeLoad; spark night-load-band, 2026-10-23). Computed on read, never stored.
//
// THE WINDOW runs from the night's startedAt to the LATEST of:
//   - closedAt, when the night closed;
//   - for a night still open, the deadline once it has passed, else now - a night whose loop died
//     without a close stops at its deadline instead of growing every morning it stays open;
//   - the end of the night's last job: the newest kernel event about any job the night launched
//     (`night.jobs`). A job record carries no end time of its own (@gt/domain/job); its events do -
//     every move a job makes is one event in the same transaction (kernel job.ts), so the newest is
//     when it last moved: settled, failed, interrupted. Work the night queued that ran on past the
//     close is the night's load, and the window follows it.
// No end is later than now. A night with no samples in its window is `undefined`, not a summary of
// zeros: a night before the sampler has no load to show, and the desk shows nothing for it.

/** The newest event about any of `jobs`, as epoch ms; undefined when the store holds none. */
function lastJobMs(r: Reader, jobs: readonly string[]): number | undefined {
  let last: number | undefined;
  for (const id of jobs) {
    const at = r.get("SELECT max(at) AS at FROM events WHERE subject_kind = 'job' AND subject_id = ?", id)?.["at"];
    const ms = typeof at === "string" ? Date.parse(at) : Number.NaN;
    if (Number.isFinite(ms) && (last === undefined || ms > last)) last = ms;
  }
  return last;
}

/** The night's window, by the rules above. */
export function nightWindow(r: Reader, night: Night, nowMs: number): { readonly fromMs: number; readonly toMs: number } {
  const fromMs = Date.parse(night.startedAt);
  const ends: number[] = [];
  if (night.closedAt !== undefined) ends.push(Date.parse(night.closedAt));
  if (night.state === "open") {
    const deadline = night.deadline === undefined ? Number.NaN : Date.parse(night.deadline);
    ends.push(Number.isFinite(deadline) && deadline < nowMs ? deadline : nowMs);
  }
  const job = lastJobMs(r, night.jobs);
  if (job !== undefined) ends.push(job);
  const end = Math.max(fromMs, ...ends.filter(Number.isFinite));
  return { fromMs, toMs: Math.min(end, nowMs) };
}

/** The night's load against the band; undefined when no sample falls in its window or the store cannot be read. */
export function nightLoad(store: Store, night: Night, nowMs: number = Date.now()): LoadSummary | undefined {
  const got = store.read((r) => {
    const w = nightWindow(r, night, nowMs);
    return { w, samples: readLoadSamples(r, w.fromMs, w.toMs) };
  });
  if (!got.ok) return undefined;
  const s = summarizeLoad(got.value.samples, got.value.w);
  return s.samples === 0 ? undefined : s;
}

/** The night's load in the process's own store (lib/kernelProcess.ts): the Board adapter's read. */
export function processNightLoad(night: Night): LoadSummary | undefined {
  const k = kernel();
  return k.ok ? nightLoad(k.value.store, night) : undefined;
}

/** The night `id`'s load, read from its record: the decided desk's door, where no adapter plans the packet any more. */
export async function nightLoadOf(store: Store, id: string, nowMs: number = Date.now()): Promise<LoadSummary | undefined> {
  try {
    return nightLoad(store, await readNight(id), nowMs);
  } catch {
    // A night not on disk (or mid-write) has no load to draw; the desk draws the rest without it.
    return undefined;
  }
}

/** The last minutes against the band, for `status` while a night runs: what to launch next. */
export type RecentLoad = {
  readonly minutes: number;
  readonly samples: number;
  /** Each banded resource's mean over the samples that read it; absent when none did. */
  readonly avg: { readonly cpu?: number; readonly ram?: number; readonly gpu?: number };
  readonly band: { readonly low: number; readonly high: number };
  /** The jobs admission held at the NEWEST sample, and on what - what waits now, not what waited. */
  readonly waiting: readonly { readonly jobId: string; readonly resource: WaitResource }[];
};

export function recentLoad(store: Store, nowMs: number, minutes = 15): RecentLoad {
  const fromMs = nowMs - minutes * 60_000;
  const got = store.read((r) => readLoadSamples(r, fromMs, nowMs));
  const samples: readonly LoadSample[] = got.ok ? got.value : [];
  const s = summarizeLoad(samples, { fromMs, toMs: nowMs });
  const avg = { ...(s.cpu.read === 0 ? {} : { cpu: s.cpu.avg }), ...(s.ram.read === 0 ? {} : { ram: s.ram.avg }), ...(s.gpu.read === 0 ? {} : { gpu: s.gpu.avg }) };
  let newest: LoadSample | undefined;
  for (const x of samples) if (x.atMs >= fromMs && x.atMs <= nowMs && (newest === undefined || x.atMs >= newest.atMs)) newest = x;
  return { minutes, samples: s.samples, avg, band: LOAD_BAND, waiting: newest?.waiting ?? [] };
}

/** The night's jobs left `interrupted` - an unknown outcome only the operator retries (kernel job.ts). */
export function interruptedOf(store: Store, night: Night): readonly string[] {
  const got = store.read((r) => night.jobs.filter((id) => r.get("SELECT state FROM jobs WHERE id = ?", id)?.["state"] === "interrupted"));
  return got.ok ? got.value : [];
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** `load (15 min) cpu 34% · ram 52% · gpu 8% - band 60-80%`, an unread resource named as unread. */
export function recentLine(l: RecentLoad): string {
  const band = `band ${Math.round(l.band.low * 100)}-${Math.round(l.band.high * 100)}%`;
  if (l.samples === 0) return `load (${l.minutes} min) no samples - ${band}`;
  const parts = (["cpu", "ram", "gpu"] as const).map((k) => {
    const v = l.avg[k];
    return `${k} ${v === undefined ? "unread" : pct(v)}`;
  });
  return `load (${l.minutes} min) ${parts.join(" · ")} - ${band}`;
}

/** `waiting: memory 2 · comfy-queue 1`, by resource; undefined when nothing waits. */
export function waitingLine(l: RecentLoad): string | undefined {
  if (l.waiting.length === 0) return undefined;
  const by = new Map<string, number>();
  for (const w of l.waiting) by.set(w.resource, (by.get(w.resource) ?? 0) + 1);
  return `waiting: ${[...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([r, k]) => `${r} ${k}`).join(" · ")}`;
}
