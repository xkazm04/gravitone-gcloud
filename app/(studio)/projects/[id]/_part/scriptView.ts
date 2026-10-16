import "server-only";

import { AD_END_CARD_HOLD_S, AD_RUNTIME_RANGE } from "@/lib/ads/types";
import { countsOf } from "@/lib/notebook/counts";
import { optInIds, scopeSummary, type Card } from "@/lib/research/scope";
import { ledgerFor } from "@/lib/script/constraints";
import { runGate, type GateReport } from "@/lib/script/gate";
import { ATTRIBUTION_OF } from "@/lib/script/impact";
import type { Beat } from "@/lib/script/types";
import { KIND_LABEL, NOTE_KINDS, overrideLineOf, usageIn, type Version } from "@/lib/script/versions";
import { energyPoints } from "@/lib/script/trailer/cut";
import { derive, edited } from "@/lib/script/trailer/ops";
import { runStructureCheck, ADVISORY_RULES } from "@/lib/script/trailer/structure";
import { atSeconds } from "@/lib/script/trailer/types";
import { conflictsIn, stillSpoken } from "@/app/_phases/script/scopeConflicts";
import type { Candidate, Connector, Finding, GateView, ScriptData, ScriptFace, VersionView } from "@gt/domain/partView";

import type { Ctx } from "./fixture.ts";
import { digest } from "./hash.ts";
import { cardsOf } from "./fixtureResearch.ts";
import { baselineOf, rollupOf, type ScriptRec } from "./fixtureScript.ts";

// The script record and the v1 checks over it, drawn as the view (`ScriptData`). Gate findings,
// ledger rows and structure findings cross as the WORK's sentences: a structure finding's
// `cites` (a registry path) never crosses, and a sentence that names code (a backticked
// identifier such as `magnitudeOf`, a file path) is developer text and is dropped from its
// detail - INVENTORY §2 "prose to delete", which named exactly those lines on screen in v1.

/** The chains a version speaks: its own beats where the edit plan wrote some, else each candidate's. */
export function chainsOf(s: ScriptRec, v: Version): Record<string, Beat[]> {
  return Object.fromEntries(s.candidates.map((c) => [c.id, v.beats?.[c.id] ?? c.beats]));
}

