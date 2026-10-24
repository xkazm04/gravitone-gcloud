// THE STRIP JOB'S STEPS ON DISK - what each step of a strip job does to run.json and the
// card's directory. Server only. The producer (packages/producers/src/strips) decides which
// step is next and what its outcome means; these do the work, exactly as v1's per-card loop
// did it (pipeline/strips/run.mts `runCard` before Phase 4), one step per call:
//
//   prepare   the workspace and the feedback a fix or review turn is shown (v1 `feedbackText`)
//   land      the page a turn left, copied onto the card; its time and its reported cost added
//   lint      the frame-purity lint (./lint.ts) - a failure is the card's `lint-failed`
//   render    the headless capture and its four gates (pipeline/strips/render.mts)
//   asset     one supporting image per approach, cached on disk under _assets/ (v1's cache)
//   triage    replica discrimination, then the run handed to the Strips tab
//
// EVERY WRITE IS FENCED: `io.stillHeld()` is asked before run.json is written, so a driver
// whose slot was taken over writes nothing (kernel lease). A write also marks the run
// `running` again - a retried job after its run was handed to triage is driving it.
//
// LANDING IS THE MARKER (delivery-guarantees: marker-certifies-what-was-done). `land` writes
// the page into the card BEFORE it records the round on run.json, and the plan adopts a turn
// whose round run.json records (plan.ts `landed`): a process that died between the seat's
// answer and the job's booking does not buy the turn again.

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { AssetCall, AssetServed, StepIO, TurnStep, CardWork } from "@gt/producers/strips/define";
import type { RunView } from "@gt/producers/strips/plan";

import type { AgentResult } from "../../agent/cliSeam";
import { estimatePerImage } from "../../imaging/pricing";
import { assetRequest, collectTurn, prepareTurn, type StripTurn } from "./author";
import { approachOfCard, DEFAULT_OPTIONS } from "./cards";
import { formatLint, lintStrip } from "./lint";
import { readStripRunNow, saveStripRun, stripRunDir } from "./store";
import type { Approach, StripCard, StripGates, StripLane, StripRun } from "./types";

/** The headless capture (pipeline/strips/render.mts), behind a seam a test can fill. */
export type Capture = {
  render(o: { htmlPath: string; outDir: string; lane: StripLane }): Promise<{ ok: boolean; gates?: StripGates; files: StripCard["files"]; renderMs: number; error?: string }>;
  /** Pairwise contact-sheet distances (render.mts `sheetDistances`). */
  distances(sheets: string[]): Promise<number[][]>;
};

/** The image router's generate, behind the same seam (./author.ts `makeAsset`). */
export type ImageMaker = (approach: Approach, lane: StripLane, fileBase: string) => Promise<AssetServed>;

/** A 1x1 PNG: what a dry supporting image "draws". */
const STAND_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** When no per-image rate is declared: Nano Banana's 1K rate, the dearest the studio used (2026-10). */
const FALLBACK_IMAGE_USD = 0.04;

export const assetUsd = (): number => estimatePerImage().usd ?? FALLBACK_IMAGE_USD;

const pipelineDir = (): string => path.join(process.cwd(), "pipeline", "strips");
const cardDir = (runId: string, cardId: string): string => path.join(stripRunDir(runId), cardId);
const htmlOf = (runId: string, cardId: string): string => path.join(cardDir(runId, cardId), "strip.html");

/** The plan's view of a run: its cards, and whether each card's page is on disk. Synchronous. */
export function viewOf(m: StripRun): RunView {
  const o = m.options ?? DEFAULT_OPTIONS;
  return {
    id: m.id,
    status: m.status,
    rounds: o.rounds,
    review: o.review,
    assetUsd: assetUsd(),
    cards: m.cards.map((c) => ({
      id: c.id,
      approach: c.approach,
      asset: o.leonardo && (approachOfCard(m.approaches, c)?.leonardo ?? "none") !== "none",
      html: existsSync(htmlOf(m.id, c.id)),
      rounds: c.rounds,
      status: c.status,
    })),
  };
}

function cardOf(m: StripRun, id: string): StripCard {
  const c = m.cards.find((x) => x.id === id);
  if (c === undefined) throw new AppError("not-found", `strip run ${m.id} has no card ${id}`);
  return c;
}

/** Change one card (or the run) and write run.json and the card's meta.json, fenced. */
async function patch(runId: string, io: StepIO, fn: (m: StripRun) => StripCard | undefined): Promise<void> {
  const m = readStripRunNow(runId);
  const card = fn(m);
  if (m.status !== "committed") m.status = "running";
  io.stillHeld();
  await saveStripRun(m);
  if (card !== undefined) {
    await mkdir(cardDir(runId, card.id), { recursive: true });
    await writeFile(path.join(cardDir(runId, card.id), "meta.json"), JSON.stringify(card, null, 2));
  }
}

