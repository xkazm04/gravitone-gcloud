import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ok } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import type { ActUnit } from "@gt/producers/research/partAct";
import { landPart, projectOf } from "@gt/producers/research/partJob";
import { cardOutcome, mergeCards, type LandedCard, type TurnOut } from "@gt/producers/stripCards/cards";
import { cardUnitOf, defineStripCards, sectionsOfPlan, stripCardsPlan, type CardSection, type CardUnit, type StripCardsView } from "@gt/producers/stripCards/define";

import { runAgent, type AgentResult, type RunAgentInput } from "@/lib/agent/cliSeam";
import { collectTurn, prepareTurn, type StripTurn } from "@/lib/foundry/strips/author";
import { CAPTION_FILE, captionOf, caseOf, explainerAddendum, sectionBrief, standInCaption, withAddendum } from "@/lib/foundry/strips/brief";
import { control, DEFAULT_OPTIONS } from "@/lib/foundry/strips/cards";
import { formatLint, lintStrip } from "@/lib/foundry/strips/lint";
import type { Capture } from "@/lib/foundry/strips/steps";
import { stripsRoot } from "@/lib/foundry/strips/store";

import { field, partFacts, preflightFrom, text, written, type DriveHooks, type PartFacts, type SplitFn, type UnitsFn } from "./research.ts";
import { realCapture } from "./strips.ts";

// THE STRIP-CARDS PRODUCER, BOUND (spark explainer-real-article-strips WP-B) -
// packages/producers/src/stripCards over the foundry strip engine's run-free pieces: the
// workspace and the turn's collection (lib/foundry/strips/author.ts), the section-to-brief
// adapter and the caption's door (./brief.ts), the frame-purity lint (./lint.ts) and the headless
// capture (pipeline/strips/render.mts, through lib/producers/strips.ts `realCapture`). None of
// lib/foundry/strips/steps.ts is used: every step there reads and patches a run's run.json, and a
// card here belongs to a PART - its record is STRIPS, written once, by `land`.
//
//   the approach  `control("edu", "explainer-<sectionId>")` (lib/foundry/strips/cards.ts): the
//                 plain, correct baseline - a labelled draw-on diagram of the causal steps. It asks
//                 for no supporting image and its run never reviews it, so a card is one turn and
//                 one capture when it passes. Choosing an approach per card is out of scope.
//   the turn      prepareTurn's own prompt with the explainer addendum APPENDED
//                 (pipeline/STRIP-EXPLAINER-PROMPT.md): derive the steps, write the caption.
//   the files     `stripsRoot()/parts/<projectId>/<jobKey>/<cardId>/`: strip.html, style.json,
//                 caption.json, the capture's media and poster.png, and `landed.json` - written
//                 LAST, the marker a retried turn adopts. `_ws/<cardId>/` beside them is the
//                 seat's isolated workspace (inputs/ and out/ only). The job key is the job id's
//                 digest: a dry job's directory is never a live job's, and a redraw (a new job)
//                 starts clean rather than adopting the page it was asked to replace.
//   the poster    the strip's LAST frame at full size (render.mts `poster.png`): a draw-on strip at
//                 frame 120 shows half its steps. Its bytes go to the kernel blob store as
//                 image/png; the cut reads them by digest (lib/cut/explainer.ts `src`).

export type StripCardsEngines = {
  /** The seat (lib/agent/cliSeam.ts `runAgent`); a test hands a counted fake. */
  readonly seat: (input: RunAgentInput) => Promise<AgentResult>;
  /** The capture (render.mts); a test hands one that writes a poster and no video. */
  readonly capture: () => Promise<Capture>;
};

const LIVE: StripCardsEngines = { seat: runAgent, capture: realCapture };

const EFFORT = "high";
const MARKER = "landed.json";
const POSTER = "poster.png";

const safe = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "_";
export const jobKeyOf = (jobId: string): string => createHash("sha256").update(jobId).digest("hex").slice(0, 16);
/** Every card directory of one job (its id and when its plan was booked: `CardUnit.planned`). */
export const cardsDirOf = (job: Job, planned: string): string => path.join(stripsRoot(), "parts", safe(projectOf(job)), jobKeyOf(`${job.id}@${planned}`));
export const cardDirOf = (job: Job, u: Pick<CardUnit, "card" | "planned">): string => path.join(cardsDirOf(job, u.planned), safe(u.card));
const wsOf = (job: Job, u: Pick<CardUnit, "card" | "planned">): string => path.join(cardsDirOf(job, u.planned), "_ws", safe(u.card));

