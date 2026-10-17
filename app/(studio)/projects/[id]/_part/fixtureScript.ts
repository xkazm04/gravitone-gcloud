import "server-only";

import type { AdScenario, AdTemplateId } from "@/lib/ads/types";
import { optInIds } from "@/lib/research/scope";
import { gateChains } from "@/lib/script/gate";
import { RENDERS } from "@/lib/script/renders";
import type { ScriptRender } from "@/lib/script/types";
import { BASELINE, overrideFrom, type Note, type Version } from "@/lib/script/versions";
import { composeCut } from "@/lib/script/trailer/cut";
import { derive, editBeat, newLog, rebase, resetBeat, type CutLog } from "@/lib/script/trailer/ops";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/lib/studio/trailerFixtures";
import { recalibrate } from "@/lib/script/recalibrate";
import { acceptInto, restoreAs } from "@/lib/script/history";
import { err, ok, type Result } from "@gt/domain/errors";
import { scriptFaceOf, type EngineView, type PartActKind, type PartActView, type PartVerdict, type ScriptData, type ScriptOp } from "@gt/domain/partView";

import { scenariosStandIn } from "./fixtureAds.ts";
import type { Ctx } from "./fixture.ts";
import { digest } from "./hash.ts";
import { cardsOf, dryEngine } from "./fixtureResearch.ts";
import { chainsOf, scriptData } from "./scriptView.ts";

// SCRIPT, as the fixture side computes it. The intelligence is v1's, called: `gateChains` /
// `runGate` (the honesty rule, the weakest chain), `recalibrate` with its four refusal guards
// applied BEFORE the plan (app/_phases/script/recalibrate.ts), `restoreAs` (restore is forward),
// `overrideFrom` (an accept over a blocking gate leaves its receipt on the version), the trailer
// CutLog (`editBeat`, `resetBeat`, `rebase` when the spine moves) and `composeCut`.
//
// What changed from v1: the three hard-coded renders are no longer every project's candidates.
// They are the stand-in of a DRY compose turn for the one project whose notebook they were
// written from (why-bitcoin); any other project composes nothing on a dry run and says so. The
// clock is read: a candidate far over the project's target keeps the part from READY.

export type ScriptRec = {
  readonly candidates: readonly ScriptRender[];
  readonly adopted: string | null;
  readonly engine?: EngineView;
  readonly notes: readonly Note[];
  readonly accepted: readonly Version[];
  readonly staged: Version | null;
  readonly cut: CutLog | null;
  readonly spineKey: string | null;
  readonly scenarios: readonly AdScenario[];
  readonly scenariosIdea: string | null;
  readonly picked: string | null;
  readonly adsEngine?: EngineView;
};

const COMPOSED: Readonly<Record<string, readonly ScriptRender[]>> = { "why-bitcoin": RENDERS };

const face = (ctx: Ctx) => scriptFaceOf(ctx.project.discipline, ctx.research().choice) ?? "document";
const template = (ctx: Ctx): AdTemplateId => (ctx.project.recipe.endsWith("ad-spot-30") ? "ad-spot-30" : "ad-social-15");
export const baselineOf = (s: ScriptRec): Version => s.accepted[s.accepted.length - 1] ?? BASELINE;

function spineCut(ctx: Ctx): { log: CutLog; key: string } | null {
  const r = ctx.research();
  if (r.spine === null || r.slots === null) return null;
  const cut = composeCut({ projectId: ctx.project.id, title: ctx.project.title, picks: { ...r.spine }, slots: [...r.slots], cue: GLASS_HARBOR_CUE });
  return { log: newLog(cut, GLASS_HARBOR_BUDGET), key: digest(r.spine) };
}

function seed(ctx: Ctx): ScriptRec {
  const composed = COMPOSED[ctx.project.id];
  const cut = face(ctx) === "trailer" ? spineCut(ctx) : null;
  return {
    candidates: composed ?? [],
    adopted: null,
    ...(composed === undefined ? {} : { engine: dryEngine(ctx, "script", 840) }),
    notes: [],
    accepted: [BASELINE],
    staged: null,
    cut: cut?.log ?? null,
    spineKey: cut?.key ?? null,
    scenarios: [],
    scenariosIdea: null,
    picked: null,
  };
}

/** The gate over the chains a version speaks (its own beats, else the candidates'). */
export function rollupOf(ctx: Ctx, s: ScriptRec, v: Version) {
  const source = cardsOf(ctx.research())?.source;
  return gateChains(chainsOf(s, v), source === undefined ? {} : { source, conclusions: source.conclusions });
}

