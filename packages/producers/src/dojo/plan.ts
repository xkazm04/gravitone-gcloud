import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { MissingStep } from "@gt/kernel/job-core";

// A DOJO CYCLE'S PLAN, PURE (Phase 4, L34) - which bill a cycle runs up, and which
// of its units are still missing.
//
// STACK PURITY, KEPT (pipeline/foundry/dojo_run.py, operator 2026-09-01): a cycle
// names its stack - `local` (Flux/Wan/H3 pixels, the Ollama eye, $0) or `google`
// (Nano Banana pixels, Gemini eyes, billed) - and a spec that names neither is
// refused, never guessed: "the wrapper never guesses which bill it is running up".
// The stack decides the LANE (plan §3.1: a lane is declared, never inferred):
// local -> gpu.local, performed in Python by pipeline/foundry/worker.py; google ->
// cloud.google, performed here in Node (./define.ts), because every paid call is
// the meter's and the Python protocol books no money.
//
// THE LOCAL PLAN has a Python twin (pipeline/foundry/dojo_job.py `plan`); ./plan-
// cases.json holds both to the same answers. Every render, then every readback -
// ComfyUI and the annotator each take the card once - in the runner's own render
// order (the serial-lane runner renders every wan clip before any H3 one). A file
// on disk is a finished render, a key in readbacks.json a finished readback (v1's
// resume rule). `abandoned`: ComfyUI could not be recycled after a failure this
// drive, so no more renders are planned in it; the readbacks still are.
//
// THE GOOGLE PLAN is v1 dojo-pairs-nb.mts's walk: per duo and arm, one generate
// call for all `repeats` candidates (Google's API rejects `seed`, so the control
// is repeats judged as distributions, never one roll against another), then one
// readback per candidate. An arm with all its PNGs on disk is not re-billed.

export type DojoStack = "local" | "google";
export type DojoMedia = "image" | "video" | "video-serial-lanes";

type Arm = { readonly prompt?: unknown; readonly engine?: unknown };
export type GenSpecView = {
  readonly stack?: unknown;
  readonly media?: unknown;
  readonly repeats?: unknown;
  readonly aspect?: unknown;
  readonly pairs?: readonly { readonly id: string; readonly baseline?: Arm; readonly challenger?: Arm }[];
};

export const ARMS = ["baseline", "challenger"] as const;
export type ArmName = (typeof ARMS)[number];

/** dojo_run.py's dispatch: a video spec whose arms name their engine is the serial-lane runner's. */
export function mediaOf(spec: GenSpecView): string {
  const media = typeof spec.media === "string" ? spec.media : "image";
  const engines = (spec.pairs ?? []).some((p) => ARMS.some((a) => p[a]?.engine !== undefined && p[a]?.engine !== null && p[a]?.engine !== ""));
  return media === "video" && engines ? "video-serial-lanes" : media;
}

const RUNNERS: Readonly<Record<string, { readonly lane: ResourceLane; readonly runner: string }>> = {
  "local/image": { lane: "gpu.local", runner: "dojo_pairs.py" },
  "local/video": { lane: "gpu.local", runner: "dojo_video.py" },
  "local/video-serial-lanes": { lane: "gpu.local", runner: "dojo_video_h3.py" },
  "google/image": { lane: "cloud.google", runner: "dojo-pairs-nb (metered)" },
};

export type Runner = { readonly stack: DojoStack; readonly media: DojoMedia; readonly lane: ResourceLane; readonly runner: string };

/** Which runner and lane a gen-spec declares, or the refusal in v1's words. */
export function runnerOf(spec: GenSpecView): Result<Runner> {
  const stack = spec.stack;
  if (stack !== "local" && stack !== "google") {
    return err("invalid", `gen-spec.json declares stack=${JSON.stringify(stack ?? null)} — a cycle names 'local' or 'google' explicitly; the wrapper never guesses which bill it is running up.`);
  }
  const media = mediaOf(spec);
  const r = RUNNERS[`${stack}/${media}`];
  if (r === undefined || (media !== "image" && media !== "video" && media !== "video-serial-lanes")) {
    return err("invalid", `no runner for stack=${stack} media=${media} — google video has no lane; see the overlay's video section.`);
  }
  return ok({ stack, media, lane: r.lane, runner: r.runner });
}

/* ── local (Python performs; this is the receipt's twin) ───────────────────── */

export type LocalUnit = { readonly key: string; readonly rendered: boolean; readonly read: boolean };