function feedbackText(card: StripCard, lint: readonly string[]): string {
  const g = card.gates;
  const lines = [`# Render ${card.rounds + 1} of your strip`, ""];
  if (lint.length) lines.push("## Lint errors (the strip was NOT rendered)", ...lint.map((l) => `- ${l}`), "");
  if (card.error) lines.push("## Render error", card.error, "");
  if (g) {
    lines.push("## Automated gates");
    for (const [k, v] of Object.entries(g)) lines.push(`- ${k}: ${v.ok ? "pass" : "FAIL"} - ${v.detail}`);
    lines.push("");
  }
  lines.push("inputs/sheet.png, if present, is a 4x3 contact sheet of frames 0, 20, 40 ... 220 (read left to right, top to bottom).");
  return lines.join("\n");
}

/** The supporting image already on disk for an approach (v1's cache), if any. */
function cachedAsset(runId: string, approach: string): string | undefined {
  const base = path.join(stripRunDir(runId), "_assets", approach);
  return ["png", "jpg", "webp"].map((ext) => `${base}.${ext}`).find((f) => existsSync(f));
}

export async function prepare(runId: string, step: TurnStep): Promise<StripTurn> {
  const m = readStripRunNow(runId);
  const card = cardOf(m, step.card);
  const approach = approachOfCard(m.approaches, card);
  if (approach === undefined) throw new AppError("not-found", `strip run ${runId}: card ${card.id} names approach ${card.approach}, which the run does not carry`);
  const briefPath = path.join(pipelineDir(), "data", `${approach.case}.json`);
  if (!existsSync(briefPath)) throw new AppError("not-found", `no data fixture at pipeline/strips/data/${approach.case}.json`);
  const brief: unknown = JSON.parse(await readFile(briefPath, "utf8"));
  const html = htmlOf(runId, card.id);
  const dir = cardDir(runId, card.id);
  const asset = (m.options ?? DEFAULT_OPTIONS).leonardo ? cachedAsset(runId, approach.id) : undefined;
  const feedback =
    step.kind === "author"
      ? undefined
      : card.status === "lint-failed"
        ? { text: feedbackText(card, card.lint ?? []), current: html, style: path.join(dir, "style.json") }
        : { text: feedbackText(card, []), sheet: path.join(dir, "sheet.png"), current: html, style: path.join(dir, "style.json") };
  return prepareTurn({
    ws: path.join(stripRunDir(runId), "_ws", card.id),
    lane: approach.lane,
    brief,
    approach,
    effort: card.effort,
    ...(asset === undefined ? {} : { asset }),
    ...(feedback === undefined ? {} : { feedback }),
    timeoutMin: (m.options ?? DEFAULT_OPTIONS).authorTimeoutMin,
  });
}

/** The lane a card is drawn at, for the dry stand-in's page size. */
export function laneOf(runId: string, cardId: string): StripLane {
  return cardOf(readStripRunNow(runId), cardId).lane;
}

export async function land(runId: string, step: TurnStep, turn: StripTurn, r: AgentResult, io: StepIO): Promise<{ ok: boolean; changed: boolean }> {
  const got = await collectTurn(turn);
  const dir = cardDir(runId, step.card);
  const html = htmlOf(runId, step.card);
  const hadPage = existsSync(html);
  const account = (c: StripCard): void => {
    c.authorMs += r.durationMs;
    const cost = (c.costUsd ?? 0) + (r.costUsd ?? 0);
    if (cost > 0) c.costUsd = cost;
  };
  if (r.outcome !== "completed" || got.html === undefined) {
    // v1: an author turn that left nothing is `author-failed`; a failed fix keeps the last good render.
    const failedAuthor = step.round === 0 || !hadPage;
    await patch(runId, io, (m) => {
      const c = cardOf(m, step.card);
      account(c);
      if (failedAuthor) {
        c.status = "author-failed";
        c.error = `${r.outcome}: ${r.errors.join(" | ") || "no out/strip.html written"}`;
      }
      return c;
    });
    return { ok: false, changed: false };
  }
  await mkdir(dir, { recursive: true });
  io.stillHeld();
  await copyFile(got.html, html);
  if (got.style !== undefined) await copyFile(got.style, path.join(dir, "style.json"));
  await patch(runId, io, (m) => {
    const c = cardOf(m, step.card);
    account(c);
    if (step.kind === "author") {
      c.rounds = 0;
      delete c.error;
    } else c.rounds = step.round;
    c.files = { ...c.files, html: "strip.html", ...(got.style === undefined ? {} : { style: "style.json" }) };
    return c;
  });
  return { ok: true, changed: got.changed };
}

export async function lint(runId: string, step: CardWork, io: StepIO): Promise<{ ok: boolean; findings: string[] }> {
  const findings = formatLint(lintStrip(await readFile(htmlOf(runId, step.card), "utf8")));
  await patch(runId, io, (m) => {
    const c = cardOf(m, step.card);
    if (findings.length === 0) {
      delete c.lint;
      return c;
    }
    c.lint = findings;
    c.status = "lint-failed";
    delete c.gates;
    delete c.error;
    return c;
  });
  return { ok: findings.length === 0, findings };
}

