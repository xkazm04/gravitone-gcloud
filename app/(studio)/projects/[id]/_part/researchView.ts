import "server-only";

import type { NotebookSource } from "@/lib/notebook/source";
import type { Card, scopeSummary } from "@/lib/research/scope";
import { optInIds, stateOf } from "@/lib/research/scope";
import type { Cue } from "@/lib/script/trailer/types";
import { reviseNotebook } from "@/lib/research/revisions";
import type { AdBriefField, Connector, FollowUpView, ResearchCard, ResearchData, ResearchFace } from "@gt/domain/partView";

import type { ResearchRec } from "./fixtureResearch.ts";

// The research record and the v1 arithmetic over it, drawn as the view (`ResearchData`). Pure
// projection: every count comes from `scopeSummary`, every wound from its `woundsOf`, every
// landing from `reviseNotebook`; nothing here decides.

type Summary = { readonly source: NotebookSource; readonly cards: Card[]; readonly s: ReturnType<typeof scopeSummary>; readonly moved: readonly string[] } | null;
type Extra = { readonly orphan?: { readonly decisions: number }; readonly missing: readonly AdBriefField[]; readonly briefChanged: boolean; readonly cue?: Cue };

const KINDS = new Set(["fact", "mechanism", "reversal", "steel-man", "counter", "conclusion"]);

function cardView(c: Card, x: NonNullable<Summary>, scope: ResearchRec["scope"]): ResearchCard {
  const optIn = optInIds(x.source);
  const st = stateOf(scope, c.id, optIn);
  const fact = x.source.byId.facts[c.id];
  const wound = x.s.wounds.find((w) => w.cardId === c.id);
  return {
    id: c.id,
    kind: KINDS.has(c.kind) ? c.kind : "fact",
    dimension: String(c.dimension),
    title: c.title,
    ...(c.detail === undefined ? {} : { detail: c.detail }),
    ...(c.confidence === undefined ? {} : { confidence: c.confidence }),
    loadBearing: c.loadBearing === true,
    required: c.required === true,
    ...(c.requiredWhy === undefined ? {} : { requiredWhy: c.requiredWhy }),
    ...(c.leap === undefined ? {} : { leap: `${c.leap} leap` }),
    hottest: c.hottest === true,
    ...(c.source === undefined ? {} : { source: c.source }),
    ...(c.asOf === undefined ? {} : { asOf: c.asOf }),
    ...(c.falsifiableBy === undefined ? {} : { falsifiableBy: c.falsifiableBy }),
    dependsOn: c.dependsOn,
    contests: fact?.contests ?? [],
    qualifies: fact?.qualifies ?? [],
    scope: !st.descoped ? "in" : c.optIn === true ? "not-taken" : "descoped",
    liked: st.liked,
    deepen: st.deepen,
    ...(wound === undefined ? {} : { wound: { severity: wound.severity, missing: wound.missing } }),
    moved: x.moved.includes(c.id),
  };
}

function followUps(r: ResearchRec): FollowUpView[] {
  const landings = r.base === null ? [] : reviseNotebook(r.base.notebook, r.revisions).landings;
  return r.followUps.map((q) => {
    const rev = r.revisions.find((x) => x.requestId === q.id);
    const result = q.result;
    return {
      id: q.id,
      kind: q.kind,
      ...(q.cardId === undefined ? {} : { cardId: q.cardId }),
      prompt: q.prompt,
      status: q.status,
      ...(result === undefined
        ? {}
        : {
            result: {
              verdict: result.verdict,
              summary: result.summary,
              sources: result.sources,
              effects: result.effects.map((e, index) => ({
                index,
                kind: e.kind,
                target: e.kind === "adds-fact" ? e.factId : e.targetId,
                note: e.kind === "adds-fact" ? e.claim : e.note,
                landing: landings.find((l) => l.revisionId === rev?.id && l.effectIndex === index)?.state ?? "pending",
              })),
            },
          }),
    };
  });
}

export function researchData(r: ResearchRec, face: ResearchFace, free: boolean, x: Summary, extra: Extra): ResearchData {
  const offers: ResearchData["offers"] = free ? ["notebook", "beats"] : face === "beats" ? ["beats"] : ["notebook"];
  if (face === "ads") {
    return {
      offers: [],
      face: "ads",
      brief: r.brief,
      missing: extra.missing,
      ideas: r.ideas.map((i) => ({
        id: i.id,
        angle: i.angle,
        title: i.title,
        hook: i.hook,
        twist: i.twist,
        whyItWorks: i.whyItWorks,
        risk: i.risk,
        ...(i.truth === undefined ? {} : { truth: i.truth }),
        gateNotes: i.gateNotes ?? [],
        ...(i.pictureClaim === undefined ? {} : { pictureClaim: i.pictureClaim }),
      })),
      picked: r.picked,
      briefChanged: extra.briefChanged,
      ...(r.adsEngine === undefined ? {} : { engine: r.adsEngine }),
    };
  }
  if (face === "beats") {
    const sections = new Map((extra.cue?.sections ?? []).map((s) => [s.id, s]));
    const slots = (r.slots ?? []).map((s) => {
      const cue = s.movement.cueSection === undefined ? undefined : sections.get(s.movement.cueSection);
      return {
        id: s.id,
        label: s.movement.label,
        role: s.movement.role,
        ...(cue === undefined ? {} : { cue: { label: cue.label, boundary: cue.isBoundary } }),
        pick: r.picks[s.id] ?? null,
        variants: s.variants.map((v) => ({
          id: v.id,
          kind: v.beat.kind,
          connector: v.beat.connector as Connector,
          at: v.beat.at,
          label: v.beat.label,
          text: v.beat.text,
          rationale: v.rationale,
          ...(v.risk === undefined ? {} : { risk: v.risk }),
          raises: v.beat.raises ?? [],
          spends: v.beat.spends?.length ?? 0,
        })),
      };
    });
    const moved = r.spine !== null && slots.some((s) => s.pick !== (r.spine?.[s.id] ?? null));
    return { offers, face: "beats", slots, picked: slots.filter((s) => s.pick !== null).length, spine: { composed: r.spine !== null, moved }, origin: "fixture" };
  }
  const t = x?.s;
  return {
    offers,
    face: "notebook",
    topic: r.topic,
    source: x === null ? null : { kind: x.source.kind, digest: x.source.digest, claims: x.source.notebook.facts.length },
    dimensions: (t?.byDim ?? []).map((d) => ({ id: String(d.id), label: d.label, kept: d.kept, total: d.total })).filter((d) => d.total > 0),
    cards: x === null ? [] : x.cards.map((c) => cardView(c, x, r.scope)),
    tally: {
      kept: t?.kept ?? 0,
      total: t?.total ?? 0,
      descoped: t?.descoped ?? 0,
      notTaken: t?.notTaken ?? 0,
      liked: t?.liked ?? 0,
      deepen: t?.deepen ?? 0,
      wounded: t?.wounds.length ?? 0,
      broken: t?.broken ?? 0,
      requiredGone: (t?.requiredGone ?? []).map((c) => c.id),
    },
    scope: { confirmed: r.confirmed !== null, moved: x?.moved.length ?? 0, ...(extra.orphan === undefined ? {} : { orphan: extra.orphan }) },
    followUps: followUps(r),
    ...(r.engine === undefined ? {} : { engine: r.engine }),
  };
}
