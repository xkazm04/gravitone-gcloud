"use client";

// LOCAL BAND · 4-STEM STUDIO (D6 + A2 + C6) — non-musician steering controls, style templates,
// 4-stem mixer with solo/mute/per-stem FxChain presets, 1-second bit-identical single-stem swapper,
// instrument audition preview, $0 receipt door, arrangement breakdown, and A0 catalog gate.

import { useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Field, Select } from "../field/Field.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Toggle } from "../toggle/Toggle.tsx";
import { AudioPreview } from "./AudioPreview.tsx";
import {
  LOCAL_FX_PRESETS,
  LOCAL_KEYS,
  LOCAL_ROLES,
  LOCAL_TASTE_STEERS,
  applySeedToDraft,
  applyTasteSteer,
  describeStemChoice,
  explainScoreChoices,
  fxChainForPreset,
  fxPresetOf,
  type LocalAuditionState,
  type LocalControls,
  type LocalFxChain,
  type LocalFxPresetId,
  type LocalInstrumentView,
  type LocalRole,
  type LocalScoreDraft,
  type LocalTakeView,
  type LocalTasteSteerId,
  type LocalTemplateView,
} from "./localBand.ts";
import s from "./LocalBand.module.css";
import type { Seed } from "./recipe.ts";

export type LocalBandStudioProps = {
  readonly templates: readonly LocalTemplateView[];
  readonly catalog: readonly LocalInstrumentView[];
  readonly takes: readonly LocalTakeView[];
  readonly seed?: Seed;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly audition?: LocalAuditionState | null;
  readonly onRender: (spec: LocalScoreDraft) => void;
  readonly onReceipt?: (spec: LocalScoreDraft) => void;
  readonly onSwapStem: (
    takeId: string,
    role: LocalRole,
    instrumentId: string,
    opts?: { readonly muted?: boolean; readonly solo?: boolean; readonly fx?: LocalFxChain },
  ) => void;
  readonly onAudition: (instrumentId: string) => void;
  readonly onPromote: (takeId: string) => void;
};

const SLIDERS: readonly { readonly key: keyof LocalControls; readonly label: string; readonly max: number }[] = [
  { key: "density", label: "density", max: 1 },
  { key: "brightness", label: "brightness", max: 1 },
  { key: "lift", label: "middle lift", max: 1 },
  { key: "swing", label: "swing", max: 0.5 },
  { key: "humanise", label: "humanise", max: 1 },
];

const KEY_OPTIONS = LOCAL_KEYS.map((k) => ({ value: k, label: k }));
const FX_OPTIONS = LOCAL_FX_PRESETS.map((p) => ({ value: p.id, label: p.label }));