const DRY_GATE = { ok: true, detail: "dry stand-in: no capture was taken" };

export async function render(runId: string, step: CardWork, io: StepIO, capture: () => Promise<Capture>): Promise<{ ok: boolean; pass: boolean; error?: string }> {
  const lane = laneOf(runId, step.card);
  const r = io.dry
    ? { ok: true, gates: { seek: DRY_GATE, legibility: DRY_GATE, motion: DRY_GATE, length: DRY_GATE }, files: {}, renderMs: 0 }
    : await (await capture()).render({ htmlPath: htmlOf(runId, step.card), outDir: cardDir(runId, step.card), lane });
  await patch(runId, io, (m) => {
    const c = cardOf(m, step.card);
    c.renderMs += r.renderMs;
    if (r.gates === undefined) delete c.gates;
    else c.gates = r.gates;
    if (r.error === undefined) delete c.error;
    else c.error = r.error;
    c.status = r.ok ? "rendered" : "render-failed";
    c.files = { ...c.files, ...r.files };
    return c;
  });
  const g = r.gates;
  const pass = r.ok && g !== undefined && g.seek.ok && g.legibility.ok && g.motion.ok && g.length.ok;
  return { ok: r.ok, pass, ...(r.error === undefined ? {} : { error: r.error }) };
}

export async function asset(runId: string, approachId: string, call: (c: AssetCall) => Promise<AssetServed>, io: StepIO, make: ImageMaker): Promise<EventData> {
  const m = readStripRunNow(runId);
  const approach = m.approaches.find((a) => a.id === approachId);
  if (approach === undefined) throw new AppError("not-found", `strip run ${runId} carries no approach ${approachId}`);
  const cached = cachedAsset(runId, approachId);
  const base = path.join(stripRunDir(runId), "_assets", approachId);
  let served: AssetServed;
  if (cached !== undefined) served = { file: cached, provider: "leonardo (cached)" };
  else {
    try {
      served = await call({
        payload: assetRequest(approach, approach.lane),
        live: () => make(approach, approach.lane, base),
        stand: async () => {
          await mkdir(path.dirname(base), { recursive: true });
          await writeFile(`${base}.png`, Buffer.from(STAND_PNG, "base64"));
          return { file: `${base}.png`, provider: "dry/stand-in", costUsd: 0 };
        },
      });
    } catch (e) {
      // v1: the strip renders without it. A process death is not an Error and is not ours.
      if (!(e instanceof Error)) throw e;
      return { ok: false, approach: approachId, error: e.message };
    }
  }
  const rel = path.relative(stripRunDir(runId), served.file).replace(/\\/g, "/");
  await patch(runId, io, (run) => {
    for (const c of run.cards) if (c.approach === approachId) c.asset = { file: rel, provider: served.provider, ...(served.costUsd === undefined ? {} : { costUsd: served.costUsd }) };
    return undefined;
  });
  return { ok: true, approach: approachId, file: rel, provider: served.provider };
}

/** Replica discrimination (v1, unchanged), then the run is the operator's: awaiting triage. */
export async function triage(runId: string, io: StepIO, capture: () => Promise<Capture>): Promise<EventData> {
  const m = readStripRunNow(runId);
  const disc: Record<string, number | null> = { ...(m.discrimination ?? {}) };
  if (!io.dry) {
    for (const rep of m.cards.filter((c) => c.replicaOf && c.id.endsWith("--r2") && c.status === "rendered")) {
      const orig = m.cards.find((c) => c.id === rep.replicaOf && c.status === "rendered");
      if (!orig) continue;
      // Peers share the case: across cases the content, not the style, would dominate the distance.
      const peers = m.cards.filter((c) => c.case === orig.case && c.status === "rendered" && !c.replicaOf && c.id !== orig.id);
      if (!peers.length) continue;
      const d = await (await capture()).distances([orig, rep, ...peers].map((c) => path.join(cardDir(runId, c.id), "sheet.png")));
      const row = d[0] ?? [];
      const noise = row[1] ?? 0;
      const between = row.slice(2).reduce((s, x) => s + x, 0) / peers.length;
      // A replica identical to its original leaves no noise floor to divide by. JSON has no
      // Infinity (it wrote null and the findings crashed on it), so the gap is written as null.
      disc[orig.approach] = noise > 0 ? Math.round((between / noise) * 100) / 100 : null;
    }
  }
  const rendered = m.cards.filter((c) => c.status === "rendered").length;
  m.discrimination = disc;
  m.status = "awaiting-triage";
  delete m.error;
  io.stillHeld();
  await saveStripRun(m);
  return { status: "awaiting-triage", cards: m.cards.length, rendered };
}
