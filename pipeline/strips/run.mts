// THE STRIP RUN — author, lint, render and gate a set of approach cards, and
// leave foundry-out/strips/<run>/ ready for triage in /foundry (Strips tab).
// Plan: docs/code-rendered-strips-plan.md. Contract: pipeline/strips/CONTRACT.md.
//
//   npx tsx pipeline/strips/run.mts --controls-only                 # P2: one control per case
//   npx tsx pipeline/strips/run.mts --only E05,S06 --replicas E05,S06 # a pilot
//   npx tsx pipeline/strips/run.mts --lane all --replicas E02,E07,E13,E18,S02,S07,S13,S18 \
//        --effort-arm E10,S06,S19 --run strips-r1                   # the full round
//   ... --resume --run strips-r1                                    # continue after a crash
//
// Spends the operator's Claude seat (one author turn per card, plus fix turns)
// and up to one Leonardo image per card that declares one. --dry lists the
// cards and spends nothing.

import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Approach, StripCard, StripLane, StripRun } from "../../lib/foundry/strips/types";
import { STRIP_FPS, STRIP_FRAMES, STRIP_SIZE } from "../../lib/foundry/strips/types";
import { authorStrip, makeAsset } from "./author.mjs";
import { formatLint, lintStrip } from "./lint.mjs";
import { launchHeadless, renderStrip, sheetDistances } from "./render.mjs";

