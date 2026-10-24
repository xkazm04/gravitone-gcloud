import "server-only";

import type { AdBrief, AdIdea, AdTemplateId } from "@/lib/ads/types";
import { BRIEF_CAPS } from "@/lib/ads/validate";
import { fixtureSource, sourceOf, type NotebookSource } from "@/lib/notebook/source";
import { spineComplete, type BeatSlot } from "@/lib/research/beats";
import { buildCards, optInIds, scopeDiffs, scopeSummary, stateOf, type Card, type Scope } from "@/lib/research/scope";
import { GLASS_HARBOR_CUE, GLASS_HARBOR_SLOTS } from "@/lib/studio/trailerFixtures";
import { resultFor, suggestedReason, type FollowUpResult } from "@/lib/research/followup";
import { decide, reviseNotebook, type NotebookRevision } from "@/lib/research/revisions";
import { err, ok, type Result } from "@gt/domain/errors";
import { researchFaceOf, type AdBriefField, type EngineView, type PartActKind, type PartActView, type PartVerdict, type ResearchData, type ResearchOp } from "@gt/domain/partView";

import { RAINSHELL, emptyBrief, ideasStandIn } from "./fixtureAds.ts";
import type { Ctx } from "./fixture.ts";
import { digest } from "./hash.ts";
import { researchData as dataOf } from "./researchView.ts";

// RESEARCH, as the fixture side computes it - every number on the board is the v1 function's:
// `scopeSummary` (cut vs not-taken, wounds, required), `woundsOf` through it, `scopeDiffs` for what
// moved since the confirm, `spineComplete` for the beat board, `reviseNotebook` for follow-up
// effects (v1 left revisions.ts UNWIRED; here `decide-effect` is an op and the active notebook IS
// the base with its applied revisions), and the ads validator through ./fixtureAds.ts.
//
// The scope's digest is the BASE notebook's (decision, recorded): an applied revision is this
// project's own edit and must not orphan the scope it was decided beside; a different notebook
// landing (a re-run on another topic) does orphan it, v1 scopeDigest.ts's rule.

type FollowUpRec = { readonly id: string; readonly kind: "deepen-card" | "question"; readonly cardId?: string; readonly prompt: string; readonly status: "queued" | "returned" | "unanswered"; readonly result?: FollowUpResult };

export type ResearchRec = {
  readonly choice: "notebook" | "beats";
  readonly topic: string;
  readonly base: NotebookSource | null;
  readonly engine?: EngineView;
  readonly scope: Scope;
  readonly confirmed: Scope | null;
  readonly scopeDigest?: string;
  readonly followUps: readonly FollowUpRec[];
  readonly revisions: readonly NotebookRevision[];
  readonly slots: readonly BeatSlot[] | null;
  readonly picks: Readonly<Record<string, string | null>>;
  readonly spine: Readonly<Record<string, string>> | null;
  readonly brief: AdBrief;
  readonly ideas: readonly AdIdea[];
  readonly ideasDigest: string | null;
  readonly picked: string | null;
  readonly adsEngine?: EngineView;
};

/** The notebooks a dry research run can stand in with: only a project's OWN transcribed run.
 *  Any other topic lands no notebook - never Bitcoin's (v1's "Glass Harbor shows Bitcoin"). */
const REPLAYS: Readonly<Record<string, () => NotebookSource>> = { "why-bitcoin": fixtureSource };
const BEAT_BOARDS: Readonly<Record<string, readonly BeatSlot[]>> = { "glass-harbor-trailer": GLASS_HARBOR_SLOTS };

