import { AppError, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { CallIntent } from "@gt/kernel/dryrun";
import { usd6, type Outputs, type Producer, type StepContext, type StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { definePartAct, madeFree, refuse, unitStep, type ActPlan, type ActUnit, type PartActPorts } from "../research/partAct.ts";
import { RENDER_ESTIMATE, TURN_ESTIMATE } from "../strips/plan.ts";
import { cardIdOf, DRY_WHY, NO_PAGE, unitNames, type DrawOut, type TurnOut } from "./cards.ts";

export { cardIdOf, unitNames } from "./cards.ts";

// THE STRIP-CARDS PRODUCER (spark explainer-real-article-strips WP-B) - an explainer's strips
// part drawn as one foundry strip per article section, each card's poster landed in STRIPS as a
// blob the cut shows and its caption the line the voice part speaks.
//
// WHY NOT THE `strips` PRODUCER. That one is a RUN's (`job:run:<runId>`): its plan reads run.json
// by the job's `of.id`, which for a part is `<projectId>/strips` and fails the run-id rule, and it
// lands nothing in a part's records. A part act is the studio's other shape (../research/partAct.ts:
// plan, units, land), so this is a part act producer over the same engine pieces - the author turn,
// the frame-purity lint, the headless capture - with its own name, because a part kind's job runs
// under the catalog option's `producer` (packages/catalog/src/partOptions.ts, as Suno's option is).
//
// THE UNITS, per card (`card-<sectionId>`, stable across redraws so `line-card-<sectionId>`'s
// narration survives a redraw):
//
//   turn:<card>        PAID. One author turn on the operator's text seat through the step's meter
//                      (`meter.paid` + `seatEntry`: the seat's own report, or an unpriced row with
//                      its reason). The page, its module and its caption are copied into the card's
//                      directory with a marker written LAST; a retried turn whose marker is there
//                      ADOPTS the page instead of buying it again (a crash after the land, before
//                      the booking - plan.ts's "a page on disk was paid for").
//   draw:<card>        FREE. The lint (frame purity AND the caption's door), then the capture, its
//                      four gates, and the full-size poster (the strip's LAST frame) as an
//                      image/png blob. A lint finding is not rendered.
//   fix:<card>:r<n>    PAID, and only when round n-1 failed: the fixer is shown that round's findings.
//   draw:<card>:r<n>   FREE, the same draw over the fixed page.
//
// TWO FIX ROUNDS, the foundry's default (lib/foundry/strips/cards.ts `DEFAULT_OPTIONS.rounds`,
// pinned equal by tests/next-server/producer-strip-cards.test.ts), and no contact-sheet review: a
// card here is a narrated still in a cut, judged by its operator on the Board, so a passing round
// is the end. One round was tried first and measured against a REAL card (2026-10-24: 804 s, $2.67
// reported, a clean strip refused after its one fix by "smallest 25px at 1080w ... bar 26; 1 text
// box(es) outside the safe box") - a near-miss a second fix turn exists for. Worst case three turns
// a card (`CARD_ROUNDS` + 1), which is what the receipt prices. The units are fixed when the plan
// is booked; a round that need not run is booked as skipped with its reason (a booked unit is never
// performed again), and a card lands `refused` only when its LAST round that ran failed.
//
// DRY: the turn is the meter's stand-in (the seat is never entered) and the draw takes no capture,
// so each card lands `pending` - "dry stand-in: no capture was taken" - with the section's first
// sentences as its caption. The fixture side lands dry cards `drawn`; that divergence is known and
// is the honest one: there is no picture.
//
// The workspace is keyed by the JOB (lib/producers/stripCards.ts `cardsDirOf`): a dry job's
// directory is never the live job's, so a stand-in is never adopted as a paid page.

export const STRIP_CARDS = "strip-cards";
export const STRIP_CARDS_ACT = "draw-strips";
/** Fix rounds after round 0 (see the header). */
export const CARD_ROUNDS = 2;

export const NO_ARTICLE = "draw strips needs an article";
export const ALL_DRAWN = "every section of the article is drawn: name a section to draw it again";

export type CardSection = { readonly id: string; readonly heading: string; readonly body: string };
/** What the plan reads: the adopted article's sections and which of them already have a drawn card. */
export type StripCardsView = { readonly title: string | null; readonly sections: readonly CardSection[]; readonly drawn: ReadonlySet<string> };

export type CardKind = "turn" | "draw";
/** One unit as the ports need it: its card and round, and the section it explains. */
export type CardUnit = {
  readonly name: string;
  readonly kind: CardKind;
  readonly card: string;
  readonly round: number;
  readonly section: CardSection;
  readonly title: string | null;
  /** When the job's plan was booked: with the job id, the key of this job's workspace - a job id
   *  alone can recur (a store restored from a snapshot re-mints `job:part:<id>:draw-strips:<rev>`). */
  readonly planned: string;
};

const UNIT_RE = /^(turn|fix|draw):([^:]+)(?::r([1-9][0-9]*))?$/;

/** The kind, card and round a unit name means; undefined for one this producer never plans. */
export function parseUnit(name: string): { readonly kind: CardKind; readonly card: string; readonly round: number } | undefined {
  const m = UNIT_RE.exec(name);
  if (m === null) return undefined;
  const [, k = "", card = "", r] = m;
  if (k === "turn") return r === undefined ? { kind: "turn", card, round: 0 } : undefined;
  if (k === "fix") return r === undefined ? undefined : { kind: "turn", card, round: Number(r) };
  return { kind: "draw", card, round: r === undefined ? 0 : Number(r) };
}

const text = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** A booked unit's input read back as the ports' unit. */
export function cardUnitOf(unit: ActUnit, planned = ""): CardUnit | undefined {
  const p = parseUnit(unit.name);
  const id = text(unit.input["section"]);
  if (p === undefined || id === undefined) return undefined;
  const section = { id, heading: text(unit.input["heading"]) ?? "", body: text(unit.input["body"]) ?? "" };
  return { name: unit.name, ...p, section, title: text(unit.input["title"]) ?? null, planned };
}

/** The act's units: every undrawn section's card (a whole-part draw), or the one section named. */
export function stripCardsPlan(v: StripCardsView, act: string | null, target?: string, rounds: number = CARD_ROUNDS): Result<ActPlan> {
  const a = act ?? STRIP_CARDS_ACT;
  if (a !== STRIP_CARDS_ACT) return refuse(`${a} is not an act of a strips part`);
  if (v.sections.length === 0) return refuse(NO_ARTICLE);
  const picked = target === undefined ? v.sections.filter((s) => !v.drawn.has(s.id)) : v.sections.filter((s) => s.id === target);
  if (picked.length === 0) return refuse(target === undefined ? ALL_DRAWN : `the article has no section ${target}`);
  const units: ActUnit[] = [];
  for (const s of picked) {
    const card = cardIdOf(s.id);
    const input = { section: s.id, heading: s.heading, body: s.body, ...(v.title === null ? {} : { title: v.title }) };
    for (let r = 0; r <= rounds; r++) {
      units.push({ name: unitNames.turn(card, r), estimate: TURN_ESTIMATE, input: { ...input, card, round: r } });
      units.push({ name: unitNames.draw(card, r), estimate: RENDER_ESTIMATE, input: { ...input, card, round: r } });
    }
  }
  return ok({ act: a, units });
}

/** The sections a plan draws, in plan order: a whole-part draw's fan-out, one targeted job each
 *  (research/facts.ts `launchPartAct` `split`) - so the cards draw in parallel on seat.text. */
export function sectionsOfPlan(plan: ActPlan): string[] {
  const out: string[] = [];
  for (const u of plan.units) {
    const s = text(u.input["section"]);
    if (s !== undefined && !out.includes(s)) out.push(s);
  }
  return out;
}

/* ── what a card's earlier units booked ────────────────────────────────── */

const obj = (x: unknown): Readonly<Record<string, unknown>> | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Readonly<Record<string, unknown>>) : undefined);

