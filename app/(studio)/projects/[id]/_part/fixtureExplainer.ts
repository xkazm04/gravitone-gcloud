import "server-only";

import { expectedSecondsOf, judgeAcceptance, type Acceptance } from "@gt/domain/audio.accept";
import type { FxChain } from "@gt/domain/audio.fx";
import type { BlobRef } from "@gt/domain/blob";
import { err, ok, type Result } from "@gt/domain/errors";
import { albumOpLabel, type ArticleData, type EngineView, type PartActView, type PartVerdict, type StripsData, type TakeView, type VoiceData } from "@gt/domain/partView";

import type { DerivedCut } from "@/lib/cut/deriveTimeline";
import { explainerCut as deriveExplainerCut, linesOf as cardLines, spokenS, words } from "@/lib/cut/explainer";
import { FX_STAND_IN } from "@/lib/sound/voiceFx/standIn";

import { engineOf, held, takeView, type TakeRec } from "./fixtureScoreRecs.ts";
import { asObj, type KCtx, type KindModule } from "./kinds.ts";

// THE EXPLAINER'S ARTICLE, STRIPS AND VOICE PARTS (L40; STEPS-DESIGN §2 "explainer parts"), and
// the cut it lays them on. The article is the article producer's run (lib/articles: research,
// outline, draft, check, critique - its Board packet is the article gate); the strips are the
// strips run's cards (their packet is the strips gate); the voice is lines x takes, one line per
// card. The cut part reads these through `explainerCut` and the finish line judges it like a
// film's, without the music rows: an explainer plans no score.
//
// THE RECORDS (L43): each part keeps its working record as its own step record (`article`,
// `strips`, `voice` in @gt/domain/steps); the voice editor's ops write it on the real side. The
// article and strips producers still book their outputs on their jobs (L37) - nothing lands those
// two records yet but an import. On the fixture side each dry act lands a stand-in that says what
// it is by its engine (`mode: "dry"`), never a borrowed project's.

export type ArticleSection = { readonly id: string; readonly heading: string; readonly body: string };
export type ArticleRec = { readonly title: string | null; readonly sections: readonly ArticleSection[]; readonly engine?: EngineView };

export type StripCard = { readonly id: string; readonly section: string; readonly title: string; readonly caption: string; readonly state: "drawn" | "pending" | "refused"; readonly blob?: BlobRef; readonly why?: string };
export type StripsRec = { readonly cards: readonly StripCard[]; readonly engine?: EngineView };

/** A narration take: a score take's fields, and an FX version's (packages/domain/src/steps/parts.ts). */
export type VoiceTakeRec = TakeRec & { readonly fxOf?: string; readonly describe?: string; readonly chain?: FxChain; readonly accept?: Acceptance };
export type FxAskRec = { readonly from: string; readonly describe: string };

export type VoiceRec = {
  /** The operator's rewrite of a line; absent = the card's caption. */
  readonly text: Readonly<Record<string, string>>;
  readonly takes: Readonly<Record<string, VoiceTakeRec>>;
  readonly byLine: Readonly<Record<string, { readonly takeIds: readonly string[]; readonly active: string | null }>>;
  /** A voice fx asked for and not yet rendered, per line (absent = none). */
  readonly fxAsk?: Readonly<Record<string, FxAskRec>>;
};

const no = (m: string): Result<never> => err("invalid", m);
const topicOf = (ctx: KCtx): string => ctx.project.title;

/* ── article ──────────────────────────────────────────────────────────────── */

/** The article run's steps (lib/articles drive), as its dry stand-in reports them. */
const STEPS = ["research", "outline", "draft", "check", "critique"] as const;
const HEADINGS = ["What it is", "How it works", "Where it breaks", "What to do"] as const;

function articleData(_ctx: KCtx, a: ArticleRec): ArticleData {
  return {
    face: "article",
    title: a.title,
    sections: a.sections.map((s) => ({ id: s.id, heading: s.heading, words: words(s.body), lead: s.body.split(/(?<=\.)\s/)[0] ?? "" })),
    words: a.sections.reduce((n, s) => n + words(s.body), 0),
    steps: a.title === null ? [] : STEPS.map((name) => ({ name, state: "done" as const, usd: null })),
    ...(a.engine === undefined ? {} : { engine: a.engine }),
  };
}

const articleVerdict = (_ctx: KCtx, a: ArticleRec): PartVerdict =>
  a.sections.length === 0 ? { state: "empty", codes: [{ code: "no-article", text: "no article written" }] } : { state: "ready", codes: [{ code: "article-written", text: `${a.sections.length} sections · ${a.sections.reduce((n, s) => n + words(s.body), 0)} words` }] };