const face = (ctx: Ctx, r: ResearchRec) => researchFaceOf(ctx.project.discipline, r.choice) ?? "notebook";
const template = (ctx: Ctx): AdTemplateId => (ctx.project.recipe.endsWith("ad-spot-30") ? "ad-spot-30" : "ad-social-15");
/** The engine a dry act's stand-in lands under: the part's chosen option, marked dry. */
export const dryEngine = (ctx: Ctx, kind: string, seconds: number): EngineView => {
  const part = ctx.plan.parts.find((p) => p.kind === kind);
  const o = part !== undefined && "options" in part ? part.options.find((x) => x.key === part.chosen) : undefined;
  return { provider: o?.provider ?? "dry", model: o?.model ?? "stand-in", usd: null, unpricedReason: "dry run", seconds, mode: "dry" };
};

function seed(ctx: Ctx): ResearchRec {
  const id = ctx.project.id;
  const replay = REPLAYS[id]?.();
  const slots = BEAT_BOARDS[id] ?? null;
  const ads = ctx.project.discipline === "ads";
  const brief = ads ? RAINSHELL : emptyBrief();
  const ideas = ads ? ideasStandIn(brief, template(ctx)) : ok([]);
  const picks = Object.fromEntries((slots ?? []).map((s) => [s.id, s.variants[0]?.id ?? null]));
  return {
    choice: "beats",
    topic: ctx.project.title,
    base: replay ?? null,
    ...(replay === undefined ? {} : { engine: dryEngine(ctx, "research", 540) }),
    scope: {},
    confirmed: replay === undefined ? null : {},
    ...(replay === undefined ? {} : { scopeDigest: replay.digest }),
    followUps: [],
    revisions: [],
    slots,
    picks: slots === null ? {} : picks,
    spine: slots === null ? null : Object.fromEntries(Object.entries(picks).filter((e): e is [string, string] => e[1] !== null)),
    brief,
    ideas: ideas.ok ? ideas.value : [],
    ideasDigest: ads && ideas.ok ? digest(brief) : null,
    picked: null,
    ...(ads ? { adsEngine: dryEngine(ctx, "research", 0) } : {}),
  };
}

/** The notebook dealt now: the base with every applied revision laid over it. */
export function activeSource(r: ResearchRec): NotebookSource | null {
  if (r.base === null) return null;
  if (r.revisions.length === 0) return r.base;
  const { notebook } = reviseNotebook(r.base.notebook, r.revisions);
  return sourceOf(notebook, { kind: r.base.kind, conclusions: r.base.conclusions, dimensions: r.base.dimensions, tags: r.base.tags });
}

export function cardsOf(r: ResearchRec): { source: NotebookSource; cards: Card[] } | null {
  const source = activeSource(r);
  return source === null ? null : { source, cards: buildCards(source) };
}

function summary(r: ResearchRec) {
  const dealt = cardsOf(r);
  if (dealt === null) return null;
  const s = scopeSummary(dealt.cards, r.scope, dealt.source);
  const moved = r.confirmed === null ? [] : scopeDiffs(dealt.cards, r.scope, r.confirmed, optInIds(dealt.source));
  return { ...dealt, s, moved };
}

const orphanOf = (r: ResearchRec) => (r.scopeDigest !== undefined && r.base !== null && r.scopeDigest !== r.base.digest ? { decisions: Object.keys(r.scope).length } : undefined);

