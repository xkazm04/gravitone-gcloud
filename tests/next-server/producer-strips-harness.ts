import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import type { Holder, RunMode } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { enqueue } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { standInPage } from "../../lib/foundry/strips/author.ts";
import { DEFAULT_OPTIONS, DEFAULT_SELECTION, loadApproaches, selectCards, type CardSelection } from "../../lib/foundry/strips/cards.ts";
import { saveStripRun } from "../../lib/foundry/strips/store.ts";
import type { Capture } from "../../lib/foundry/strips/steps.ts";
import type { StripRun, StripRunOptions } from "../../lib/foundry/strips/types.ts";
import type { StripsBinding, StripsKernel } from "../../lib/producers/strips.ts";

// THE STRIPS PRODUCER'S TEST WORLD - a temp strips store (STRIPS_STORE_DIR) and catalogue
// (FOUNDRY_DIR), temp kernel files, and three counted fakes: the seat, the capture and the
// image router. The approach cards, briefs and CONTRACT.md are the repo's own, read only.
// Nothing here can reach a vendor: the live seat is `seat` below, never cliSeam's.

export const ROOT = mkdtempSync(path.join(os.tmpdir(), "gt-l33-strips-"));
process.env["STRIPS_STORE_DIR"] = path.join(ROOT, "strips");
process.env["FOUNDRY_DIR"] = path.join(ROOT, "catalogue");
mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });

export function disposeRoot(): void {
  rmSync(ROOT, { recursive: true, force: true });
}

export const operator: Actor = { kind: "operator", id: "kazda" };
export const hostA: Holder = { bootId: "boot-a", pid: 501, host: "box" };
export const hostB: Holder = { bootId: "boot-b", pid: 502, host: "box" };
export const RUN = { holder: hostA, alive: () => true, sleep: async () => {} } as const;
export const T0 = Date.parse("2026-10-16T09:00:00.000Z");
export const LIVE: RunMode = { kind: "live", arm: { by: operator, at: "2026-10-16T09:00:00.000Z", reason: "test: fakes only" } };
export const DRY: RunMode = { kind: "dry" };

let k = 0;
export const storeFile = (): string => path.join(ROOT, `kernel-${++k}.sqlite`);

export type World = { kernel: Kernel; file: string; clock: { ms: number }; strips: StripsKernel };
const live = new Set<Kernel>();
export function closeAll(): void {
  for (const x of [...live]) x.close();
}
export function open(file = storeFile(), clock = { ms: T0 }): World {
  const r = openKernel(file, { clock: () => new Date(clock.ms), snapshotDir: path.dirname(file) });
  if (!r.ok) throw r.error;
  const raw = r.value;
  const kernel: Kernel = { ...raw, close: () => void (live.delete(kernel) && raw.close()) };
  live.add(kernel);
  return { kernel, file, clock, strips: { store: kernel.store, fx: liveEffects(kernel.store, blobStore(`${file}.blobs`)) } };
}

/* ── the fakes ─────────────────────────────────────────────────────────────── */

export type SeatScript = {
  costUsd?: number;
  /** Cards whose turns die without a page (`errored`, still billed). */
  fail?: ReadonlySet<string>;
  /** Cards whose author turn writes a page the lint refuses. */
  lintBad?: ReadonlySet<string>;
  /** Every turn answers `unavailable` with no cost: the seat never served. */
  unavailable?: boolean;
  seatLimit?: boolean;
  /** Fix/review turns change nothing. */
  unchanged?: boolean;
  gate?: () => Promise<void>;
};

export type Seat = { calls: string[]; costs: number[]; caps: (number | undefined)[]; seat: (input: RunAgentInput) => Promise<AgentResult> };