const fmt = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function verdict(ctx: Ctx, s: ScriptRec): PartVerdict {
  const f = face(ctx);
  if (f === "ads") {
    const idea = ctx.research().picked;
    if (idea === null) return { state: "empty", codes: [{ code: "no-idea", text: "no idea picked" }] };
    if (s.scenarios.length === 0) return { state: "working", codes: [{ code: "no-scenarios", text: "idea picked, no scenarios" }] };
    if (s.scenariosIdea !== idea) return { state: "working", codes: [{ code: "idea-changed", text: "idea changed since these scenarios" }] };
    const sc = s.scenarios.find((x) => x.id === s.picked);
    return sc === undefined ? { state: "working", codes: [{ code: "scenarios-unpicked", text: `${s.scenarios.length} scenarios, none picked` }] } : { state: "ready", codes: [{ code: "scenario-picked", text: `scenario picked: ${sc.title}` }] };
  }
  if (f === "trailer") {
    if (s.cut === null) return { state: "empty", codes: [{ code: "no-cut", text: "no cut composed" }] };
    const now = spineCut(ctx);
    if (now === null || now.key !== s.spineKey) return { state: "working", codes: [{ code: "spine-moved", text: "spine moved since this cut was composed" }] };
    return { state: "ready", codes: [{ code: "cut-composed", text: "cut composed" }] };
  }
  if (s.candidates.length === 0) return { state: "empty", codes: [{ code: "no-candidates", text: "no candidates" }] };
  const adopted = s.candidates.find((c) => c.id === s.adopted);
  if (adopted === undefined) return { state: "working", codes: [{ code: "unadopted", text: `${s.candidates.length} candidates, none adopted` }] };
  const base = baselineOf(s);
  const gate = rollupOf(ctx, s, base).byRender[adopted.id];
  if (gate?.blocked === true && base.override === undefined)
    return { state: "blocked", codes: [{ code: "gate-violation", text: `${gate.violations} gate violation(s) in ${adopted.title}` }] };
  if (s.staged !== null) return { state: "working", codes: [{ code: "staged", text: `${s.staged.label} waits for accept` }] };
  const target = ctx.project.targetS;
  if (target !== null && adopted.durationS > target * 1.25)
    return { state: "working", codes: [{ code: "over-clock", text: `${fmt(adopted.durationS)} against a ${fmt(target)} clock` }] };
  return { state: "ready", codes: [{ code: "candidate-adopted", text: `adopted: ${adopted.title}` }] };
}

function acts(ctx: Ctx, s: ScriptRec): PartActView[] {
  const f = face(ctx);
  const research = ctx.research();
  if (f === "ads") return [{ act: "generate-scenarios", label: s.scenarios.length === 0 ? "generate scenarios" : "regenerate scenarios", needs: research.picked === null ? ["a picked idea"] : [] }];
  if (f === "trailer") return [{ act: "compose-candidates", label: s.cut === null ? "compose cut" : "recompose from spine", needs: research.spine === null ? ["a composed spine"] : [] }];
  return [
    { act: "compose-candidates", label: s.candidates.length === 0 ? "compose candidates" : "compose again", needs: research.confirmed === null ? ["a confirmed scope"] : [] },
    { act: "recalibrate", label: `recalibrate · ${s.notes.length} note${s.notes.length === 1 ? "" : "s"}`, needs: [...(s.notes.length === 0 ? ["a note"] : []), ...(s.staged === null ? [] : ["the staged version decided"])] },
  ];
}

function units(ctx: Ctx, s: ScriptRec, act: PartActKind): Result<number> {
  const a = acts(ctx, s).find((x) => x.act === act);
  if (a === undefined) return err("invalid", `${act} is not an act of this script part`);
  if (a.needs.length > 0) return err("invalid", `${a.label} needs ${a.needs.join(" · ")}`);
  return ok(1);
}

function land(ctx: Ctx, s: ScriptRec, act: PartActKind, at: number): Result<ScriptRec> {
  if (act === "generate-scenarios") {
    const r = ctx.research();
    const idea = r.ideas.find((i) => i.id === r.picked);
    if (idea === undefined) return err("invalid", "no picked idea");
    const out = scenariosStandIn(r.brief, template(ctx), idea);
    return out.ok ? ok({ ...s, scenarios: out.value, scenariosIdea: idea.id, picked: null, adsEngine: dryEngine(ctx, "script", 0) }) : out;
  }
  if (act === "compose-candidates") {
    if (face(ctx) === "trailer") {
      const next = spineCut(ctx);
      if (next === null) return err("invalid", "no composed spine");
      return ok({ ...s, cut: s.cut === null ? next.log : rebase(s.cut, derive(next.log).cut).log, spineKey: next.key, engine: dryEngine(ctx, "script", 0) });
    }
    const composed = COMPOSED[ctx.project.id] ?? [];
    return ok({ ...s, candidates: composed, adopted: composed.some((c) => c.id === s.adopted) ? s.adopted : null, engine: dryEngine(ctx, "script", 840) });
  }
  if (act !== "recalibrate") return err("invalid", `${act} is not a script act`);
  const dealt = cardsOf(ctx.research());
  if (dealt === null) return err("invalid", "no notebook");
  const n = s.accepted.length + 1;
  const v = recalibrate(baselineOf(s), [...s.notes], `v${n}`, at, { cards: dealt.cards, scope: ctx.research().scope, optIn: optInIds(dealt.source) });
  return ok({ ...s, staged: { ...v, label: `Version ${n}` } });
}