export const ARTICLE_KIND: KindModule<"article"> = {
  ops: [],
  seed: () => ({ title: null, sections: [] }),
  apply: () => no("an article is its run's: nothing in it is edited here"),
  label: () => "article",
  verdict: articleVerdict,
  acts: (_ctx, a) => [{ act: "write-article", label: a.title === null ? "write article" : "write again", needs: [] }],
  units: (_ctx, _a, act) => (act === "write-article" ? ok(1) : no(`${act} is not an article act`)),
  land: (ctx, _a, act) => {
    if (act !== "write-article") return no(`${act} is not an article act`);
    const topic = topicOf(ctx);
    const sections = HEADINGS.map((heading, i) => ({ id: `s${i + 1}`, heading, body: `${topic}: ${heading.toLowerCase()}.` }));
    return ok({ title: ctx.project.title, sections, engine: engineOf(ctx, "article", 0) });
  },
  data: articleData,
  actLabel: () => "article run",
  // Each written by its `toRecords` through the record's door; read back as written.
  fromRecords: (recs) => ({ title: null, sections: [], ...(recs.get("article") as Partial<ArticleRec> | undefined) }),
  toRecords: (a) => ({ article: asObj(a) }),
};

/* ── strips ───────────────────────────────────────────────────────────────── */

const plannedCards = (ctx: KCtx): number => {
  const p = ctx.plan.parts.find((x) => x.kind === "strips");
  return p !== undefined && "units" in p ? p.units : 0;
};

function stripsVerdict(ctx: KCtx, s: StripsRec): PartVerdict {
  if (s.cards.length === 0) return { state: "empty", codes: [{ code: "no-cards", text: "no cards drawn" }] };
  const drawn = s.cards.filter((c) => c.state === "drawn").length;
  const refused = s.cards.filter((c) => c.state === "refused").length;
  const text = `${drawn} of ${s.cards.length} cards drawn`;
  if (refused > 0) return { state: "blocked", codes: [{ code: "card-refused", text: `${refused} card${refused === 1 ? "" : "s"} refused` }, { code: "cards-drawn", text }] };
  return drawn === s.cards.length && drawn >= plannedCards(ctx) ? { state: "ready", codes: [{ code: "cards-drawn", text }] } : { state: "working", codes: [{ code: "cards-drawn", text }] };
}

const stripsActs = (ctx: KCtx, s: StripsRec): PartActView[] => [{ act: "draw-strips", label: s.cards.length === 0 ? `draw ${plannedCards(ctx)} cards` : "draw again", needs: ctx.rec("article").sections.length === 0 ? ["an article"] : [] }];

export const STRIPS_KIND: KindModule<"strips"> = {
  ops: [],
  seed: () => ({ cards: [] }),
  apply: () => no("strips are their run's: nothing in them is edited here"),
  label: () => "strips",
  verdict: stripsVerdict,
  acts: stripsActs,
  units: (ctx, s, act) => {
    const a = stripsActs(ctx, s)[0];
    return act !== "draw-strips" || a === undefined ? no(`${act} is not a strips act`) : a.needs.length > 0 ? no(`${a.label} needs ${a.needs.join(" · ")}`) : ok(plannedCards(ctx));
  },
  land: (ctx, _s, act) => {
    if (act !== "draw-strips") return no(`${act} is not a strips act`);
    const sections = ctx.rec("article").sections;
    if (sections.length === 0) return no("draw strips needs an article");
    const cards = Array.from({ length: Math.max(1, plannedCards(ctx)) }, (_, i): StripCard => {
      const s = sections[i % sections.length] ?? sections[0];
      return { id: `card-${i + 1}`, section: s?.id ?? "", title: s?.heading ?? `card ${i + 1}`, caption: s?.body ?? "", state: "drawn" };
    });
    return ok({ cards, engine: engineOf(ctx, "strips", 0) });
  },
  data: (ctx, s): StripsData => ({
    face: "strips",
    planned: plannedCards(ctx),
    cards: s.cards.map((c) => ({ id: c.id, title: c.title, caption: c.caption, section: c.section, state: c.state, ...(c.blob === undefined ? {} : { blob: c.blob.sha256 }), ...(c.why === undefined ? {} : { why: c.why }) })),
    ...(s.engine === undefined ? {} : { engine: s.engine }),
  }),
  actLabel: () => "strips run",
  fromRecords: (recs) => ({ cards: [], ...(recs.get("strips") as Partial<StripsRec> | undefined) }),
  toRecords: (x) => ({ strips: asObj(x) }),
};

/* ── voice ────────────────────────────────────────────────────────────────── */

const linesOf = (ctx: KCtx, v: VoiceRec) => cardLines(ctx.rec("strips").cards, v);
const activeOf = (v: VoiceRec, lineId: string): TakeRec | undefined => {
  const a = v.byLine[lineId]?.active;
  return a === null || a === undefined ? undefined : v.takes[a];
};