export function fakeSeat(s: SeatScript = {}): Seat {
  const calls: string[] = [];
  const costs: number[] = [];
  const caps: (number | undefined)[] = [];
  const seat = async (input: RunAgentInput): Promise<AgentResult> => {
    const card = path.basename(input.cwd);
    const fix = input.prompt.startsWith("You are revising");
    calls.push(`${fix ? "fix" : "author"}:${card}`);
    caps.push(input.maxBudgetUsd);
    await s.gate?.();
    const base = { final: "", turns: 3, durationMs: 1000, exitCode: 0 };
    if (s.unavailable) return { ...base, outcome: "unavailable", errors: ["claude: command not found"], exitCode: null };
    if (s.seatLimit) return { ...base, outcome: "seat-limit", errors: ["usage limit reached"], costUsd: 0.1 };
    const cost = s.costUsd ?? 1.25;
    costs.push(cost);
    if (s.fail?.has(card)) return { ...base, outcome: "errored", errors: ["exited 1"], costUsd: cost };
    const out = path.join(input.cwd, "out", "strip.html");
    const lane = card.startsWith("stat-") ? "stat" : "edu";
    if (!fix) writeFileSync(out, s.lintBad?.has(card) ? standInPage(lane).replace("window.STRIP_READY = true;", "var t = Date.now(); window.STRIP_READY = true;") : standInPage(lane));
    else if (!s.unchanged) writeFileSync(out, `${standInPage(lane)}<!-- fixed ${calls.length} -->`);
    writeFileSync(path.join(input.cwd, "out", "style.json"), "{}");
    return { ...base, outcome: "completed", errors: [], costUsd: cost };
  };
  return { calls, costs, caps, seat };
}

export type Cap = { renders: string[]; capture: () => Promise<Capture> };

/** A capture that takes no frames: `failing` cards fail their gates on their first `n` renders. */
export function fakeCapture(failing: ReadonlyMap<string, number> = new Map()): Cap {
  const renders: string[] = [];
  const seen = new Map<string, number>();
  const capture: Capture = {
    async render(o) {
      const card = path.basename(o.outDir);
      renders.push(card);
      const n = (seen.get(card) ?? 0) + 1;
      seen.set(card, n);
      const bad = n <= (failing.get(card) ?? 0);
      const g = { ok: true, detail: "fake" };
      return { ok: true, gates: { seek: g, legibility: bad ? { ok: false, detail: "smallest 18px" } : g, motion: g, length: g }, files: { mp4: "strip.mp4", webm: "strip.webm", poster: "poster.jpg", sheet: "sheet.png" }, renderMs: 7 };
    },
    async distances(sheets) {
      return sheets.map((_, i) => sheets.map((__, j) => (i === j ? 0 : 1 + i + j)));
    },
  };
  return { renders, capture: async () => capture };
}

export type Image = { calls: string[]; make: NonNullable<StripsBinding["image"]> };
export function fakeImage(costUsd = 0.03): Image {
  const calls: string[] = [];
  return {
    calls,
    make: async (a, _lane, base) => {
      calls.push(a.id);
      mkdirSync(path.dirname(base), { recursive: true });
      writeFileSync(`${base}.png`, "png");
      return { file: `${base}.png`, provider: "fake/pixels", costUsd };
    },
  };
}

/* ── a run and its job, without the receipt ───────────────────────────────── */

let n = 0;
/**
 * A run on disk and its job enqueued directly - what `launchStrips` leaves after a confirm,
 * minus the Run row. The drive tests stand on it so they do not wait on the receipt.
 */
export async function seed(w: World, mode: RunMode, sel: Partial<CardSelection>, o: { options?: Partial<StripRunOptions>; ceilingUsd?: number } = {}): Promise<{ runId: string; jobId: string }> {
  const runId = `strips-test-${++n}`;
  const jobId = `job:run:${runId}`;
  const picked = selectCards(loadApproaches(), { ...DEFAULT_SELECTION, ...sel });
  const m: StripRun = {
    version: 1,
    id: runId,
    at: "2026-10-16T09:00:00.000Z",
    width: { edu: 1920, stat: 1080 },
    height: { edu: 1080, stat: 1920 },
    fps: 30,
    frames: 240,
    approaches: picked.map((p) => p.approach).filter((a) => a.id !== "CTRL"),
    cards: picked.map((p) => p.card),
    status: "running",
    job: jobId,
    options: { ...DEFAULT_OPTIONS, ...o.options },
    ...(mode.kind === "dry" ? { dry: true } : {}),
  };
  mkdirSync(path.join(ROOT, "strips", runId), { recursive: true });
  await saveStripRun(m);
  const q = enqueue(w.kernel.store, { id: jobId, of: { kind: "run", id: runId }, producer: "strips", lane: "seat.text", mode, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }), correlation: { runId } }, operator);
  if (!q.ok) throw q.error;
  return { runId, jobId };
}
