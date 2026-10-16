// The produce specimens' literal data (Phase 4, L28): one model option list, one plan, one
// receipt and its stale twin, one re-route preview - the prototype's figures with their own
// sources (studio.js CATALOG), a fixed clock, so the sheet draws the same every time.
import type { ModelOption, PlanPart, Receipt, ReceiptLine, RerouteOption } from "@gt/domain/produce";

export const NOW = Date.UTC(2026, 9, 15, 9, 12);
const at = (min: number): string => new Date(NOW + min * 60_000).toISOString();

const opt = (key: string, lane: ModelOption["lane"], provider: string, model: string, label: string, sec: number, usd: number | null, src: ModelOption["src"], extra: Partial<ModelOption> = {}): ModelOption => ({
  key,
  lane,
  provider,
  model,
  label,
  secondsPerUnit: sec,
  usdPerUnit: usd,
  src,
  basis: { seconds: { src, note: "prototype studio.js CATALOG" }, usd: { src, note: "prototype studio.js CATALOG" } },
  ...extra,
});

export const FRAMES: readonly ModelOption[] = [
  opt("frames/comfy/flux", "gpu.local", "comfy", "flux-2-dev-fp8", "Flux 2 dev fp8 · ComfyUI", 96, 0, "model"),
  opt("frames/google/nano", "cloud.google", "google", "nano-banana", "Nano Banana", 21, 0.04, "illustrative"),
  opt("frames/leonardo/phoenix", "cloud.leonardo", "leonardo", "phoenix", "Leonardo · image", 30, 0.06, "illustrative"),
];
const SCORE: readonly ModelOption[] = [
  opt("score/suno/v6", "box.chrome", "suno", "v6", "Suno v6 · serial", 240, null, "model", { unpricedReason: "Suno bills subscription credits, not dollars" }),
  opt("score/elevenlabs/music", "cloud.elevenlabs", "elevenlabs", "music", "ElevenLabs · music", 90, 0.36, "illustrative"),
];
const RESEARCH: readonly ModelOption[] = [
  opt("research/claude-cli/research", "seat.text", "claude-cli", "research", "text CLI · research turn", 540, null, "illustrative", { unpricedReason: "billed to the operator's text seat" }),
  opt("research/google/grounded", "cloud.google", "google", "gemini-grounded", "Gemini · grounded search", 240, 0.27, "illustrative"),
];
const sched = (s: number, e: number, q: number | null) => ({ schedule: { start: at(s), end: at(e), queuePos: q } });

export const PLAN: readonly PlanPart[] = [
  { id: "p:research", label: "research", after: [], state: "ratified", kind: "research", units: 1, unitNoun: "brief", options: RESEARCH, chosen: "research/claude-cli/research", estimate: { seconds: 540, usd: null, unpricedReason: "billed to the operator's text seat", src: "illustrative" }, ...sched(-90, -81, null) },
  { id: "p:frames", label: "frames", after: ["p:research"], state: "draft", kind: "frames", units: 24, unitNoun: "plate", unitsRange: [1, 200], options: FRAMES, chosen: "frames/comfy/flux", estimate: { seconds: 2304, usd: 0, src: "model" }, ...sched(20, 58, 2) },
  { id: "p:gate:frames", label: "verdict · frames", after: ["p:frames"], state: "draft", kind: "gate", judges: "p:frames", verdict: "matrix-cull", ...sched(58, 78, null) },
  { id: "p:score", label: "score", after: ["p:research"], state: "draft", kind: "score", units: 2, unitNoun: "prompt", unitsRange: [1, 200], options: SCORE, chosen: "score/suno/v6", estimate: { seconds: 480, usd: null, unpricedReason: "Suno bills subscription credits, not dollars", src: "model" }, ...sched(20, 28, 1) },
  { id: "p:slot", label: "slot", after: ["p:gate:frames", "p:score"], state: "draft", kind: "slot", ...sched(78, 88, null) },
];

const line = (key: string, label: string, o: ModelOption, units: number, s: number, q: number, extra: Partial<ReceiptLine> = {}): ReceiptLine => ({
  key,
  label,
  lane: o.lane,
  provider: o.provider,
  model: o.model,
  units,
  seconds: o.secondsPerUnit * units,
  usd: o.usdPerUnit === null ? null : Math.round(o.usdPerUnit * units * 100) / 100,
  ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
  src: o.src,
  queuePos: q,
  start: at(s),
  end: at(s + (o.secondsPerUnit * units) / 60),
  ...extra,
});

const frames = FRAMES[0] ?? FRAMES[1];
const suno = SCORE[0];

export const RECEIPT: Receipt | null =
  frames === undefined || suno === undefined
    ? null
    : {
        token: "kit-a",
        subject: { kind: "project", id: "kit", rev: 3 },
        mode: "dry",
        lines: [line("p:frames", "frames", frames, 24, 20, 2), line("p:score", "score", suno, 2, 20, 1)],
        totals: { seconds: 2784, usd: 0, unpriced: 1, src: "model" },
        queuePos: 2,
        etaAt: at(58),
        overCeiling: false,
        readAt: at(0),
      };

/** The same receipt read again after another launch took the GPU box first: a stale confirm's answer. */
export const STALE: Receipt | null =
  RECEIPT === null || frames === undefined || suno === undefined
    ? null
    : { ...RECEIPT, token: "kit-b", lines: [line("p:frames", "frames", frames, 24, 52, 3), line("p:score", "score", suno, 2, 20, 1)], queuePos: 3, etaAt: at(90) };

export const REROUTE: readonly RerouteOption[] = FRAMES.map((o, i) => ({ option: o, current: i === 0, dEtaS: [0, -1860, -1500][i] ?? 0, dUsd: [0, 0.96, 1.44][i] ?? 0, queuePos: [2, 1, 1][i] ?? 1 }));