export const turnOf = (outputs: Outputs, card: string, round: number): TurnOut | undefined => obj(outputs.get(unitStep(unitNames.turn(card, round)))?.value) as TurnOut | undefined;
export const drawOf = (outputs: Outputs, card: string, round: number): DrawOut | undefined => obj(outputs.get(unitStep(unitNames.draw(card, round)))?.value) as DrawOut | undefined;

/** Why a unit need not run, read off what its card's earlier units booked; undefined: run it. */
export function skipOf(u: Pick<CardUnit, "kind" | "card" | "round">, outputs: Outputs): string | undefined {
  if (u.kind === "draw") {
    const t = turnOf(outputs, u.card, u.round);
    if (t === undefined) return undefined;
    if (t.skipped !== undefined) return t.skipped;
    return t.ok ? undefined : (t.why ?? NO_PAGE);
  }
  if (u.round === 0) return undefined;
  const prev = drawOf(outputs, u.card, u.round - 1);
  if (prev === undefined) return undefined;
  if (prev.skipped !== undefined) return prev.skipped;
  if (prev.dry === true) return DRY_WHY;
  return prev.pass ? `round ${u.round - 1} passed` : undefined;
}

/** What a fixer is shown of the round before (v1 steps.ts `feedbackText`, in the card's terms). */
export function feedbackOf(prev: DrawOut | undefined, round: number): string {
  const lines = [`# Render ${round} of your strip`, ""];
  const lint = prev?.lint ?? [];
  if (lint.length > 0) lines.push("## Lint errors (the strip was NOT rendered)", ...lint.map((l) => `- ${l}`), "");
  if (prev?.error !== undefined) lines.push("## Render error", prev.error, "");
  const gates = Object.entries(prev?.gates ?? {});
  if (gates.length > 0) lines.push("## Automated gates", ...gates.map(([k, g]) => `- ${k}: ${g.ok ? "pass" : "FAIL"} - ${g.detail}`), "");
  lines.push("inputs/sheet.png, if present, is a 4x3 contact sheet of frames 0, 20, 40 ... 220 (read left to right, top to bottom).");
  return lines.join("\n");
}

