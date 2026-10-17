// THE OPERATOR BATCH'S FORM - one brief, N takes of it (./batch.ts). Music is a prompt with its
// terms, tempo and key; an effect is briefed envelope-first - event, material, space - with its
// category, loop flag and prompt influence, and the prompt it composes is drawn verbatim under
// the fields, because that text IS what the vendor is sent. The seconds of audio the batch asks
// for ride on the price button: ElevenLabs bills by them (v1 shared/price.tsx), and the receipt
// the button opens prices the rest. A form the vendor would refuse names its own problem on the
// button and prices nothing.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Field } from "../field/Field.tsx";
import { Toggle } from "../toggle/Toggle.tsx";
import { batchPrompt, batchSeconds, COUNT, DURATION, TECHNIQUES, type BatchForm as Form, type BatchKind } from "./batch.ts";
import s from "./BatchForm.module.css";

export type BatchFormProps = {
  readonly kind: BatchKind;
  readonly form: Form;
  readonly onForm: (f: Form) => void;
  /** ./batch.ts `batchProblem`, or null. */
  readonly problem: string | null;
  /** The engine the batch runs on; null when none on the desk makes this kind. */
  readonly engine: string | null;
  readonly busy: boolean;
  readonly onPrice: () => void;
};

const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

function Num({ label, value, min, max, step, onChange }: { readonly label: string; readonly value: number | null; readonly min: number; readonly max: number; readonly step: number; readonly onChange: (n: number | null) => void }) {
  return (
    <label className={s.num}>
      <span className={s.label}>{label}</span>
      <input className={s.numField} type="number" min={min} max={max} step={step} value={value ?? ""} onChange={(e) => onChange(num(e.currentTarget.value))} />
    </label>
  );
}

function Text({ label, value, onChange }: { readonly label: string; readonly value: string; readonly onChange: (v: string) => void }) {
  return (
    <span className={s.text}>
      <span className={s.label} aria-hidden="true">
        {label}
      </span>
      <Field label={label} value={value} onChange={onChange} />
    </span>
  );
}

export function BatchForm({ kind, form, onForm, problem, engine, busy, onPrice }: BatchFormProps) {
  const set = <K extends keyof Form>(k: K, v: Form[K]): void => onForm({ ...form, [k]: v });
  const d = DURATION[kind];
  const toggleTechnique = (t: string): void => set("technique", form.technique.includes(t) ? form.technique.filter((x) => x !== t) : [...form.technique, t]);
  const prompt = batchPrompt(kind, form);
  return (
    <section className={s.form} aria-label={`${kind} batch`}>
      {kind === "sfx" ? (
        <div className={s.fields}>
          <Text label="event" value={form.event} onChange={(v) => set("event", v)} />
          <Text label="material" value={form.material} onChange={(v) => set("material", v)} />
          <Text label="space" value={form.space} onChange={(v) => set("space", v)} />
          <Text label="category" value={form.sfxCategory} onChange={(v) => set("sfxCategory", v)} />
          <Text label="mood" value={form.mood} onChange={(v) => set("mood", v)} />
          <Text label="more" value={form.prompt} onChange={(v) => set("prompt", v)} />
        </div>
      ) : (
        <div className={s.fields}>
          <label className={s.wide}>
            <span className={s.label}>prompt</span>
            <textarea className={s.area} rows={3} value={form.prompt} onChange={(e) => set("prompt", e.currentTarget.value)} />
          </label>
          <Text label="genre" value={form.genre} onChange={(v) => set("genre", v)} />
          <Text label="mood" value={form.mood} onChange={(v) => set("mood", v)} />
          <Text label="instrument" value={form.instrument} onChange={(v) => set("instrument", v)} />
          <Text label="exclude" value={form.negative} onChange={(v) => set("negative", v)} />
          <Num label="tempo bpm" value={form.tempoBpm} min={40} max={220} step={1} onChange={(n) => set("tempoBpm", n)} />
          <Text label="key" value={form.key ?? ""} onChange={(v) => set("key", v.trim() === "" ? null : v)} />
        </div>
      )}
      <div className={s.knobs}>
        <Num label="length s" value={form.durationS} min={d.min} max={d.max} step={d.step} onChange={(n) => set("durationS", n ?? 0)} />
        <Num label="takes" value={form.count} min={COUNT.min} max={COUNT.max} step={1} onChange={(n) => set("count", n ?? 0)} />
        {kind === "sfx" && (
          <>
            <Num label="influence" value={form.promptInfluence} min={0} max={1} step={0.05} onChange={(n) => set("promptInfluence", n)} />
            <Toggle label="loop" on={form.loop} onToggle={(on) => set("loop", on)} />
          </>
        )}
      </div>
      <div className={s.techniques} role="group" aria-label="techniques">
        {TECHNIQUES[kind].map((t) => (
          <Chip key={t} label={t} casing="lower" tone={form.technique.includes(t) ? "cyan" : "neutral"} pressed={form.technique.includes(t)} onPress={() => toggleTechnique(t)} />
        ))}
      </div>
      <pre className={s.prompt} aria-label="prompt sent">
        {prompt === "" ? "—" : prompt}
      </pre>
      <div className={s.acts}>
        {engine !== null && <Chip label={engine} casing="lower" />}
        <span className={s.grow} />
        <Button
          label={`Price ${form.count} × ${kind === "sfx" ? "effect" : "take"}`}
          tone="cyan"
          disabled={busy || problem !== null || engine === null}
          tally={{ value: batchSeconds(form), label: "s audio" }}
          {...(problem === null ? {} : { badge: { label: problem, tone: "amber" as const } })}
          onPress={onPrice}
        />
      </div>
    </section>
  );
}