const no = (msg: string): Result<never> => err("invalid", msg);

function apply(ctx: Ctx, s: ScriptRec, op: ScriptOp, at: number): Result<ScriptRec> {
  switch (op.op) {
    case "adopt":
      if (op.candidateId !== null && !s.candidates.some((c) => c.id === op.candidateId)) return no(`no candidate ${op.candidateId}`);
      return op.candidateId === s.adopted ? no("already adopted") : ok({ ...s, adopted: op.candidateId });
    case "note-add": {
      const card = cardsOf(ctx.research())?.cards.find((c) => c.id === op.cardId);
      if (card === undefined) return no(`no card ${op.cardId}`);
      if (op.kind === "custom" && (op.text ?? "").trim() === "") return no("a custom note needs words");
      const note: Note = { id: `n-${at}-${s.notes.length + 1}`, cardId: op.cardId, kind: op.kind, ...(op.text === undefined ? {} : { text: op.text.trim() }), at };
      return ok({ ...s, notes: [...s.notes, note] });
    }
    case "note-remove":
      return s.notes.some((n) => n.id === op.noteId) ? ok({ ...s, notes: s.notes.filter((n) => n.id !== op.noteId) }) : no(`no note ${op.noteId}`);
    case "accept":
    case "accept-over-gate": {
      if (s.staged?.id !== op.versionId) return no(`${op.versionId} is not staged`);
      const gate = rollupOf(ctx, s, s.staged);
      if (op.op === "accept" && gate.blocked) return no(`the gate blocks on ${gate.blocking.join(", ")}`);
      if (op.op === "accept-over-gate" && !gate.blocked) return no("the gate is clean");
      const v: Version = op.op === "accept" ? s.staged : { ...s.staged, override: overrideFrom(gate, at) };
      return ok({ ...s, accepted: acceptInto(s.accepted, v), staged: null, notes: [] });
    }
    case "discard-staged":
      return s.staged?.id === op.versionId ? ok({ ...s, staged: null }) : no(`${op.versionId} is not staged`);
    case "restore-version": {
      if (s.staged !== null) return no(`${s.staged.label} is staged`);
      const v = s.accepted.find((x) => x.id === op.versionId);
      if (v === undefined) return no(`no version ${op.versionId}`);
      const r = restoreAs(v, baselineOf(s), `v${s.accepted.length + 1}`, at);
      return r === null ? no(`${op.versionId} is the baseline`) : ok({ ...s, staged: r });
    }
    case "patch-beat":
    case "set-connector":
    case "reset-beat": {
      if (s.cut === null) return no("no cut composed");
      if (!derive(s.cut).cut.beats.some((b) => b.id === op.beatId)) return no(`no beat ${op.beatId}`);
      const patch = op.op === "patch-beat" ? { ...(op.label === undefined ? {} : { label: op.label }), ...(op.text === undefined ? {} : { text: op.text }) } : op.op === "set-connector" ? { connector: op.connector } : null;
      const next = patch === null ? resetBeat(s.cut, op.beatId) : editBeat(s.cut, op.beatId, patch, op.op);
      return next === s.cut ? no(`${op.beatId} unchanged`) : ok({ ...s, cut: next });
    }
    case "pick-scenario":
      if (!s.scenarios.some((x) => x.id === op.scenarioId)) return no(`no scenario ${op.scenarioId}`);
      return op.scenarioId === s.picked ? no("already picked") : ok({ ...s, picked: op.scenarioId });
  }
}

export const SCRIPT = {
  seed,
  apply: (ctx: Ctx, s: ScriptRec, op: ScriptOp): Result<ScriptRec> => apply(ctx, s, op, ctx.now),
  verdict,
  acts,
  units,
  land,
  data: (ctx: Ctx, s: ScriptRec): ScriptData => scriptData(ctx, s, face(ctx)),
};