function loadEnv(file = ".env.local") {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const argv = process.argv.slice(2);
const arg = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const list = (k: string) => (arg(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const flag = (k: string) => argv.includes(k);

const STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
const RUN_ID = arg("--run") ?? `strips-${STAMP}`;
const LANE = (arg("--lane") ?? "all") as StripLane | "all";
const ONLY = list("--only");
const REPLICAS = list("--replicas");
const EFFORT_ARM = list("--effort-arm");
const EFFORT = arg("--effort") ?? "high";
const CONCURRENCY = Math.max(1, Number(arg("--concurrency") ?? 3));
const MAX_ROUNDS = Math.max(0, Number(arg("--rounds") ?? 2));
const CONTROLS = flag("--controls") || flag("--controls-only");
const CONTROLS_ONLY = flag("--controls-only");
const NO_LEONARDO = flag("--no-leonardo");
/** Skip the contact-sheet review turn on a strip whose gates all pass. Controls always skip it:
 *  on the F1 control (2026-10-06) the review cost 7 min and changed nothing visible. */
const NO_REVIEW = flag("--no-review");
const RESUME = flag("--resume");
const DRY = flag("--dry");
/** Re-render and re-gate every authored card of --run, with no authoring turn. */
const REGATE = flag("--regate");

const ROOT = process.cwd();
const RUN_DIR = path.join(ROOT, "foundry-out", "strips", RUN_ID);
const DATA = path.join(ROOT, "pipeline", "strips", "data");

const approaches: Approach[] = JSON.parse(readFileSync(path.join(ROOT, "pipeline", "strips", "approaches.json"), "utf8")).approaches;

/** The positive control: the "infographic post" every approach must beat. */
const control = (lane: StripLane, kase: string): Approach => ({
  id: "CTRL",
  lane,
  case: kase,
  name: "House infographic (control)",
  medium: "svg",
  grammar: lane === "stat" ? "reflow" : "draw-on",
  density: "low",
  leonardo: "none",
  direction:
    lane === "stat"
      ? "The plain, correct baseline: flat light ground, one accent for the leader, a clean horizontal bar race in a neutral sans, year top right, source line. No theme, no texture, no metaphor."
      : "The plain, correct baseline: flat light ground, one accent, a clean labelled diagram of the causal steps in a neutral sans, steps appearing in order. No theme, no texture, no metaphor.",
  falsifier: "None intended: this card exists to prove the brief is legible and the harness works. If it fails its countable expectations, the brief or the harness is wrong.",
});

// ---- regate: re-render existing strips, spend no seat ------------------------
if (REGATE) {
  const runPath = path.join(RUN_DIR, "run.json");
  const m: StripRun = JSON.parse(await readFile(runPath, "utf8"));
  const browser = await launchHeadless();
  try {
    for (const card of m.cards) {
      const html = path.join(RUN_DIR, card.id, "strip.html");
      if (!existsSync(html) || card.status === "lint-failed" || card.status === "author-failed") continue;
      const r = await renderStrip({ browser, htmlPath: html, outDir: path.join(RUN_DIR, card.id), lane: card.lane });
      card.gates = r.gates;
      card.error = r.error;
      card.status = r.ok ? "rendered" : "render-failed";
      card.renderMs = r.renderMs;
      card.files = { ...card.files, ...r.files };
      await writeFile(path.join(RUN_DIR, card.id, "meta.json"), JSON.stringify(card, null, 2));
      const g = r.gates;
      console.log(`[${card.id}] regated ${card.status}${g ? ` seek:${g.seek.ok ? "ok" : "X"} legibility:${g.legibility.ok ? "ok" : "X"} motion:${g.motion.ok ? "ok" : "X"}` : ""}`);
    }
    await writeFile(runPath, JSON.stringify(m, null, 2));
  } finally {
    await browser.close();
  }
  process.exit(0);
}

// ---- card selection ---------------------------------------------------------
type Job = { card: StripCard; approach: Approach };
const jobs: Job[] = [];
const picked = approaches.filter((a) => (LANE === "all" || a.lane === LANE) && (!ONLY.length || ONLY.includes(a.id)));
const cardId = (a: Approach, suffix = "") =>
  `${a.case.startsWith(`${a.lane}-`) ? a.case : `${a.lane}-${a.case}`}--${a.id === "CTRL" ? "ctrl" : a.id}${suffix}`;
const blank = (a: Approach, id: string, effort: string, replicaOf?: string): StripCard => ({
  id, lane: a.lane, case: a.case, approach: a.id, ...(replicaOf ? { replicaOf } : {}), effort,
  status: "author-failed", rounds: 0, authorMs: 0, renderMs: 0, files: {},
});

if (CONTROLS) {
  const cases = [...new Map(picked.map((a) => [a.case, a.lane] as const)).entries()];
  for (const [kase, lane] of cases) {
    const c = control(lane, kase);
    jobs.push({ card: blank(c, cardId(c), EFFORT), approach: c });
  }
}
if (!CONTROLS_ONLY) {
  for (const a of picked) {
    jobs.push({ card: blank(a, cardId(a), EFFORT), approach: a });
    if (REPLICAS.includes(a.id)) jobs.push({ card: blank(a, cardId(a, "--r2"), EFFORT, cardId(a)), approach: a });
    if (EFFORT_ARM.includes(a.id)) jobs.push({ card: blank(a, cardId(a, "--low"), "low", cardId(a)), approach: a });
  }
}

console.log(`run ${RUN_ID}: ${jobs.length} card(s), concurrency ${CONCURRENCY}, effort ${EFFORT}, rounds ≤${MAX_ROUNDS}`);
for (const j of jobs) console.log(`  ${j.card.id}  ${j.approach.name}  [${j.card.effort}${j.approach.leonardo !== "none" ? `, leonardo ${j.approach.leonardo}` : ""}]`);
if (DRY) process.exit(0);

// ---- run manifest (one writer: this process; writes are serialized) --------
await mkdir(RUN_DIR, { recursive: true });
const runPath = path.join(RUN_DIR, "run.json");
const prior: StripRun | null = RESUME && existsSync(runPath) ? JSON.parse(await readFile(runPath, "utf8")) : null;
const manifest: StripRun = prior ?? {
  version: 1,
  id: RUN_ID,
  at: new Date().toISOString(),
  width: { edu: STRIP_SIZE.edu.width, stat: STRIP_SIZE.stat.width },
  height: { edu: STRIP_SIZE.edu.height, stat: STRIP_SIZE.stat.height },
  fps: STRIP_FPS,
  frames: STRIP_FRAMES,
  approaches: [],
  cards: [],
  status: "running",
};
manifest.status = "running";
for (const j of jobs) {
  if (j.approach.id !== "CTRL" && !manifest.approaches.some((a) => a.id === j.approach.id)) manifest.approaches.push(j.approach);
  if (!manifest.cards.some((c) => c.id === j.card.id)) manifest.cards.push(j.card);
}
let writing = Promise.resolve();
const save = () => (writing = writing.then(() => writeFile(runPath, JSON.stringify(manifest, null, 2))));
const put = async (card: StripCard) => {
  const i = manifest.cards.findIndex((c) => c.id === card.id);
  manifest.cards[i] = card;
  await writeFile(path.join(RUN_DIR, card.id, "meta.json"), JSON.stringify(card, null, 2)).catch(() => {});
  await save();
};
await save();

// ---- shared resources -------------------------------------------------------
const browser = await launchHeadless();
let renderSlots = 2;
const renderQueue: (() => void)[] = [];
async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (renderSlots === 0) await new Promise<void>((r) => renderQueue.push(r));
  renderSlots--;
  try {
    return await fn();
  } finally {
    renderSlots++;
    renderQueue.shift()?.();
  }
}
const assets = new Map<string, Promise<{ file: string; provider: string; costUsd?: number } | undefined>>();
function assetFor(a: Approach) {
  if (a.leonardo === "none" || NO_LEONARDO) return Promise.resolve(undefined);
  if (!assets.has(a.id)) {
    assets.set(
      a.id,
      (async () => {
        const base = path.join(RUN_DIR, "_assets", a.id);
        for (const ext of ["png", "jpg", "webp"]) if (existsSync(`${base}.${ext}`)) return { file: `${base}.${ext}`, provider: "leonardo (cached)" };
        try {
          return await makeAsset(a, a.lane, base);
        } catch (e) {
          console.warn(`[asset ${a.id}] ${(e as Error).message} - the strip renders without it`);
          return undefined;
        }
      })(),
    );
  }
  return assets.get(a.id)!;
}

function feedbackText(card: StripCard, lint: string[]): string {
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

// ---- one card ---------------------------------------------------------------
async function runCard({ card: seed, approach }: Job): Promise<void> {
  const existing = manifest.cards.find((c) => c.id === seed.id);
  if (RESUME && existing?.status === "rendered") {
    console.log(`[${seed.id}] already rendered - skipped`);
    return;
  }
  const card: StripCard = { ...seed, files: {} };
  const dir = path.join(RUN_DIR, card.id);
  await mkdir(dir, { recursive: true });
  const briefPath = path.join(DATA, `${approach.case}.json`);
  if (!existsSync(briefPath)) {
    card.error = `no data fixture at pipeline/strips/data/${approach.case}.json`;
    await put(card);
    console.warn(`[${card.id}] ${card.error}`);
    return;
  }
  const brief = JSON.parse(await readFile(briefPath, "utf8"));
  const asset = await assetFor(approach);
  if (asset) card.asset = { file: path.relative(RUN_DIR, asset.file).replace(/\\/g, "/"), provider: asset.provider, costUsd: asset.costUsd };
  const ws = path.join(RUN_DIR, "_ws", card.id);
  const html = path.join(dir, "strip.html");
  const style = path.join(dir, "style.json");

  let cost = 0;
  let feedback: Parameters<typeof authorStrip>[0]["feedback"];
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    console.log(`[${card.id}] author turn ${round === 0 ? "1" : `fix ${round}`}`);
    const t0 = Date.now();
    const a = await authorStrip({ ws, lane: approach.lane, brief, approach, effort: card.effort, asset: asset?.file, feedback });
    card.authorMs += Date.now() - t0;
    cost += a.result.costUsd ?? 0;
    card.costUsd = cost || undefined;
    if (a.result.outcome !== "completed" || !a.html) {
      if (round === 0 || !existsSync(html)) {
        card.status = "author-failed";
        card.error = `${a.result.outcome}: ${a.result.errors.join(" | ") || "no out/strip.html written"}`;
        await put(card);
        return;
      }
      break; // a failed fix turn keeps the last good render
    }
    await copyFile(a.html, html);
    if (a.style) await copyFile(a.style, style);
    card.files.html = "strip.html";
    if (a.style) card.files.style = "style.json";
    if (round > 0) card.rounds = round;
    if (round > 0 && !a.changed && card.status === "rendered") {
      console.log(`[${card.id}] fix turn changed nothing - keeping render`);
      break;
    }

    const lint = formatLint(lintStrip(await readFile(html, "utf8")));
    card.lint = lint.length ? lint : undefined;
    if (lint.length) {
      card.status = "lint-failed";
      card.gates = undefined;
      card.error = undefined;
      await put(card);
      if (round === MAX_ROUNDS) return;
      feedback = { text: feedbackText(card, lint), current: html, style };
      continue;
    }

    const r = await withRenderSlot(() => renderStrip({ browser, htmlPath: html, outDir: dir, lane: approach.lane }));
    card.renderMs += r.renderMs;
    card.gates = r.gates;
    card.error = r.error;
    card.status = r.ok ? "rendered" : "render-failed";
    card.files = { ...card.files, ...r.files };
    await put(card);
    const g = r.gates;
    console.log(`[${card.id}] ${card.status}${g ? ` seek:${g.seek.ok ? "ok" : "X"} legibility:${g.legibility.ok ? "ok" : "X"} motion:${g.motion.ok ? "ok" : "X"}` : ""}${r.error ? ` - ${r.error}` : ""}`);

    // Round 1 always looks at its own sheet once; a second fix only on a failure.
    const failing = !r.ok || (g && !(g.seek.ok && g.legibility.ok && g.motion.ok));
    if (round === MAX_ROUNDS || (round >= 1 && !failing)) break;
    if (round === 0 && !failing && (NO_REVIEW || approach.id === "CTRL")) break;
    feedback = { text: feedbackText(card, []), sheet: path.join(dir, "sheet.png"), current: html, style };
  }
}

// ---- pool -------------------------------------------------------------------
const queue = [...jobs];
async function worker() {
  for (let j = queue.shift(); j; j = queue.shift()) {
    try {
      await runCard(j);
    } catch (e) {
      const card = manifest.cards.find((c) => c.id === j!.card.id)!;
      card.status = card.status === "rendered" ? card.status : "render-failed";
      card.error = `harness: ${(e as Error).message}`;
      await put(card).catch(() => {});
      console.error(`[${j.card.id}] harness error: ${(e as Error).message}`);
    }
  }
}
try {
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  // ---- replica discrimination ----------------------------------------------
  const disc: Record<string, number> = { ...(manifest.discrimination ?? {}) };
  for (const rep of manifest.cards.filter((c) => c.replicaOf && c.id.endsWith("--r2") && c.status === "rendered")) {
    const orig = manifest.cards.find((c) => c.id === rep.replicaOf && c.status === "rendered");
    if (!orig) continue;
    // Peers share the case: across cases the content, not the style, would dominate the distance.
    const peers = manifest.cards.filter((c) => c.case === orig.case && c.status === "rendered" && !c.replicaOf && c.id !== orig.id);
    if (!peers.length) continue;
    const sheets = [orig, rep, ...peers].map((c) => path.join(RUN_DIR, c.id, "sheet.png"));
    const d = await sheetDistances(browser, sheets);
    const noise = d[0][1];
    const between = d[0].slice(2).reduce((s, x) => s + x, 0) / peers.length;
    disc[orig.approach] = noise > 0 ? Math.round((between / noise) * 100) / 100 : Infinity;
    console.log(`discrimination ${orig.approach}: between ${between.toFixed(1)} / replica ${noise.toFixed(1)} = ${disc[orig.approach]}`);
  }
  manifest.discrimination = disc;
  manifest.status = "awaiting-triage";
  await save();
} finally {
  await writing;
  await browser.close();
}
const by = (s: string) => manifest.cards.filter((c) => c.status === s).length;
console.log(`\nrun ${RUN_ID}: rendered ${by("rendered")}, lint-failed ${by("lint-failed")}, render-failed ${by("render-failed")}, author-failed ${by("author-failed")}`);
console.log(`triage: /foundry -> Strips -> ${RUN_ID}`);