/* ── the plan's view, from the project's records ───────────────────────── */

type CardRec = Readonly<Record<string, unknown>> & { readonly id: string };

const sectionsIn = (records: PartFacts["records"]): CardSection[] => {
  const s = records.get("article")?.["sections"];
  return Array.isArray(s) ? written<CardSection[]>(s) : [];
};
const cardsIn = (rec: Readonly<Record<string, unknown>> | undefined): CardRec[] => (Array.isArray(rec?.["cards"]) ? written<CardRec[]>(rec["cards"]) : []);

export function stripCardsView(records: PartFacts["records"]): StripCardsView {
  const article = records.get("article");
  const drawn = new Set(cardsIn(records.get("strips")).filter((c) => c["state"] === "drawn" && c.id === `card-${String(c["section"])}`).map((c) => String(c["section"])));
  return { title: text(article?.["title"]) ?? null, sections: sectionsIn(records), drawn };
}

/** The receipt's units and the job's plan step: one pure function of the records. */
export const stripCardsUnits: UnitsFn = (_s, f, ask) => stripCardsPlan(stripCardsView(f.records), ask.act, ask.target);

/** A whole-part draw's confirm: one targeted job per section its plan draws. */
export const stripCardsSplit: SplitFn = (plan) => sectionsOfPlan(plan);

/* ── the turn ──────────────────────────────────────────────────────────── */

const DRY_TURN: AgentResult = { outcome: "completed", final: "dry stand-in: no seat was called", turns: 0, durationMs: 0, exitCode: 0, errors: [] };

async function prepare(job: Job, u: CardUnit, feedback: string | undefined): Promise<StripTurn> {
  const dir = cardDirOf(job, u);
  const ws = wsOf(job, u);
  const addendum = await explainerAddendum();
  const t = await prepareTurn({
    ws,
    lane: "edu",
    brief: sectionBrief(u.section, u.title),
    approach: control("edu", caseOf(u.section.id)),
    effort: EFFORT,
    timeoutMin: DEFAULT_OPTIONS.authorTimeoutMin,
    ...(feedback === undefined ? {} : { feedback: { text: feedback, sheet: path.join(dir, "sheet.png"), current: path.join(dir, "strip.html"), style: path.join(dir, "style.json") } }),
  });
  // A fixer edits out/ in place: it finds the caption it is told about where it wrote it.
  if (feedback !== undefined && existsSync(path.join(dir, CAPTION_FILE))) await copyFile(path.join(dir, CAPTION_FILE), path.join(ws, "out", CAPTION_FILE));
  return { ...t, agent: { ...t.agent, prompt: withAddendum(t.agent.prompt, addendum) } };
}

/** What the turn left, into the card's directory: caption and module first, the page, then the
 *  marker - so a marker on disk means the whole turn landed (delivery-guarantees: the marker
 *  certifies what was done). */
async function keep(job: Job, u: CardUnit, t: StripTurn, r: AgentResult, stillHeld: () => void): Promise<{ ok: boolean; why?: string }> {
  const got = await collectTurn(t);
  if (r.outcome !== "completed" || got.html === undefined) return { ok: false, why: `${r.outcome}: ${r.errors.join(" | ") || "no out/strip.html written"}` };
  const dir = cardDirOf(job, u);
  stillHeld();
  await mkdir(dir, { recursive: true });
  const caption = path.join(t.ws, "out", CAPTION_FILE);
  if (existsSync(caption)) await copyFile(caption, path.join(dir, CAPTION_FILE));
  else await rm(path.join(dir, CAPTION_FILE), { force: true });
  if (got.style !== undefined) await copyFile(got.style, path.join(dir, "style.json"));
  await copyFile(got.html, path.join(dir, "strip.html"));
  await writeFile(path.join(dir, MARKER), JSON.stringify({ job: job.id, round: u.round }));
  return { ok: true };
}

async function adopted(job: Job, u: CardUnit): Promise<boolean> {
  try {
    const m = JSON.parse(await readFile(path.join(cardDirOf(job, u), MARKER), "utf8")) as { job?: unknown; round?: unknown };
    return m.job === job.id && typeof m.round === "number" && m.round >= u.round;
  } catch {
    return false;
  }
}

/* ── the draw ──────────────────────────────────────────────────────────── */

const readOr = async (file: string): Promise<string | undefined> => (existsSync(file) ? readFile(file, "utf8") : undefined);