const DEV = /`[^`]+`|\b[\w./-]+\.(?:md|ts|tsx|json|mts)\b|registry:/;
/** Keep the work's sentences; drop the ones that address a developer. */
export function workText(detail: string): string {
  const kept = detail.split(/(?<=[.!?])\s+/).filter((sentence) => !DEV.test(sentence));
  return kept.join(" ").trim();
}

const findingOf = (f: { rule: string; subject: string; verdict: Finding["verdict"]; detail: string; at?: string; quote?: string }): Finding => ({
  rule: f.rule,
  subject: f.subject,
  verdict: f.verdict,
  detail: workText(f.detail),
  ...(f.at === undefined ? {} : { at: f.at }),
  ...(f.quote === undefined ? {} : { quote: f.quote }),
});

const gateView = (g: GateReport): GateView => ({
  blocked: g.blocked,
  violations: g.violations,
  passes: g.passes,
  unmeasured: g.unmeasured,
  notEngaged: g.notEngaged,
  enforced: g.enforced,
  findings: g.findings.map(findingOf),
});

function beatsWithSeconds(beats: readonly Beat[], durationS: number, attribution: Readonly<Record<string, readonly string[]>>) {
  return beats.map((b, i) => {
    const at = atSeconds(b.at) ?? 0;
    const next = beats[i + 1];
    const end = next === undefined ? durationS : (atSeconds(next.at) ?? at);
    return { at: b.at, seconds: Math.max(0, end - at), kind: b.kind, label: b.label, text: b.text, connector: b.connector as Connector, cards: attribution[b.at] ?? [] };
  });
}

const versionView = (v: Version): VersionView => {
  const line = overrideLineOf(v);
  return { id: v.id, label: v.label, basedOn: v.basedOn, at: new Date(v.createdAt).toISOString(), notes: v.notes.length, ...(line === null ? {} : { override: line }) };
};

function documentData(ctx: Ctx, s: ScriptRec): ScriptData {
  const dealt = cardsOf(ctx.research());
  const cards: Card[] = dealt?.cards ?? [];
  const title = new Map(cards.map((c) => [c.id, c.title]));
  const base = baselineOf(s);
  const rollup = rollupOf(ctx, s, base);
  const chains = chainsOf(s, base);
  const scope = ctx.research().scope;
  const optIn = dealt === null ? undefined : optInIds(dealt.source);
  const candidates: Candidate[] = s.candidates.map((c) => {
    const beats = chains[c.id] ?? c.beats;
    const report = rollup.byRender[c.id] ?? runGate({ id: c.id, beats });
    const ledger = dealt === null ? null : ledgerFor({ id: c.id, beats }, dealt.source);
    return {
      id: c.id,
      title: c.title,
      engine: c.engineLabel,
      durationS: c.durationS,
      words: c.words,
      beats: beatsWithSeconds(beats, c.durationS, base.attribution?.[c.id] ?? ATTRIBUTION_OF(c.id)),
      weakness: c.weakness,
      gate: gateView(report),
      ledger: (ledger?.rows ?? []).map((r) => ({ unknownId: r.unknownId, unknown: r.unknown.what, state: r.effective, how: workText(r.how), ...(r.at === undefined ? {} : { at: r.at }), ...(r.quote === undefined ? {} : { quote: r.quote }) })),
      usage: cards.map((card) => {
        const u = usageIn(base, c.id, card.id);
        return { cardId: card.id, title: card.title, use: u.kind, seconds: u.seconds, beats: u.beats, ...(u.why === undefined ? {} : { why: u.why }) };
      }),
    };
  });
  const counts = dealt === null ? null : countsOf(dealt.source.notebook);
  const staged = s.staged === null ? undefined : (() => {
    const g = rollupOf(ctx, s, s.staged);
    return { ...versionView(s.staged), gate: { blocked: g.blocked, blocking: g.blocking }, refusals: s.staged.refusals.map((r) => `${title.get(r.cardId) ?? r.cardId} · ${KIND_LABEL[r.kind]} — ${r.why}`) };
  })();
  return {
    face: "document",
    targetS: ctx.project.targetS,
    writtenAgainst: {
      claims: counts?.facts ?? 0,
      loadBearing: counts?.loadBearing ?? 0,
      mechanisms: counts?.mechanisms ?? 0,
      reversals: counts?.reversals ?? 0,
      kept: dealt === null ? 0 : scopeSummary(cards, scope, dealt.source).kept,
    },
    candidates,
    adopted: s.adopted,
    rollup: { enforced: rollup.enforced, blocking: rollup.blocking },
    versions: s.accepted.map(versionView),
    ...(staged === undefined ? {} : { staged }),
    notes: s.notes.map((n) => ({ id: n.id, cardId: n.cardId, cardTitle: title.get(n.cardId) ?? n.cardId, kind: n.kind, label: KIND_LABEL[n.kind], ...(n.text === undefined ? {} : { text: n.text }) })),
    noteKinds: NOTE_KINDS.map((k) => ({ kind: k.kind, label: k.label })),
    conflicts: conflictsIn(base, cards, scope, optIn).map((id) => {
      const card = cards.find((c) => c.id === id);
      const spokenBy = card === undefined ? [] : stillSpoken(base, card, scope, optIn).map((x) => ({ candidateId: x.renderId, seconds: x.seconds }));
      return { cardId: id, title: title.get(id) ?? id, spokenBy };
    }),
  };
}

function trailerData(ctx: Ctx, s: ScriptRec): ScriptData {
  const log = s.cut;
  const cut = log === null ? null : derive(log);
  const report = cut === null ? null : runStructureCheck(cut.cut, { budget: cut.budget });
  const beats = cut?.cut.beats ?? [];
  const last = beats[beats.length - 1];
  const r = ctx.research();
  return {
    face: "trailer",
    targetS: ctx.project.targetS,
    runtimeS: last === undefined ? null : atSeconds(last.at),
    ...(cut?.cut.cue === undefined ? {} : { cue: { title: cut.cut.cue.title, frozen: cut.cut.cue.frozen } }),
    lane: cut?.cut.lane ?? "wide-release",
    movements: (cut?.cut.movements ?? []).map((m) => ({ id: m.id, role: m.role, label: m.label, ...(m.cueSection === undefined ? {} : { cue: cut?.cut.cue?.sections.find((x) => x.id === m.cueSection)?.label ?? m.cueSection }) })),
    beats: beats.map((b) => ({ id: b.id, movement: b.movement, at: b.at, kind: b.kind, connector: b.connector as Connector, label: b.label, text: b.text, raises: b.raises ?? [], spends: b.spends ?? [], edited: log !== null && edited(log, b.id) })),
    energy: cut === null ? [] : energyPoints(cut.cut).map((p) => ({ beatId: p.beatId, x: p.x, y: p.y })),
    structure: {
      malformed: report?.malformed ?? null,
      violations: report?.violations ?? 0,
      passes: report?.passes ?? 0,
      unmeasured: report?.unmeasured ?? 0,
      notEngaged: report?.notEngaged ?? 0,
      enforced: report?.enforced ?? 0,
      findings: (report?.findings ?? []).map((f) => ({ ...findingOf(f), ...(f.beatId === undefined ? {} : { beatId: f.beatId }), advisory: ADVISORY_RULES.includes(f.rule) })),
    },
    spineMoved: r.spine !== null && s.spineKey !== null && digest(r.spine) !== s.spineKey,
    origin: "fixture",
  };
}

function adsData(ctx: Ctx, s: ScriptRec): ScriptData {
  const r = ctx.research();
  const idea = r.ideas.find((i) => i.id === r.picked) ?? null;
  const tpl = ctx.project.recipe.endsWith("ad-spot-30") ? "ad-spot-30" : "ad-social-15";
  return {
    face: "ads",
    idea: idea === null ? null : { id: idea.id, title: idea.title, angle: idea.angle },
    ideaChanged: s.scenarios.length > 0 && s.scenariosIdea !== r.picked,
    targetS: ctx.project.targetS,
    range: AD_RUNTIME_RANGE[tpl],
    scenarios: s.scenarios.map((x) => {
      const shotsS = x.shots.reduce((n, sh) => n + sh.durationS, 0);
      return {
        id: x.id,
        title: x.title,
        logline: x.logline,
        shots: x.shots.map((sh) => ({ id: sh.id, durationS: sh.durationS, image: sh.image, motion: sh.motion, super: sh.super })),
        endCard: { cta: x.endCard.cta, line: x.endCard.line, holdS: AD_END_CARD_HOLD_S },
        runtimeS: Math.round((shotsS + AD_END_CARD_HOLD_S) * 10) / 10,
        musicMood: x.musicMood,
      };
    }),
    picked: s.picked,
    ...(s.adsEngine === undefined ? {} : { engine: s.adsEngine }),
  };
}

export function scriptData(ctx: Ctx, s: ScriptRec, face: ScriptFace): ScriptData {
  return face === "ads" ? adsData(ctx, s) : face === "trailer" ? trailerData(ctx, s) : documentData(ctx, s);
}