function verdict(ctx: Ctx, r: ResearchRec): PartVerdict {
  const f = face(ctx, r);
  if (f === "ads") {
    const missing = missingOf(r.brief);
    if (missing.length > 0) return { state: "empty", codes: [{ code: "brief-incomplete", text: `brief needs ${missing.join(" · ")}` }] };
    if (r.ideas.length === 0) return { state: "working", codes: [{ code: "no-ideas", text: "brief ready, no ideas" }] };
    const idea = r.ideas.find((i) => i.id === r.picked);
    if (idea === undefined) return { state: "working", codes: [{ code: "ideas-unpicked", text: `${r.ideas.length} ideas, none picked` }] };
    if (r.ideasDigest !== digest(r.brief)) return { state: "working", codes: [{ code: "brief-changed", text: "brief changed since these ideas" }] };
    return { state: "ready", codes: [{ code: "idea-picked", text: `idea picked: ${idea.title}` }] };
  }
  if (f === "beats") {
    if (r.slots === null) return { state: "empty", codes: [{ code: "no-board", text: "no beat board" }] };
    const picked = Object.values(r.picks).filter((x) => x !== null).length;
    const moved = r.spine !== null && r.slots.some((s) => (r.picks[s.id] ?? null) !== (r.spine?.[s.id] ?? null));
    if (r.spine !== null && !moved) return { state: "ready", codes: [{ code: "spine-confirmed", text: "spine confirmed" }] };
    if (moved) return { state: "working", codes: [{ code: "spine-moved", text: "picks moved since the spine was composed" }] };
    return { state: picked === 0 ? "empty" : "working", codes: [{ code: "beats-picked", text: `${picked} of ${r.slots.length} beats picked` }] };
  }
  const x = summary(r);
  if (x === null) return { state: "empty", codes: [{ code: "no-notebook", text: "no notebook" }] };
  if (x.s.requiredGone.length > 0) return { state: "blocked", codes: [{ code: "required-out", text: `${x.s.requiredGone.length} required card(s) out of scope` }] };
  if (orphanOf(r) !== undefined) return { state: "working", codes: [{ code: "scope-orphaned", text: "scope decided on another notebook" }] };
  if (r.confirmed === null) return { state: "working", codes: [{ code: "notebook-ready", text: "notebook ready, scope not confirmed" }] };
  if (x.moved.length > 0) return { state: "working", codes: [{ code: "scope-diverged", text: `${x.moved.length} ${x.moved.length === 1 ? "card" : "cards"} moved since the scope was confirmed` }] };
  return { state: "ready", codes: [{ code: "scope-confirmed", text: "scope confirmed" }] };
}

const REQUIRED: readonly AdBriefField[] = ["product", "proposition", "cta"];
const missingOf = (b: AdBrief): AdBriefField[] => REQUIRED.filter((f) => String(b[f]).trim() === "");

function acts(ctx: Ctx, r: ResearchRec): PartActView[] {
  const f = face(ctx, r);
  if (f === "ads") return [{ act: "generate-ideas", label: r.ideas.length === 0 ? "generate ideas" : "regenerate ideas", needs: missingOf(r.brief) }];
  const run: PartActView = { act: "run-research", label: f === "beats" ? "deal beats" : r.base === null ? "run research" : "run again", needs: r.topic.trim() === "" ? ["topic"] : [] };
  if (f === "beats") return [run];
  const queued = r.followUps.filter((q) => q.status === "queued").length;
  return [run, { act: "follow-up", label: `run ${queued} follow-up${queued === 1 ? "" : "s"}`, needs: queued === 0 ? ["a question"] : r.base === null ? ["a notebook"] : [] }];
}

function units(ctx: Ctx, r: ResearchRec, act: PartActKind): Result<number> {
  const a = acts(ctx, r).find((x) => x.act === act);
  if (a === undefined) return err("invalid", `${act} is not an act of this research part`);
  if (a.needs.length > 0) return err("invalid", `${a.label} needs ${a.needs.join(" · ")}`);
  return ok(act === "follow-up" ? r.followUps.filter((q) => q.status === "queued").length : 1);
}

function land(ctx: Ctx, r: ResearchRec, act: PartActKind, at: number): Result<ResearchRec> {
  if (act === "generate-ideas") {
    const ideas = ideasStandIn(r.brief, template(ctx));
    return ideas.ok ? ok({ ...r, ideas: ideas.value, ideasDigest: digest(r.brief), picked: null, adsEngine: dryEngine(ctx, "research", 0) }) : ideas;
  }
  if (act === "run-research") {
    if (face(ctx, r) === "beats") {
      const slots = BEAT_BOARDS[ctx.project.id] ?? null;
      return ok({ ...r, slots, engine: dryEngine(ctx, "research", 0) });
    }
    const replay = REPLAYS[ctx.project.id]?.() ?? null;
    return ok({ ...r, base: replay, engine: dryEngine(ctx, "research", 540), revisions: [], followUps: [] });
  }
  if (act !== "follow-up" || r.base === null) return err("invalid", `${act} is not a research act`);
  const base = r.base;
  const revisions = [...r.revisions];
  const followUps = r.followUps.map((q): FollowUpRec => {
    if (q.status !== "queued") return q;
    const result = resultFor(q, base);
    if (result === undefined) return { ...q, status: "unanswered" };
    revisions.push({ id: `rev-${q.id}`, requestId: q.id, effects: result.effects, decided: {}, at: new Date(at).toISOString() });
    return { ...q, status: "returned", result };
  });
  return ok({ ...r, followUps, revisions });
}