async function draw(job: Job, u: CardUnit, dry: boolean, capture: () => Promise<Capture>) {
  if (dry) return { dry: true, lint: [] };
  const dir = cardDirOf(job, u);
  const htmlPath = path.join(dir, "strip.html");
  const html = await readOr(htmlPath);
  const cap = captionOf(await readOr(path.join(dir, CAPTION_FILE)));
  const lint = [...(html === undefined ? ["api: the card holds no strip.html"] : formatLint(lintStrip(html))), ...cap.findings];
  const caption = cap.findings.length === 0 && cap.caption !== undefined ? { caption: cap.caption } : {};
  if (lint.length > 0) return { lint, ...caption };
  // A poster left by an earlier round must not stand in for a capture that wrote none.
  await rm(path.join(dir, POSTER), { force: true });
  const r = await (await capture()).render({ htmlPath, outDir: dir, lane: "edu" });
  const poster = existsSync(path.join(dir, POSTER)) ? new Uint8Array(await readFile(path.join(dir, POSTER))) : undefined;
  const render = { ok: r.ok, ...(r.gates === undefined ? {} : { gates: { ...r.gates } }), ...(r.error === undefined ? {} : { error: r.error }) };
  return { lint: [], ...caption, render, ...(poster === undefined ? {} : { poster }) };
}

/* ── the land ──────────────────────────────────────────────────────────── */

/** The sections a booked plan drew, in plan order, with the rounds it allowed. */
function plannedSections(units: readonly ActUnit[]): { sections: CardSection[]; rounds: number; title: string | null } {
  const sections: CardSection[] = [];
  let rounds = 0;
  let title: string | null = null;
  for (const unit of units) {
    const u = cardUnitOf(unit);
    if (u === undefined) continue;
    rounds = Math.max(rounds, u.round);
    title = u.title;
    if (!sections.some((s) => s.id === u.section.id)) sections.push(u.section);
  }
  return { sections, rounds, title };
}

/** The STRIPS record's engine block: the seat's reported dollars summed over the job's turns. */
function engineOf(job: Job, f: PartFacts, made: ReadonlyMap<string, EventData>): Record<string, unknown> {
  const { provider, model } = f.option;
  if (job.mode.kind === "dry") return { provider, model, usd: null, unpricedReason: "dry run", seconds: 0, mode: "dry" };
  const costs = [...made.entries()].filter(([k]) => k.startsWith("turn:") || k.startsWith("fix:")).map(([, v]) => (v as TurnOut).costUsd).filter((x): x is number => typeof x === "number");
  const usd = costs.length === 0 ? null : Math.round(costs.reduce((a, b) => a + b, 0) * 1e6) / 1e6;
  return { provider, model, usd, ...(usd === null ? { unpricedReason: "the seat reported no cost" } : {}), seconds: 0, mode: "live" };
}

export function stripCardsProducer(lane: ResourceLane = "seat.text", hooks: DriveHooks = {}, engines: Partial<StripCardsEngines> = {}): Producer {
  const eng: StripCardsEngines = { ...LIVE, ...engines };
  return defineStripCards<StripTurn, AgentResult>(lane, {
    // Held at the release, not failed by the worker, while the article is not adopted (L45).
    preflight: preflightFrom(stripCardsUnits),
    async plan(_job, ask, ctx) {
      const f = partFacts(ctx);
      return f.ok ? stripCardsUnits(null, f.value, ask) : f;
    },
    adopted,
    prepare,
    describe: (t) => ({ model: t.agent.model, effort: t.agent.effort, promptChars: t.agent.prompt.length }),
    live: (t) => eng.seat(t.agent),
    stand: async () => DRY_TURN,
    capped: (t, usd) => ({ ...t, agent: { ...t.agent, maxBudgetUsd: Math.min(t.agent.maxBudgetUsd ?? Number.POSITIVE_INFINITY, usd) } }),
    keep,
    draw: (_job, u, dry) => draw(_job, u, dry, eng.capture),
    async land(job, plan, made, ctx) {
      // The article as it is NOW orders the cards and drops any whose section it no longer has
      // (cards.ts `mergeCards`): a landing that cannot read it lands nothing rather than guess.
      const f = partFacts(ctx);
      if (!f.ok) return f;
      const facts = f.value;
      const order = sectionsIn(facts.records).map((s) => s.id);
      const { sections, rounds } = plannedSections(plan.units);
      const landed: LandedCard[] = sections.map((s) => cardOutcome(s, rounds, made, standInCaption(s)));
      return landPart(ctx, plan.act, (s) => {
        const rec = field(s.records.get("strips")) ?? {};
        return ok({ strips: { ...rec, cards: mergeCards(cardsIn(rec), landed, order), engine: engineOf(job, facts, made) } });
      });
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
