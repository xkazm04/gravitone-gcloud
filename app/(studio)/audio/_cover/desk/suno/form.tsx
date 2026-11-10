"use client";

// THE SEND FORM'S PIECES (spark suno-covers): one per field, so a composition (./SunoA.tsx, ./SunoB.tsx, ./SunoC.tsx)
// decides where each sits. Every control is @gt/ui's. A slider or the variety left alone is not sent: it reads
// `default`, and a touched one is a chip that puts it back.
import { SUNO_COVER_DURATION_MAX_S, SUNO_COVER_DURATION_MIN_S, SUNO_COVER_LYRICS_MAX, SUNO_COVER_MODELS, SUNO_COVER_NEGATIVE_MAX, SUNO_COVER_STYLE_MAX, SUNO_COVER_TAKES, type SunoCoverModel, type SunoCoverVariety } from "@gt/domain/cover.suno";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Fader } from "@gt/ui/components/fader/Fader.tsx";
import { Field, Select, TextArea } from "@gt/ui/components/field/Field.tsx";
import { Seg, type SegOption } from "@gt/ui/components/seg/Seg.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import { durationBad, VARIETY_LABEL } from "./suno.ts";
import type { SunoFlow } from "./useSunoSend.ts";
import s from "./suno.module.css";

export function StyleField({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.field}>
      <span className={s.head}>
        <span className={s.label}>style</span>
        <Tally value={flow.form.style.length} of={SUNO_COVER_STYLE_MAX} />
      </span>
      <TextArea label="style" value={flow.form.style} onChange={(style) => flow.set({ style })} maxLength={SUNO_COVER_STYLE_MAX} rows={3} disabled={flow.sending} />
    </div>
  );
}

export function LyricsField({ flow, rows = 6 }: { readonly flow: SunoFlow; readonly rows?: number }) {
  const empty = flow.form.lyrics.trim() === "";
  return (
    <div className={s.field}>
      <span className={s.head}>
        <span className={s.label}>lyrics</span>
        {empty && <Chip label="instrumental" tone="cyan" casing="lower" />}
        <Tally value={flow.form.lyrics.length} of={SUNO_COVER_LYRICS_MAX} />
      </span>
      <TextArea label="lyrics" value={flow.form.lyrics} onChange={(lyrics) => flow.set({ lyrics })} maxLength={SUNO_COVER_LYRICS_MAX} rows={rows} disabled={flow.sending} />
    </div>
  );
}

const MODELS: readonly { readonly value: SunoCoverModel; readonly label: string }[] = SUNO_COVER_MODELS.map((m) => ({ value: m, label: m }));

export function ModelField({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.field}>
      <span className={s.head}>
        <span className={s.label}>model</span>
      </span>
      <Select label="model" options={MODELS} value={flow.form.model} onChange={(model) => flow.set({ model })} />
    </div>
  );
}

export function DurationField({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.field}>
      <span className={s.head}>
        <span className={s.label}>target</span>
        <Chip label={`${SUNO_COVER_DURATION_MIN_S}–${SUNO_COVER_DURATION_MAX_S} s`} ghost casing="lower" tone={durationBad(flow.form) ? "rose" : "neutral"} />
      </span>
      <Field label="target duration, seconds" value={flow.form.duration} onChange={(duration) => flow.set({ duration })} disabled={flow.sending} placeholder="seconds" />
    </div>
  );
}

export function NegativeField({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.field}>
      <span className={s.head}>
        <span className={s.label}>negative style</span>
      </span>
      <Field label="negative style" value={flow.form.negativeStyle} onChange={(negativeStyle) => flow.set({ negativeStyle })} maxLength={SUNO_COVER_NEGATIVE_MAX} disabled={flow.sending} />
    </div>
  );
}

type Slider = "audioInfluence" | "styleInfluence" | "weirdness";
const SLIDERS: readonly { readonly key: Slider; readonly label: string }[] = [
  { key: "audioInfluence", label: "audio influence" },
  { key: "styleInfluence", label: "style influence" },
  { key: "weirdness", label: "weirdness" },
];

function Control({ flow, k, label }: { readonly flow: SunoFlow; readonly k: Slider; readonly label: string }) {
  const v = flow.form[k];
  return (
    <div className={s.control}>
      <span className={s.head}>
        <span className={s.label}>{label}</span>
        {v === undefined ? <Chip label="default" ghost casing="lower" /> : <Chip label={`${v} %`} tone="cyan" casing="lower" name={`reset ${label}`} onPress={() => flow.untouch(k)} />}
      </span>
      <Fader label={label} value={v ?? 0} min={0} max={100} step={5} valueText={v === undefined ? "default" : `${v} %`} onChange={(n) => flow.set({ [k]: n })} disabled={flow.sending} />
    </div>
  );
}

/** The three 0-100 % controls, each a row of its own. */
export function SliderControls({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.controls}>
      {SLIDERS.map((c) => (
        <Control key={c.key} flow={flow} k={c.key} label={c.label} />
      ))}
    </div>
  );
}

/** One slider, for a composition that lays them out itself. */
export function SliderControl({ flow, k }: { readonly flow: SunoFlow; readonly k: Slider }) {
  const c = SLIDERS.find((x) => x.key === k);
  return c === undefined ? null : <Control flow={flow} k={k} label={c.label} />;
}

type VKey = "" | `${SunoCoverVariety}`;
const VARIETY: readonly SegOption<VKey>[] = ([0, 1, 2, 3, 4] as const).map((v) => ({ value: `${v}` as VKey, label: VARIETY_LABEL[v] }));

export function VarietyControl({ flow }: { readonly flow: SunoFlow }) {
  const v = flow.form.variety;
  return (
    <div className={s.control}>
      <span className={s.head}>
        <span className={s.label}>variety</span>
        {v === undefined ? <Chip label="default" ghost casing="lower" /> : <Chip label="reset" tone="cyan" casing="lower" name="reset variety" onPress={() => flow.untouch("variety")} />}
      </span>
      <Seg
        label="variety"
        options={VARIETY}
        value={v === undefined ? "" : (`${v}` as VKey)}
        onChange={(k) => (k === "" || k === `${v}` ? flow.untouch("variety") : flow.set({ variety: Number(k) as SunoCoverVariety }))}
      />
    </div>
  );
}

/** The press that asks the receipt; the form waits while a send is under way. */
export function SendPress({ flow }: { readonly flow: SunoFlow }) {
  return (
    <div className={s.row}>
      <Button label={flow.busy && flow.launching === null ? "Reading receipt" : flow.record.suno === undefined ? "Send to Suno" : "Send again"} tone="violet" disabled={!flow.canSend || flow.busy} pending={flow.busy && flow.launching === null} onPress={flow.ask} />
      <Tally value={SUNO_COVER_TAKES} label="covers" />
      {flow.sending && <Chip label="sending" tone="cyan" dot casing="lower" />}
      {flow.form.style.trim() === "" && <Chip label="no style" tone="amber" casing="lower" />}
      {flow.error !== null && flow.launching === null && <ErrorLine message={flow.error} live />}
    </div>
  );
}
