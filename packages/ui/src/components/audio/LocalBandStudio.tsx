"use client";

// LOCAL BAND · 4-STEM STUDIO (D6 + A2 + C6) — non-musician steering controls, style templates,
// 4-stem mixer, 1-second bit-identical single-stem swapper, instrument audition preview,
// 10-detector triage & determinism scorecard, REAPER .rpp export, and A0 catalog gate.

import { useState } from "react";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { AudioPreview } from "./AudioPreview.tsx";
import {
  LOCAL_KEYS,
  LOCAL_ROLES,
  applySeedToDraft,
  type LocalAuditionState,
  type LocalControls,
  type LocalInstrumentView,
  type LocalRole,
  type LocalScoreDraft,
  type LocalTakeView,
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
  readonly onSwapStem: (takeId: string, role: LocalRole, instrumentId: string) => void;
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

export function LocalBandStudio({
  templates,
  catalog,
  takes,
  seed,
  busy = false,
  error = null,
  audition = null,
  onRender,
  onSwapStem,
  onAudition,
  onPromote,
}: LocalBandStudioProps) {
  const defaultSpec = takes[0]?.spec ?? templates[0]?.spec;
  const [draft, setDraft] = useState<LocalScoreDraft>(() => defaultSpec!);
  const [selectedTakeId, setSelectedTakeId] = useState<string>(() => takes[0]?.id ?? "");
  const [swapChoice, setSwapChoice] = useState<Readonly<Record<LocalRole, string>>>(() => ({
    drums: defaultSpec?.tracks.find((t) => t.role === "drums")?.instrument ?? "kit-808-warm",
    bass: defaultSpec?.tracks.find((t) => t.role === "bass")?.instrument ?? "vital-sub-bass",
    chords: defaultSpec?.tracks.find((t) => t.role === "chords")?.instrument ?? "sample-lofi-keys",
    lead: defaultSpec?.tracks.find((t) => t.role === "lead")?.instrument ?? "sample-ikembe-bell",
  }));

  const activeTake = takes.find((t) => t.id === selectedTakeId) ?? takes[0] ?? null;

  const pickTemplate = (tpl: LocalTemplateView): void => {
    setDraft(tpl.spec);
    const nextSwap: Record<LocalRole, string> = { ...swapChoice };
    for (const tr of tpl.spec.tracks) nextSwap[tr.role] = tr.instrument;
    setSwapChoice(nextSwap);
  };

  const setControl = (k: keyof LocalControls, v: number): void => {
    setDraft((cur) => ({ ...cur, controls: { ...cur.controls, [k]: v } }));
  };

  const setRoleInstrument = (role: LocalRole, instId: string): void => {
    setSwapChoice((cur) => ({ ...cur, [role]: instId }));
    setDraft((cur) => ({
      ...cur,
      tracks: cur.tracks.map((t) => (t.role === role ? { ...t, instrument: instId } : t)),
    }));
  };

  const readyCount = catalog.filter((c) => c.status === "ready").length;
  const refusedCount = catalog.filter((c) => c.status === "refused").length;

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

      <div className={s.controlsBar}>
        <label className={s.fieldLabel}>
          title
          <input className={s.input} value={draft.title} aria-label="cue title" onChange={(e) => setDraft({ ...draft, title: e.currentTarget.value })} />
        </label>
        <label className={s.fieldLabel}>
          bpm
          <input
            className={s.numInput}
            type="number"
            min={40}
            max={220}
            value={draft.tempoBpm}
            aria-label="score tempo bpm"
            onChange={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n)) setDraft({ ...draft, tempoBpm: n });
            }}
          />
        </label>
        <label className={s.fieldLabel}>
          key
          <select className={s.select} value={draft.key} aria-label="score key" onChange={(e) => setDraft({ ...draft, key: e.currentTarget.value })}>
            {LOCAL_KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className={s.fieldLabel}>
          <input type="checkbox" checked={draft.loop ?? false} onChange={(e) => setDraft({ ...draft, loop: e.currentTarget.checked })} />
          loop seam
        </label>
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
              <select className={s.select} aria-label="rendered local takes" value={activeTake.id} onChange={(e) => setSelectedTakeId(e.currentTarget.value)}>
                {takes.map((t) => (
                  <option key={t.id} value={t.id}>{t.title} ({t.id})</option>
                ))}
              </select>
            )}
            <span className={s.grow} />
            <a className={s.linkBtn} href={activeTake.rppUrl} download={`${activeTake.id}.rpp`}>REAPER .rpp</a>
            <Button
              label={activeTake.stage === "finalized" ? "In Arrange (finalized)" : "Send to Arrange"}
              size="sm"
              tone="emerald"
              disabled={busy || activeTake.stage === "finalized"}
              onPress={() => onPromote(activeTake.id)}
            />
          </div>

          <AudioPreview src={activeTake.mixUrl} peaks={activeTake.peaks} title={activeTake.title} durationS={activeTake.durationS} />

          <div className={s.chips}>
            <Chip label="mastered" value={activeTake.lufs !== null ? `${activeTake.lufs.toFixed(1)} LUFS` : "n/a"} tone="emerald" casing="lower" />
            <Chip label="true peak" value={activeTake.truePeakDb !== null ? `${activeTake.truePeakDb.toFixed(2)} dBTP` : "n/a"} tone="emerald" casing="lower" />
            {activeTake.bitIdentical !== null && (
              <Chip
                label="determinism"
                value={activeTake.bitIdentical ? `bit-identical · diff ${(activeTake.maxAbsDiff ?? 0).toFixed(6)}` : "drift"}
                tone={activeTake.bitIdentical ? "emerald" : "rose"}
                casing="lower"
                dot
              />
            )}
            <Chip
              label="triage"
              value={`${activeTake.triageFlagged} flagged / ${activeTake.triageFindings.filter((f) => f.verdict !== "skip").length} checks`}
              tone={activeTake.triageFlagged === 0 ? "emerald" : "rose"}
              casing="lower"
              dot
            />
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
        </div>
      )}

      <div className={s.stemsGrid} aria-label="4-stem mixer and instrument swapper">
        {LOCAL_ROLES.map((role) => {
          const stem = activeTake?.stems.find((st) => st.role === role) ?? null;
          const currentInstId = swapChoice[role] ?? draft.tracks.find((t) => t.role === role)?.instrument ?? "";
          const currentMeta = catalog.find((c) => c.id === (stem?.instrument ?? currentInstId));
          const roleInstruments = catalog.filter((c) => c.role === role);

          return (
            <div key={role} className={s.stemCard} data-reused={stem?.reused === true ? "true" : "false"}>
              <div className={s.stemHead}>
                <span className={s.roleTag}>{role}</span>
                <span className={s.instName}>{stem?.instrumentName ?? currentMeta?.name ?? currentInstId}</span>
                <span className={s.grow} />
                {stem !== null && (
                  <Chip
                    label={stem.reused ? "reused bit-exact" : "rendered"}
                    value={stem.reused ? stem.sha256.slice(0, 8) : `${stem.renderMs}ms · ${stem.sha256.slice(0, 8)}`}
                    tone={stem.reused ? "cyan" : "emerald"}
                    casing="lower"
                  />
                )}
              </div>
              {currentMeta !== undefined && <p className={s.plainDesc}>{currentMeta.plainLabel}</p>}
              {stem !== null && (
                <>
                  <span className={s.stemMeta}>
                    {stem.source} · {stem.noteCount} notes · {stem.integratedLufs !== null ? `${stem.integratedLufs.toFixed(1)} LUFS` : "silent"}
                  </span>
                  <audio className={s.audioPlayer} controls src={stem.audioUrl} preload="none" />
                </>
              )}
              <div className={s.swapRow}>
                <select className={s.select} aria-label={`${role} instrument`} value={currentInstId} onChange={(e) => setRoleInstrument(role, e.currentTarget.value)}>
                  {roleInstruments.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} {inst.status === "refused" ? "[refused]" : `(${inst.engine})`}
                    </option>
                  ))}
                </select>
                <Button label="Hear option" size="sm" disabled={busy} onPress={() => onAudition(currentInstId)} />
                {activeTake !== null && (
                  <Button
                    label="Swap stem ($0)"
                    size="sm"
                    tone="cyan"
                    disabled={busy || stem?.instrument === currentInstId}
                    onPress={() => onSwapStem(activeTake.id, role, currentInstId)}
                  />
                )}
                {stem !== null && (
                  <a className={s.linkBtn} href={stem.midiUrl} download={`${activeTake?.id ?? "stem"}-${role}.mid`}>.mid</a>
                )}
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