/* ── ops ──────────────────────────────────────────────────────────────────── */

const no = (msg: string): Result<never> => err("invalid", msg);

function cardOp(r: ResearchRec, cardId: string, f: (c: Card, scope: Scope, optIn: ReadonlySet<string>) => Result<Scope>): Result<ResearchRec> {
  const dealt = cardsOf(r);
  if (dealt === null) return no("no notebook to scope");
  const card = dealt.cards.find((c) => c.id === cardId);
  if (card === undefined) return no(`no card ${cardId}`);
  const scope = f(card, r.scope, optInIds(dealt.source));
  return scope.ok ? ok({ ...r, scope: scope.value }) : scope;
}

function apply(ctx: Ctx, r: ResearchRec, op: ResearchOp): Result<ResearchRec> {
  switch (op.op) {
    case "descope":
    case "restore":
      return cardOp(r, op.cardId, (c, scope, optIn) => {
        const st = stateOf(scope, c.id, optIn);
        const out = op.op === "descope";
        if (st.descoped === out) return no(`${c.id} is already ${out ? "out of" : "in"} scope`);
        if (out && c.required) return no(c.requiredWhy ?? `${c.id} is required`);
        return ok({ ...scope, [c.id]: { ...st, descoped: out } });
      });
    case "like":
    case "deepen":
      return cardOp(r, op.cardId, (c, scope, optIn) => {
        const st = stateOf(scope, c.id, optIn);
        if ((op.op === "like" ? st.liked : st.deepen) === op.on) return no(`${c.id} is already ${op.on ? "" : "un"}${op.op === "like" ? "liked" : "marked deepen"}`);
        return ok({ ...scope, [c.id]: op.op === "like" ? { ...st, liked: op.on } : { ...st, deepen: op.on } });
      });
    case "confirm-scope": {
      const x = summary(r);
      if (x === null || r.base === null) return no("no notebook to confirm");
      if (x.s.requiredGone.length > 0) return no(`${x.s.requiredGone.map((c) => c.id).join(", ")} required`);
      if (r.confirmed !== null && x.moved.length === 0 && orphanOf(r) === undefined) return no("scope already confirmed");
      return ok({ ...r, confirmed: { ...r.scope }, scopeDigest: r.base.digest });
    }
    case "queue-follow-up": {
      const dealt = cardsOf(r);
      if (dealt === null) return no("no notebook to follow up");
      const card = op.cardId === undefined ? undefined : dealt.cards.find((c) => c.id === op.cardId);
      if (op.cardId !== undefined && card === undefined) return no(`no card ${op.cardId}`);
      const prompt = op.prompt.trim() || (card === undefined ? "" : (suggestedReason(card) ?? card.title));
      if (prompt === "") return no("a question needs words");
      const fu: FollowUpRec = { id: `fu-${r.followUps.length + 1}`, kind: card === undefined ? "question" : "deepen-card", ...(card === undefined ? {} : { cardId: card.id }), prompt, status: "queued" };
      return ok({ ...r, followUps: [...r.followUps, fu] });
    }
    case "drop-follow-up":
      if (!r.followUps.some((q) => q.id === op.id && q.status === "queued")) return no(`${op.id} is not queued`);
      return ok({ ...r, followUps: r.followUps.filter((q) => q.id !== op.id) });
    case "decide-effect": {
      const rev = r.revisions.find((x) => x.requestId === op.followUpId);
      if (rev === undefined || op.index < 0 || op.index >= rev.effects.length) return no(`no effect ${op.index + 1} on ${op.followUpId}`);
      if (rev.decided[op.index] !== undefined) return no(`effect ${op.index + 1} is already ${rev.decided[op.index]}`);
      return ok({ ...r, revisions: r.revisions.map((x) => (x === rev ? decide(x, op.index, op.decision) : x)) });
    }
    case "set-face":
      if (ctx.project.discipline !== "free") return no("only a free project chooses its research face");
      return op.face === r.choice ? no(`already ${op.face}`) : ok({ ...r, choice: op.face });
    case "pick-beat": {
      const slot = r.slots?.find((s) => s.id === op.slotId);
      if (slot === undefined) return no(`no slot ${op.slotId}`);
      if (op.variantId !== null && !slot.variants.some((v) => v.id === op.variantId)) return no(`${op.variantId} is not offered in ${op.slotId}`);
      if ((r.picks[slot.id] ?? null) === op.variantId) return no(`${op.slotId} already holds that pick`);
      return ok({ ...r, picks: { ...r.picks, [slot.id]: op.variantId } });
    }
    case "compose-spine": {
      if (r.slots === null) return no("no beat board");
      const sp = spineComplete({ ...r.picks }, [...r.slots]);
      if (!sp.complete) return no(`${sp.missing.length} part(s) without a pick: ${sp.missing.join(", ")}`);
      return ok({ ...r, spine: Object.fromEntries(Object.entries(r.picks).filter((e): e is [string, string] => e[1] !== null)) });
    }
    case "set-brief":
      return setBrief(r, op.field, op.value);
    case "pick-idea":
      if (!r.ideas.some((i) => i.id === op.ideaId)) return no(`no idea ${op.ideaId}`);
      return op.ideaId === r.picked ? no(`${op.ideaId} is already picked`) : ok({ ...r, picked: op.ideaId });
    // The zod door admits every editor's op on every key: another kind's op reaches here at run
    // time, and the real side's words for it (realScene.ts `nope`) are the answer, not a fall-through.
    default:
      return no("not a research op");
  }
}

