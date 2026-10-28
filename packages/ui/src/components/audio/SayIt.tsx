"use client";

// SAY IT - a sentence, and under it the same sentence as the compiler heard it (./lexicon.ts):
// the words that became seed terms underlined, the words that carry no intent faint, the words
// nothing matched struck through - shown, not hidden, so what was ignored is as legible as what
// was used. Hovering a heard word lights the seed terms it produced (`onTrace`); a term's own
// hover lights its words back (`lit`). What a cue produced past a list's cap waits as a ghost
// chip to add.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Field } from "../field/Field.tsx";
import { Tally } from "../tally/Tally.tsx";
import type { Produced, Translation } from "./lexicon.ts";
import s from "./Ear.module.css";

export type SayItProps = {
  readonly value: string;
  readonly onChange: (v: string) => void;
  /** The live compile of `value`. */
  readonly heard: Translation;
  /** Token indices to light: the words behind the term under the pointer. */
  readonly lit: ReadonlySet<number>;
  readonly onTrace: (tokens: readonly number[] | null) => void;
  readonly onCompose: () => void;
  readonly onSpare: (p: Produced) => void;
};

export function SayIt({ value, onChange, heard, lit, onTrace, onCompose, onSpare }: SayItProps) {
  const groupOf = (i: number): number[] => [...new Set(heard.terms.filter((p) => p.from.includes(i)).flatMap((p) => p.from))];
  const used = heard.terms.length;
  return (
    <section className={s.say} aria-label="say it">
      <form
        className={s.sayRow}
        onSubmit={(e) => {
          e.preventDefault();
          onCompose();
        }}
      >
        <div className={s.sentence}>
          <Field label="the music, in your words" value={value} placeholder="like a rainy café at night" maxLength={300} onChange={onChange} />
        </div>
        <Button label="Compose" tone="cyan" submit disabled={used === 0 && heard.bpm === null} />
      </form>
      {heard.tokens.length > 0 && (
        <p className={s.echo} aria-label="as heard">
          {heard.tokens.map((t, i) => (
            <span key={`${t.start}-${t.text}`}>
              {i > 0 && " "}
              <span
                className={s.tok}
                data-kind={t.kind}
                data-lit={lit.has(i)}
                {...(t.kind === "cue" ? { onMouseEnter: () => onTrace(groupOf(i)), onMouseLeave: () => onTrace(null) } : {})}
              >
                {t.text}
              </span>
            </span>
          ))}
        </p>
      )}
      {heard.tokens.length > 0 && (
        <div className={s.meta}>
          <Tally value={used} label="terms" />
          {heard.bpm !== null && <Chip label="tempo" value={`${heard.bpm.value} bpm`} casing="lower" />}
          {heard.unheard.length > 0 && <Chip label="unheard" value={heard.unheard.join(" · ")} tone="amber" casing="lower" />}
          {heard.spare.map((p) => (
            <Chip key={`${p.list}:${p.term}`} label={`+ ${p.term}`} casing="lower" ghost name={`add ${p.term}`} onPress={() => onSpare(p)} />
          ))}
        </div>
      )}
    </section>
  );
}