export function LocalBandStudio({
  templates,
  catalog,
  takes,
  seed,
  busy = false,
  error = null,
  audition = null,
  onRender,
  onReceipt,
  onSwapStem,
  onAudition,
  onPromote,
}: LocalBandStudioProps) {
  const defaultSpec = takes[0]?.spec ?? templates[0]?.spec;
  const [draft, setDraft] = useState<LocalScoreDraft>(() => defaultSpec!);
  const [selectedTakeId, setSelectedTakeId] = useState<string>(() => takes[0]?.id ?? "");
  const [steerNote, setSteerNote] = useState<string | null>(null);
  const [swapChoice, setSwapChoice] = useState<Readonly<Record<LocalRole, string>>>(() => ({
    drums: defaultSpec?.tracks.find((t) => t.role === "drums")?.instrument ?? "kit-808-warm",
    bass: defaultSpec?.tracks.find((t) => t.role === "bass")?.instrument ?? "vital-sub-bass",
    chords: defaultSpec?.tracks.find((t) => t.role === "chords")?.instrument ?? "sample-lofi-keys",
    lead: defaultSpec?.tracks.find((t) => t.role === "lead")?.instrument ?? "sample-ikembe-bell",
  }));

  const activeTake = takes.find((t) => t.id === selectedTakeId) ?? takes[0] ?? null;

  const pickTemplate = (tpl: LocalTemplateView): void => {
    setDraft(tpl.spec);
    setSteerNote(null);
    const nextSwap: Record<LocalRole, string> = { ...swapChoice };
    for (const tr of tpl.spec.tracks) nextSwap[tr.role] = tr.instrument;
    setSwapChoice(nextSwap);
  };

  const pickTasteSteer = (steerId: LocalTasteSteerId): void => {
    const applied = applyTasteSteer(draft, swapChoice, steerId);
    setDraft(applied.draft);
    setSwapChoice(applied.swapChoice);
    setSteerNote(applied.summary);
  };

  const setControl = (k: keyof LocalControls, v: number): void => {
    setDraft((cur) => ({ ...cur, controls: { ...cur.controls, [k]: v } }));
  };

  const setRoleInstrument = (role: LocalRole, instId: string): void => {
    setSwapChoice((cur) => ({ ...cur, [role]: instId }));
    setDraft((cur) => ({ ...cur, tracks: cur.tracks.map((t) => (t.role === role ? { ...t, instrument: instId } : t)) }));
  };

  const patchDraftTrack = (role: LocalRole, patch: { readonly muted?: boolean; readonly solo?: boolean; readonly fx?: LocalFxChain }): void => {
    setDraft((cur) => ({
      ...cur,
      tracks: cur.tracks.map((t) => {
        if (t.role !== role) return t;
        const { fx: _prevFx, ...rest } = t;
        const nextFx = "fx" in patch ? patch.fx : t.fx;
        return {
          ...rest,
          ...(patch.muted !== undefined ? { muted: patch.muted } : {}),
          ...(patch.solo !== undefined ? { solo: patch.solo } : {}),
          ...(nextFx !== undefined ? { fx: nextFx } : {}),
        };
      }),
    }));
  };

  const readyCount = catalog.filter((c) => c.status === "ready").length;
  const refusedCount = catalog.filter((c) => c.status === "refused").length;
  const reasons = explainScoreChoices(activeTake?.spec ?? draft, catalog, activeTake);

  return (
    <section className={s.studio} aria-label="local band 4-stem studio" data-testid="local-band-studio">
      <div className={s.head}>
        <CapsHeading text="local band · 4-stem studio" variant="section" />
        <Chip label="engine" value="vital vst3 + local packs" tone="emerald" casing="lower" dot />
        <Chip label="cost" value="$0 local" tone="cyan" casing="lower" />
        <span className={s.grow} />
        {seed !== undefined && (
          <Button label="Load from seed" size="sm" disabled={busy} onPress={() => setDraft((cur) => applySeedToDraft(seed, templates, catalog, cur))} />
        )}
        {onReceipt !== undefined && <Button label="Receipt ($0)" size="sm" disabled={busy} onPress={() => onReceipt(draft)} />}
        <Button label={busy ? "Rendering…" : "Render 4-stem take ($0)"} tone="cyan" disabled={busy} onPress={() => onRender(draft)} />
      </div>

      {error !== null && error !== "" && <ErrorLine message={error} />}

      <div className={s.templates} role="group" aria-label="style templates">
        {templates.map((tpl) => (
          <button key={tpl.id} type="button" className={s.tplBtn} aria-pressed={draft.style === tpl.id} onClick={() => pickTemplate(tpl)}>
            <span className={s.tplTitle}>{tpl.label}</span>
            <span className={s.tplMeta}>{tpl.spec.tempoBpm} bpm · {tpl.spec.key}</span>
            <span className={s.tplSub}>{tpl.plainIntent}</span>
          </button>
        ))}
      </div>

      <div className={s.controlsBar} role="group" aria-label="plain-language taste steering">
        <CapsHeading text="taste steer" variant="section" level={4} />
        {LOCAL_TASTE_STEERS.map((st) => (
          <Button key={st.id} label={st.label} size="sm" disabled={busy} onPress={() => pickTasteSteer(st.id)} />
        ))}
        {steerNote !== null && <Chip label="why" value={steerNote} tone="cyan" casing="lower" />}
      </div>

      <div className={s.controlsBar}>
        <Field label="cue title" value={draft.title} disabled={busy} onChange={(title) => setDraft({ ...draft, title })} />
        <Field
          label="score tempo bpm"
          value={String(draft.tempoBpm)}
          disabled={busy}
          onChange={(raw) => {
            const n = Number(raw);
            if (Number.isFinite(n)) setDraft({ ...draft, tempoBpm: n });
          }}
        />
        <Select label="score key" options={KEY_OPTIONS} value={draft.key} onChange={(key) => setDraft({ ...draft, key })} />
        <Toggle label="loop seam" name="bar-aligned loop seam" on={draft.loop ?? false} onToggle={(loop) => setDraft({ ...draft, loop })} />
        <span className={s.grow} />
        {draft.sections.map((sec, idx) => (
          <Chip key={`${sec.name}-${idx}`} label={sec.name} value={`${sec.bars}b · ${Math.round(sec.energy * 100)}%`} casing="lower" />
        ))}
      </div>

      <div className={s.sliders} aria-label="non-musician steering controls">
        {SLIDERS.map(({ key, label, max }) => {
          const val = draft.controls[key];
          return (
            <label key={key} className={s.sliderCell}>
              <span className={s.sliderTop}>
                <span>{label}</span>
                <span className={s.sliderVal}>{Math.round((val / max) * 100)}%</span>
              </span>
              <input className={s.range} type="range" min={0} max={max} step={0.01} value={val} aria-label={label} onChange={(e) => setControl(key, Number(e.currentTarget.value))} />
            </label>
          );
        })}
      </div>

      {audition !== null && (
        <div className={s.auditionBar} aria-label="instrument audition preview">
          <Chip label="audition" value={audition.name} tone="cyan" casing="lower" dot />
          {audition.lufs !== null && <Chip label="lufs" value={audition.lufs.toFixed(1)} casing="lower" />}
          {audition.truePeakDb !== null && <Chip label="peak" value={`${audition.truePeakDb.toFixed(1)} dBTP`} casing="lower" />}
          <Chip label="render" value={`${audition.renderMs} ms`} casing="lower" />
          <audio className={s.audioPlayer} controls src={audition.audioUrl} preload="metadata" />
        </div>
      )}

      {activeTake !== null && (
        <div className={s.mixBox} aria-label="mastered local take">
          <div className={s.head}>
            <CapsHeading text={`mastered mix · ${activeTake.title}`} variant="section" level={4} />
            {takes.length > 1 && (
              <Select label="rendered local takes" options={takes.map((t) => ({ value: t.id, label: `${t.title} (${t.id})` }))} value={activeTake.id} onChange={setSelectedTakeId} />
            )}
            <span className={s.grow} />
            <a className={s.linkBtn} href={activeTake.rppUrl} download={`${activeTake.id}.rpp`}>REAPER .rpp</a>
            <Button label={activeTake.stage === "finalized" ? "In Arrange (finalized)" : "Send to Arrange"} size="sm" tone="emerald" disabled={busy || activeTake.stage === "finalized"} onPress={() => onPromote(activeTake.id)} />
          </div>

          <AudioPreview src={activeTake.mixUrl} peaks={activeTake.peaks} title={activeTake.title} durationS={activeTake.durationS} />

          <div className={s.chips}>
            <Chip label="mastered" value={activeTake.lufs !== null ? `${activeTake.lufs.toFixed(1)} LUFS` : "n/a"} tone="emerald" casing="lower" />
            <Chip label="true peak" value={activeTake.truePeakDb !== null ? `${activeTake.truePeakDb.toFixed(2)} dBTP` : "n/a"} tone="emerald" casing="lower" />
            {activeTake.bitIdentical !== null && (
              <Chip label="determinism" value={activeTake.bitIdentical ? `bit-identical · diff ${(activeTake.maxAbsDiff ?? 0).toFixed(6)}` : "drift"} tone={activeTake.bitIdentical ? "emerald" : "rose"} casing="lower" dot />
            )}
            <Chip label="triage" value={`${activeTake.triageFlagged} flagged / ${activeTake.triageFindings.filter((f) => f.verdict !== "skip").length} checks`} tone={activeTake.triageFlagged === 0 ? "emerald" : "rose"} casing="lower" dot />
            <Chip label="mix sha256" value={activeTake.mixSha256.slice(0, 10)} casing="lower" />
            <Chip label="render time" value={`${activeTake.totalRenderMs} ms`} casing="lower" />
          </div>

          <ul className={s.triageList} aria-label="triage findings">
            {activeTake.triageFindings.filter((f) => f.verdict !== "skip").map((f) => (
              <li key={f.check} className={s.triageItem} data-verdict={f.verdict}>
                <span>{f.check}</span>
                <span>{f.value !== null ? `${f.value} ${f.unit}` : f.verdict}</span>
              </li>
            ))}
          </ul>

          <ul className={s.catalogList} aria-label="arrangement and mix breakdown">
            {reasons.map((r) => (
              <li key={r.axis} className={s.catalogRow}>
                <Chip label={r.axis} tone="cyan" casing="lower" />
                <span>{r.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.stemsGrid} aria-label="4-stem mixer and instrument swapper">
        {LOCAL_ROLES.map((role) => {
          const stem = activeTake?.stems.find((st) => st.role === role) ?? null;
          const draftTrack = draft.tracks.find((t) => t.role === role);
          const currentInstId = swapChoice[role] ?? draftTrack?.instrument ?? "";
          const currentMeta = catalog.find((c) => c.id === (stem?.instrument ?? currentInstId));
          const roleInstruments = catalog.filter((c) => c.role === role);
          const isMuted = draftTrack?.muted ?? stem?.muted ?? false;
          const isSolo = draftTrack?.solo ?? stem?.solo ?? false;
          const fxPreset = fxPresetOf(draftTrack?.fx);
          const guidance = describeStemChoice(currentInstId, stem, catalog);
          const stemDirty =
            stem !== null &&
            (stem.instrument !== currentInstId || guidance.tone === "rose" || stem.muted !== isMuted || stem.solo !== isSolo || fxPreset !== fxPresetOf(activeTake?.spec.tracks.find((t) => t.role === role)?.fx));

          return (
            <div key={role} className={s.stemCard} data-reused={stem?.reused === true ? "true" : "false"}>
              <div className={s.stemHead}>
                <span className={s.roleTag}>{role}</span>
                <span className={s.instName}>{stem?.instrumentName ?? currentMeta?.name ?? currentInstId}</span>
                <span className={s.grow} />
                <Toggle
                  label="mute"
                  name={`mute ${role} stem`}
                  on={isMuted}
                  onToggle={(muted) => {
                    patchDraftTrack(role, { muted });
                    if (activeTake !== null) onSwapStem(activeTake.id, role, currentInstId, { muted, solo: isSolo, ...(draftTrack?.fx === undefined ? {} : { fx: draftTrack.fx }) });
                  }}
                />
                <Toggle
                  label="solo"
                  name={`solo ${role} stem`}
                  on={isSolo}
                  onToggle={(solo) => {
                    patchDraftTrack(role, { solo });
                    if (activeTake !== null) onSwapStem(activeTake.id, role, currentInstId, { muted: isMuted, solo, ...(draftTrack?.fx === undefined ? {} : { fx: draftTrack.fx }) });
                  }}
                />
                {stem !== null && (
                  <Chip label={stem.reused ? "reused bit-exact" : "rendered"} value={stem.reused ? stem.sha256.slice(0, 8) : `${stem.renderMs}ms · ${stem.sha256.slice(0, 8)}`} tone={stem.reused ? "cyan" : "emerald"} casing="lower" />
                )}
              </div>
              <p className={guidance.tone === "rose" ? s.refusalText : s.plainDesc}>{guidance.text}</p>
              {stem !== null && (
                <>
                  <span className={s.stemMeta}>
                    {stem.source} · {stem.noteCount} notes · {stem.integratedLufs !== null ? `${stem.integratedLufs.toFixed(1)} LUFS` : "silent"}
                  </span>
                  <audio className={s.audioPlayer} controls src={stem.audioUrl} preload="none" />
                </>
              )}
              <div className={s.swapRow}>
                <Select
                  label={`${role} instrument`}
                  options={roleInstruments.map((inst) => ({ value: inst.id, label: `${inst.name} ${inst.status === "refused" ? "[refused]" : `(${inst.engine})`}` }))}
                  value={currentInstId}
                  onChange={(instId) => setRoleInstrument(role, instId)}
                />
                <Select
                  label={`${role} fx chain`}
                  options={FX_OPTIONS}
                  value={fxPreset}
                  onChange={(preset: LocalFxPresetId) => {
                    const nextFx = fxChainForPreset(preset);
                    patchDraftTrack(role, nextFx === undefined ? {} : { fx: nextFx });
                  }}
                />
                <Button label="Hear option" size="sm" disabled={busy} onPress={() => onAudition(currentInstId)} />
                {activeTake !== null && (
                  <Button
                    label="Swap stem ($0)"
                    size="sm"
                    tone="cyan"
                    disabled={busy || !stemDirty}
                    onPress={() => onSwapStem(activeTake.id, role, currentInstId, { muted: isMuted, solo: isSolo, ...(draftTrack?.fx === undefined ? {} : { fx: draftTrack.fx }) })}
                  />
                )}
                {stem !== null && <a className={s.linkBtn} href={stem.midiUrl} download={`${activeTake?.id ?? "stem"}-${role}.mid`}>.mid</a>}
              </div>
            </div>
          );
        })}
      </div>

      <details className={s.catalogDetails}>
        <summary className={s.catalogSummary}>
          measured instrument catalog ({readyCount} ready · {refusedCount} refused by A0 gate)
        </summary>
        <ul className={s.catalogList}>
          {catalog.map((inst) => (
            <li key={inst.id} className={s.catalogRow} data-status={inst.status}>
              <Chip label={inst.status} tone={inst.status === "ready" ? "emerald" : "rose"} casing="lower" dot />
              <strong>{inst.name}</strong>
              <span>({inst.role} · {inst.engine})</span>
              <span>— {inst.plainLabel}</span>
              {inst.status === "ready" ? (
                <span>[{inst.lufsAtVel100} LUFS · load {inst.loadMs}ms · render {inst.renderMs}ms · bit-exact]</span>
              ) : (
                <span className={s.refusalText}>refused: {inst.refusalReason}</span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