export function dojoLocalSteps(units: readonly LocalUnit[], booked: ReadonlySet<string>, opts: { readonly abandoned?: boolean } = {}): string[] {
  const steps = opts.abandoned === true ? [] : units.filter((u) => !u.rendered).map((u) => `render:${u.key}`);
  for (const u of units) if (u.rendered && !u.read) steps.push(`readback:${u.key}`);
  return steps.filter((s) => !booked.has(s));
}

/** The local runners' render order (dojo_video_h3.py `order`: every wan clip, then every H3 one). */
export function localOrder(spec: GenSpecView, media: DojoMedia): { readonly pair: string; readonly arm: ArmName }[] {
  const units = (spec.pairs ?? []).flatMap((p) => ARMS.map((arm) => ({ pair: p.id, arm, engine: p[arm]?.engine })));
  const ordered = media === "video-serial-lanes" ? [...units.filter((u) => (u.engine || "wan") === "wan"), ...units.filter((u) => (u.engine || "wan") !== "wan")] : units;
  return ordered.map(({ pair, arm }) => ({ pair, arm }));
}

/**
 * The receipt's pace for a local unit. A still on Flux 2 is the forge's plate
 * (96 s, illustrative in @gt/catalog); a Wan clip is minutes (dojo_video.py: "a
 * 121-frame decode is minutes on its own") - five assumed; an H3 clip pays its
 * first load once (~70 min, measured 2026-09-03) and is minutes warm - eight
 * assumed. A readback is a read per still (three per clip). None is a measurement.
 */
export function localPace(media: DojoMedia): { readonly render: number; readonly readback: number } {
  if (media === "image") return { render: 96, readback: 24 };
  return { render: media === "video" ? 300 : 480, readback: 72 };
}

/**
 * What is left of the WHOLE cycle, for the receipt: every unit without a file is a
 * render, every unit without a readback a read - including the reads of renders
 * not yet made, which the next drive's step list cannot plan yet.
 */
export function dojoLocalWork(units: readonly LocalUnit[], media: DojoMedia): { readonly renders: number; readonly reads: number; readonly seconds: number } {
  const pace = localPace(media);
  const renders = units.filter((u) => !u.rendered).length;
  const reads = units.filter((u) => !u.read).length;
  return { renders, reads, seconds: renders * pace.render + reads * pace.readback };
}

/* ── google (Node performs, metered) ──────────────────────────────────────── */

export type GoogleArmView = {
  readonly key: string;
  /** Which of its `repeats` candidates are on disk, r1..rN. */
  readonly have: readonly boolean[];
  /** Which have a readback in readbacks.json. */
  readonly read: readonly boolean[];
};

export type GoogleEstimates = { readonly perImageUsd: number; readonly readbackUsd: number };

export const googleRepeats = (spec: GenSpecView): number => {
  const r = spec.repeats;
  return typeof r === "number" && Number.isInteger(r) && r >= 1 ? r : 3;
};

/** v1 dojo-pairs-nb.mts's walk, as missing steps: an arm's generate, then each of its readbacks. */
export function dojoGooglePlan(arms: readonly GoogleArmView[], booked: ReadonlySet<string>, est: GoogleEstimates): MissingStep[] {
  const out: MissingStep[] = [];
  for (const a of arms) {
    const n = a.have.length;
    const whole = a.have.every(Boolean);
    const gen = `generate:${a.key}`;
    if (!whole && !booked.has(gen)) out.push({ name: gen, estimate: { seconds: 20, usd: usd6(est.perImageUsd * n) } });
    for (let i = 0; i < n; i++) {
      // A readback waits for its pixels: planned when the PNG is on disk, or will be once this arm's generate books.
      const step = `readback:${a.key}--r${i + 1}`;
      if (a.read[i] === true || booked.has(step)) continue;
      if (a.have[i] === true || !whole) out.push({ name: step, estimate: { seconds: 6, usd: est.readbackUsd } });
    }
  }
  return out;
}

const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/* ── identity ─────────────────────────────────────────────────────────────── */

const CYCLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function dojoJobId(cycleId: string, k = 1): string {
  if (!CYCLE_ID.test(cycleId)) throw new AppError("invalid", `not a dojo cycle id: ${JSON.stringify(cycleId)}`);
  return k === 1 ? `job:run:dojo:${cycleId}` : `job:run:dojo:${cycleId}~${k}`;
}

/** The Run a dojo job serves (`of.id`): its cycle, named for its producer. */
export const dojoRunOf = (cycleId: string): string => `dojo:${cycleId}`;

export function cycleOf(runId: string): string {
  return runId.startsWith("dojo:") ? runId.slice("dojo:".length) : runId;
}