function setBrief(r: ResearchRec, field: AdBriefField, value: string | readonly string[]): Result<ResearchRec> {
  if (field === "mustInclude") {
    if (typeof value === "string") return no("must-include is a list");
    const items = value.map((s) => s.trim()).filter((s) => s !== "");
    if (items.length > BRIEF_CAPS.mustIncludeItems || items.some((s) => s.length > BRIEF_CAPS.mustIncludeChars)) return no(`at most ${BRIEF_CAPS.mustIncludeItems} items of ${BRIEF_CAPS.mustIncludeChars} characters`);
    return ok({ ...r, brief: { ...r.brief, mustInclude: items } });
  }
  if (typeof value !== "string") return no(`${field} is one line`);
  if (value.length > BRIEF_CAPS[field]) return no(`${field} is at most ${BRIEF_CAPS[field]} characters`);
  return value === r.brief[field] ? no(`${field} unchanged`) : ok({ ...r, brief: { ...r.brief, [field]: value } });
}

export const RESEARCH = { seed, apply, verdict, acts, units, land, data: (ctx: Ctx, r: ResearchRec): ResearchData => researchData(ctx, r) };

function researchData(ctx: Ctx, r: ResearchRec): ResearchData {
  const orphan = orphanOf(r);
  return dataOf(r, face(ctx, r), ctx.project.discipline === "free", summary(r), {
    ...(orphan === undefined ? {} : { orphan }),
    missing: missingOf(r.brief),
    briefChanged: r.ideasDigest !== null && r.ideasDigest !== digest(r.brief),
    ...(r.slots === GLASS_HARBOR_SLOTS ? { cue: GLASS_HARBOR_CUE } : {}),
  });
}