function voiceVerdict(ctx: KCtx, v: VoiceRec): PartVerdict {
  const lines = linesOf(ctx, v);
  if (lines.length === 0) return { state: "empty", codes: [{ code: "no-lines", text: "no lines to record" }] };
  const done = lines.filter((l) => held(activeOf(v, l.id))).length;
  const text = `${done} of ${lines.length} lines recorded`;
  return done === lines.length ? { state: "ready", codes: [{ code: "lines-recorded", text }] } : { state: done === 0 ? "empty" : "working", codes: [{ code: "lines-recorded", text }] };
}

function voiceApply(ctx: KCtx, v: VoiceRec, op: Parameters<KindModule<"voice">["apply"]>[2]): Result<VoiceRec> {
  const line = linesOf(ctx, v).find((l) => l.id === op.lineId);
  if (line === undefined) return no(`no line ${op.lineId}`);
  const slot = v.byLine[line.id] ?? { takeIds: [], active: null };
  switch (op.op) {
    case "voice-line":
      return op.text.trim() === "" ? no("a line needs words") : op.text === line.text ? no("unchanged") : ok({ ...v, text: { ...v.text, [line.id]: op.text } });
    case "voice-use":
      return !slot.takeIds.includes(op.takeId) ? no(`no take ${op.takeId} on this line`) : slot.active === op.takeId ? no("already in use") : ok({ ...v, byLine: { ...v.byLine, [line.id]: { ...slot, active: op.takeId } } });
    case "voice-mark": {
      const t = v.takes[op.takeId];
      if (t === undefined || !slot.takeIds.includes(op.takeId)) return no(`no take ${op.takeId} on this line`);
      return t.mark === op.mark ? no("unchanged") : ok({ ...v, takes: { ...v.takes, [t.id]: { ...t, mark: op.mark } } });
    }
    case "voice-fx-ask": {
      if (v.takes[op.takeId] === undefined || !slot.takeIds.includes(op.takeId)) return no(`no take ${op.takeId} on this line`);
      const describe = op.describe.trim();
      if (describe === "") return no("a voice fx needs a description");
      if (describe.length > FX_DESCRIBE_MAX) return no(`a voice fx description is at most ${FX_DESCRIBE_MAX} characters`);
      const was = v.fxAsk?.[line.id];
      if (was?.from === op.takeId && was.describe === describe) return no("unchanged");
      return ok({ ...v, fxAsk: { ...v.fxAsk, [line.id]: { from: op.takeId, describe } } });
    }
  }
}

/** lib/sound/voiceFx/propose.ts DESCRIBE_MAX, the VOICE record's own bound on the words. */
const FX_DESCRIBE_MAX = 400;

/** Why `fx-line` cannot run on a line, in the producer's words (packages/producers/src/voice/define.ts `fxPlan`). */
function fxRefusal(ctx: KCtx, v: VoiceRec, target: string | undefined): string | null {
  if (target === undefined) return "voice fx names a line";
  if (!linesOf(ctx, v).some((l) => l.id === target)) return `no line ${target}`;
  const ask = v.fxAsk?.[target];
  if (ask === undefined) return `no voice fx is asked for ${target}`;
  return (v.byLine[target]?.takeIds ?? []).includes(ask.from) ? null : `take ${ask.from} is not a take of ${target}`;
}

/**
 * The fixture's FX landing: the stand-in chain over the source take, a new take beside it (not
 * made active), the ask cleared. Its verdict is what the judge says of the stand-in's real
 * content - a dry stand-in is silence, and silence measures as no loudness, no peak and a tail
 * as long as the take - so the editor's failed-acceptance state is drawn from a true measure.
 * The real side does NOT measure a dry stand-in (lib/producers/voiceFx.ts): there a verdict is a
 * Ledger row, and a row for silence would teach that narration fails; here nothing is written.
 */
function landFxLine(ctx: KCtx, v: VoiceRec, at: number, target: string | undefined): Result<VoiceRec> {
  const why = fxRefusal(ctx, v, target);
  const ask = target === undefined ? undefined : v.fxAsk?.[target];
  if (why !== null || target === undefined || ask === undefined) return no(why ?? "voice fx names a line");
  const slot = v.byLine[target] ?? { takeIds: [], active: null };
  const line = linesOf(ctx, v).find((l) => l.id === target);
  const secs = v.takes[ask.from]?.seconds ?? spokenS(line?.text ?? "");
  const id = `vtake-${at.toString(36)}-${Object.keys(v.takes).length + 1}`;
  const silence = { integratedLufs: null, truePeakDb: null, lra: null, clippedSamples: 0, leadSilenceS: secs, tailSilenceS: secs, durationS: secs };
  const t: VoiceTakeRec = {
    id,
    label: ask.describe,
    at,
    seconds: secs,
    mark: null,
    engine: engineOf(ctx, "voice", 0),
    sections: [{ name: "line", startMs: 0, endMs: Math.round(secs * 1000) }],
    fxOf: ask.from,
    describe: ask.describe,
    chain: FX_STAND_IN,
    accept: judgeAcceptance(silence, "voice-take", expectedSecondsOf(line?.text ?? "")),
  };
  const asks = Object.fromEntries(Object.entries(v.fxAsk ?? {}).filter(([k]) => k !== target));
  const { fxAsk: _answered, ...rest } = v;
  void _answered;
  return ok({ ...rest, ...(Object.keys(asks).length === 0 ? {} : { fxAsk: asks }), takes: { ...v.takes, [id]: t }, byLine: { ...v.byLine, [target]: { takeIds: [...slot.takeIds, id], active: slot.active } } });
}