/* ── the ports, and the seat turn through the meter ────────────────────── */

/** What a seat turn's result must carry for the meter and the classification. */
export type TurnReport = { readonly outcome: string; readonly costUsd?: number; readonly errors: readonly string[] };
export type TurnFacts = { readonly model: string; readonly effort: string; readonly promptChars: number };
export type Gates = Readonly<Record<string, { readonly ok: boolean; readonly detail: string }>>;
/** A draw's work: lint findings (the page's and the caption's), and, when it was rendered, the
 *  capture and the poster's bytes. `dry`: no capture was taken. */
export type Drawn = {
  readonly dry?: boolean;
  readonly lint: readonly string[];
  readonly caption?: string;
  readonly render?: { readonly ok: boolean; readonly gates?: Gates; readonly error?: string };
  readonly poster?: Uint8Array;
};

export type StripCardsPorts<I, R extends TurnReport> = {
  readonly plan: PartActPorts["plan"];
  /** A turn of this round already landed in the card's directory (its marker is there). */
  adopted(job: Job, u: CardUnit): Promise<boolean>;
  /** The workspace and the agent input, the explainer addendum appended. Spends nothing. */
  prepare(job: Job, u: CardUnit, feedback: string | undefined): Promise<I>;
  describe(input: I): TurnFacts;
  live(input: I): Promise<R>;
  /** The dry stand-in: no seat, nothing written. */
  stand(input: I): Promise<R>;
  capped(input: I, usd: number): I;
  /** What the turn left, into the card's directory (fenced: `stillHeld` before the first write). */
  keep(job: Job, u: CardUnit, input: I, r: R, stillHeld: () => void): Promise<{ readonly ok: boolean; readonly why?: string }>;
  draw(job: Job, u: CardUnit, dry: boolean): Promise<Drawn>;
  readonly land: PartActPorts["land"];
  readonly settled?: PartActPorts["settled"];
  readonly preflight?: PartActPorts["preflight"];
};

const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";

