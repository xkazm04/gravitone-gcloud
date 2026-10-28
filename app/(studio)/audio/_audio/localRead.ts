import "server-only";

import { INSTRUMENT_CATALOG } from "@gt/domain/audio.score";
import { WORKED_SCORE_TEMPLATES } from "@gt/domain/audio.score.templates";
import type {
  LocalInstrumentView,
  LocalScoreDraft,
  LocalTakeView,
  LocalTemplateView,
} from "@gt/ui/components/audio/localBand.ts";

import { listLocalScoreTakes, type LocalScorePlan } from "../../../../lib/sound/localScore.ts";
import { takeFileHref } from "../../../../lib/sound/takeHref.ts";
import type { SoundTake } from "../../../../lib/sound/types.ts";

export type LocalBandView = {
  readonly templates: readonly LocalTemplateView[];
  readonly catalog: readonly LocalInstrumentView[];
  readonly takes: readonly LocalTakeView[];
};

export function toLocalTakeView(take: SoundTake, plan: LocalScorePlan): LocalTakeView {
  return {
    id: take.id,
    title: take.title,
    tempoBpm: take.tempoBpm ?? plan.spec.tempoBpm,
    key: take.key ?? plan.spec.key,
    durationS: take.measured?.durationS ?? take.durationS ?? 0,
    loop: take.loop ?? false,
    lufs: take.measured?.lufs ?? null,
    truePeakDb: take.measured?.truePeakDb ?? null,
    mixUrl: takeFileHref(take.id),
    rppUrl: plan.rppUrl,
    peaks: take.peaks ?? [],
    reusedRoles: plan.reusedRoles,
    renderedRoles: plan.renderedRoles,
    totalRenderMs: plan.totalRenderMs,
    bitIdentical: plan.determinism?.bitIdentical ?? null,
    maxAbsDiff: plan.determinism?.maxAbsDiff ?? null,
    mixSha256: plan.mixSha256,
    triageFlagged: plan.triage.flagged,
    triageFindings: plan.triage.findings.map((f) => ({
      check: f.check,
      verdict: f.verdict,
      value: f.value,
      unit: f.unit,
    })),
    stems: plan.stems.map((st) => ({
      role: st.role,
      instrument: st.instrument,
      instrumentName: st.instrumentName,
      source: st.source,
      sha256: st.sha256,
      reused: st.reused,
      noteCount: st.noteCount,
      renderMs: st.renderMs,
      integratedLufs: st.integratedLufs,
      truePeakDb: st.truePeakDb,
      gainDb: st.gainDb,
      pan: st.pan,
      muted: st.muted,
      solo: st.solo,
      audioUrl: st.audioUrl,
      midiUrl: st.midiUrl,
    })),
    spec: plan.spec as LocalScoreDraft,
    stage: take.stage,
    verdict: take.verdict,
  };
}

export async function readLocalBand(): Promise<LocalBandView> {
  const templates: LocalTemplateView[] = WORKED_SCORE_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    plainIntent: t.plainIntent,
    spec: t.spec as LocalScoreDraft,
  }));
  const catalog: LocalInstrumentView[] = INSTRUMENT_CATALOG.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    engine: c.engine,
    plainLabel: c.plainLabel,
    character: c.character,
    licence: c.licence,
    status: c.audition.status,
    lufsAtVel100: c.audition.lufsAtVel100,
    loadMs: c.audition.loadMs,
    renderMs: c.audition.renderMs,
    deterministic: c.audition.deterministic,
    refusalReason: c.audition.refusalReason,
  }));
  let rows: readonly { readonly take: SoundTake; readonly plan: LocalScorePlan }[] = [];
  try {
    rows = await listLocalScoreTakes(12);
  } catch {
    rows = [];
  }
  return {
    templates,
    catalog,
    takes: rows.map(({ take, plan }) => toLocalTakeView(take, plan)),
  };
}