/** A take's view, with its FX version and its verdict when it has them. */
function voiceTakeView(t: VoiceTakeRec | undefined, id: string, active: boolean): TakeView {
  const base = takeView(t, id, active);
  if (t === undefined) return base;
  return {
    ...base,
    ...(t.fxOf === undefined || t.describe === undefined || t.chain === undefined ? {} : { fx: { of: t.fxOf, describe: t.describe, chain: t.chain } }),
    ...(t.accept === undefined ? {} : { accept: { verdict: t.accept.verdict, reasons: t.accept.reasons } }),
  };
}

/** Recording is per line: the editor offers it for the selected line (with its target), so the
 *  part-level act bar carries nothing a confirm without a line could only refuse. */
const voiceActs = (_ctx: KCtx, _v: VoiceRec): PartActView[] => [];

export const VOICE_KIND: KindModule<"voice"> = {
  ops: ["voice-use", "voice-mark", "voice-line", "voice-fx-ask"],
  seed: () => ({ text: {}, takes: {}, byLine: {} }),
  apply: voiceApply,
  label: (op) => albumOpLabel(op),
  verdict: voiceVerdict,
  acts: voiceActs,
  units: (ctx, v, act, target) => {
    if (act === "fx-line") {
      const why = fxRefusal(ctx, v, target);
      return why === null ? ok(1) : no(why);
    }
    if (act !== "record-line") return no(`${act} is not a voice act`);
    return linesOf(ctx, v).some((l) => l.id === target) ? ok(1) : no(target === undefined ? "record names a line" : `no line ${target}`);
  },
  land: (ctx, v, act, at, _jobId, target) => {
    if (act === "fx-line") return landFxLine(ctx, v, at, target);
    const line = linesOf(ctx, v).find((l) => l.id === target);
    if (act !== "record-line" || line === undefined) return no("record names a line");
    const slot = v.byLine[line.id] ?? { takeIds: [], active: null };
    const id = `vtake-${at.toString(36)}-${Object.keys(v.takes).length + 1}`;
    const secs = spokenS(line.text);
    const t: TakeRec = { id, label: `take ${slot.takeIds.length + 1}`, at, seconds: secs, mark: null, engine: engineOf(ctx, "voice", 0), sections: [{ name: "line", startMs: 0, endMs: Math.round(secs * 1000) }] };
    return ok({ ...v, takes: { ...v.takes, [id]: t }, byLine: { ...v.byLine, [line.id]: { takeIds: [...slot.takeIds, id], active: slot.active ?? id } } });
  },
  data: (ctx, v): VoiceData => ({
    face: "voice",
    voice: engineOf(ctx, "voice", 0).model,
    lines: linesOf(ctx, v).map((l) => {
      const slot = v.byLine[l.id] ?? { takeIds: [], active: null };
      const ask = v.fxAsk?.[l.id];
      return { id: l.id, text: l.text, card: l.card, takes: slot.takeIds.map((id) => voiceTakeView(v.takes[id], id, id === slot.active)), activeTakeId: slot.active, ...(ask === undefined ? {} : { fxAsk: { from: ask.from, describe: ask.describe } }) };
    }),
  }),
  actLabel: (act) => (act === "fx-line" ? "voice fx take" : "line take"),
  fromRecords: (recs) => ({ text: {}, takes: {}, byLine: {}, ...(recs.get("voice") as Partial<VoiceRec> | undefined) }),
  toRecords: (v) => ({ voice: asObj(v) }),
};

/* ── the explainer's cut ──────────────────────────────────────────────────── */

/** Strips as picture, voice as the vo lane: the DerivedCut lib/cut's finish line and edit maths
 *  read. The derivation is lib/cut/explainer.ts, which the cut gate's verdict reads too. */
export const explainerCut = (ctx: KCtx): DerivedCut => deriveExplainerCut({ cards: ctx.rec("strips").cards, voice: ctx.rec("voice"), targetS: ctx.project.targetS });