/** The seat's own report as a ledger row: its figure, or an unpriced row with the reason. */
export function seatEntry(r: TurnReport, u: Pick<CardUnit, "card" | "round">): SettleEntry {
  const axes = { producer: STRIP_CARDS, card: u.card, turn: u.round === 0 ? "author" : "fix" };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const stillHeld = (ctx: StepContext) => (): void => {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; the card is not written`);
  must(ctx.fx.tx("strip-cards.fence", (t) => assertFence(t, slot, lease.fence)));
};

async function meteredTurn<I, R extends TurnReport>(ctx: StepContext, ports: StripCardsPorts<I, R>, raw: I, u: CardUnit): Promise<R> {
  // The ceiling holds INSIDE a turn: the writer's own budget is what the job has left.
  const ceiling = ctx.job.ceilingUsd;
  const input = ceiling === undefined ? raw : ports.capped(raw, usd6(Math.max(0, ceiling - ctx.job.spend.usd)));
  const f = ports.describe(input);
  const intent: CallIntent<Promise<R>> = {
    provider: "claude-seat",
    model: f.model,
    usage: {},
    quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
    payload: { turn: u.round === 0 ? "strip-author" : "strip-fix", card: u.card, round: u.round, model: f.model, effort: f.effort, promptChars: f.promptChars },
    subject: { kind: "job", id: ctx.job.id },
    stand: () => ports.stand(input),
  };
  const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
    const out = await ports.live(input);
    return { value: Promise.resolve(out), entries: [seatEntry(out, u)] };
  });
  return must(r);
}

const produced = (ctx: StepContext, output: EventData): StepOutcome => ({ kind: "produced", output, ...(ctx.meter.used() ? {} : { costUsd: 0 }) });

async function performTurn<I, R extends TurnReport>(ports: StripCardsPorts<I, R>, job: Job, u: CardUnit, ctx: StepContext): Promise<StepOutcome> {
  const dry = job.mode.kind === "dry";
  if (!dry && (await ports.adopted(job, u))) return madeFree({ ok: true, outcome: "adopted", adopted: true } satisfies TurnOut);
  const feedback = u.round === 0 ? undefined : feedbackOf(drawOf(ctx.outputs, u.card, u.round - 1), u.round);
  const input = await ports.prepare(job, u, feedback);
  const r = await meteredTurn(ctx, ports, input, u);
  const why = r.errors.join(" | ");
  if (r.outcome === "seat-limit") return { kind: "money-stop", message: `the text seat's usage window is spent (${u.name}): ${why || "seat limit"}` };
  if (r.outcome === "unavailable" && r.costUsd === undefined) return { kind: "vendor-failure", message: `the text seat did not serve ${u.name}: ${why || "unavailable"}` };
  if (dry) return produced(ctx, { ok: true, outcome: "dry", dry: true } satisfies TurnOut);
  const kept = await ports.keep(job, u, input, r, stillHeld(ctx));
  const out: TurnOut = { ok: kept.ok, outcome: r.outcome, ...(r.costUsd === undefined ? {} : { costUsd: r.costUsd }), ...(kept.why === undefined ? {} : { why: kept.why }) };
  return produced(ctx, out);
}

const allPass = (g: Gates | undefined): boolean => g !== undefined && Object.values(g).length > 0 && Object.values(g).every((x) => x.ok);

async function performDraw<I, R extends TurnReport>(ports: StripCardsPorts<I, R>, job: Job, u: CardUnit, ctx: StepContext): Promise<StepOutcome> {
  const d = await ports.draw(job, u, job.mode.kind === "dry");
  if (d.dry === true) return madeFree({ round: u.round, pass: false, dry: true } satisfies DrawOut);
  const rendered = d.lint.length === 0 && d.render?.ok === true;
  const posterless = rendered && allPass(d.render?.gates) && d.poster === undefined;
  const pass = rendered && allPass(d.render?.gates) && d.poster !== undefined;
  let blob: Readonly<Record<string, unknown>> | undefined;
  if (pass && d.poster !== undefined) {
    const b = await ctx.fx.blob(d.poster, "image/png");
    if (!b.ok) return { kind: "fatal", code: b.error.code, message: b.error.message };
    blob = { ...b.value };
  }
  const error = posterless ? "the capture left no poster.png" : d.render?.error;
  const out: DrawOut = {
    round: u.round,
    pass,
    lint: [...d.lint].slice(0, 12),
    ...(d.caption === undefined ? {} : { caption: d.caption }),
    ...(d.render?.gates === undefined ? {} : { gates: d.render.gates }),
    ...(error === undefined ? {} : { error }),
    ...(blob === undefined ? {} : { blob }),
  };
  return madeFree(out);
}

export function defineStripCards<I, R extends TurnReport>(lane: ResourceLane, ports: StripCardsPorts<I, R>): Producer {
  return definePartAct(lane, {
    plan: ports.plan,
    async perform(job, _plan, unit, ctx) {
      const u = cardUnitOf(unit, ctx.outputs.get("plan")?.at ?? "");
      if (u === undefined) return { kind: "fatal", code: "internal", message: `${STRIP_CARDS}: no unit called ${unit.name}` };
      const skipped = skipOf(u, ctx.outputs);
      if (skipped !== undefined) return madeFree(u.kind === "turn" ? ({ ok: false, outcome: "skipped", skipped } satisfies TurnOut) : ({ round: u.round, pass: false, skipped } satisfies DrawOut));
      return u.kind === "turn" ? performTurn(ports, job, u, ctx) : performDraw(ports, job, u, ctx);
    },
    land: ports.land,
    ...(ports.settled === undefined ? {} : { settled: ports.settled }),
    ...(ports.preflight === undefined ? {} : { preflight: ports.preflight }),
  });
}
