"use client";

// SAY IT - a sentence, and under it the same sentence as the compiler heard it (./lexicon.ts):
// the words that became seed terms underlined, the words that carry no intent faint, the words
// nothing matched struck through - shown, not hidden, so what was ignored is as legible as what
// was used. Hovering a heard word lights the seed terms it produced (`onTrace`); a term's own
// hover lights its words back (`lit`). What a cue produced past a list's cap waits as a ghost
// chip to add. Where two of the words pull the tempo or the mode apart, both sides stand as chips
// with what each alone would make; a press settles it by saying so ("62 bpm", "in minor") in the
// sentence itself, so the words that would have avoided the compromise are learned by using them.
// With an ear (`hearPull`) each side plays first: the same bars at that side's tempo or key.
import type { ReactNode } from "react";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { EarButton } from "./EarButton.tsx";
import { Field } from "../field/Field.tsx";
import { Tally } from "../tally/Tally.tsx";
import type { Produced, PullSide, Translation } from "./lexicon.ts";
import type { EarState } from "./useEar.ts";
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
  /** Instruments chosen by ear this visit, with the plain words that won them: a press says it. */
  readonly learned?: readonly { readonly term: string; readonly plain: string }[];
  readonly onLearned?: (term: string) => void;
  /** Sentences offered while the field is empty: a press fills it and composes. */
  readonly examples?: readonly string[];
  readonly onExample?: (sentence: string) => void;
  /** A pull's side heard before it is chosen; `stateOf` null where nothing here can play it. */
  readonly hearPull?: { readonly stateOf: (side: PullSide) => EarState | null; readonly onPlay: (side: PullSide) => void };
};

export function SayIt({ value, onChange, heard, lit, onTrace, onCompose, onSpare, examples = [], onExample, learned = [], onLearned, hearPull }: SayItProps) {
  const groupOf = (i: number): number[] => [...new Set(heard.terms.filter((p) => p.from.includes(i)).flatMap((p) => p.from))];
  const used = heard.terms.length;
  // Tempo, key and length come from words too: pointing at one lights the words it was read from.
  const traced = (from: readonly number[], chip: ReactNode): ReactNode => (
    <span className={s.traced} onMouseEnter={() => onTrace(from)} onMouseLeave={() => onTrace(null)}>
      {chip}
    </span>
  );
  const wordsOf = (from: readonly number[]): string => from.map((i) => heard.tokens[i]?.text ?? "").join(" ");
  const say = (more: string): string => (value.trim() === "" ? more : `${value.trim().replace(/[,.]$/, "")}, ${more}`);
  const side = (x: PullSide): ReactNode => {
    const state = hearPull?.stateOf(x) ?? null;
    return traced(
      x.from,
      <span className={s.pull}>
        {state !== null && hearPull !== undefined && <EarButton state={state} name={`${wordsOf(x.from)} ${x.says}`} onPress={() => hearPull.onPlay(x)} />}
        <Chip label={wordsOf(x.from)} value={x.says} tone="amber" casing="lower" ghost name={`settle on ${x.settle}`} onPress={() => onChange(say(x.settle))} />
      </span>,
    );
  };
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
          <Field label="the music, in your words" value={value} placeholder="something like a heist movie but chill" maxLength={300} onChange={onChange} />
        </div>
        <Button label="Compose" tone="cyan" submit disabled={used === 0 && heard.bpm === null} />
      </form>
      {heard.tokens.length === 0 && onExample !== undefined && examples.length > 0 && (
        <div className={s.meta}>
          {examples.map((x) => (
            <Chip key={x} label={x} casing="lower" ghost name={`compose: ${x}`} onPress={() => onExample(x)} />
          ))}
        </div>
      )}
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
          {heard.bpm !== null && traced(heard.bpm.from, <Chip label="tempo" value={`${heard.bpm.value} bpm`} casing="lower" />)}
          {heard.key !== null && traced(heard.key.from, <Chip label="key" value={heard.key.value} casing="lower" />)}
          {heard.lengthS !== null && traced(heard.lengthS.from, <Chip label="length" value={`${heard.lengthS.value} s`} casing="lower" />)}
          {heard.pulls.map((p) => (
            <span key={p.kind} className={s.pull} role="group" aria-label={`${p.kind}, two ways`}>
              {side(p.a)}
              <span className={s.versus} aria-hidden="true">
                ↔
              </span>
              {side(p.b)}
            </span>
          ))}
          {heard.unheard.length > 0 && <Chip label="unheard" value={heard.unheard.join(" · ")} tone="amber" casing="lower" />}
          {heard.near.map((n) => {
            const t = heard.tokens[n.token];
            if (t === undefined) return null;
            return <Chip key={`${n.token}:${n.to}`} label={`${t.text} → ${n.to}`} tone="amber" casing="lower" ghost name={`read ${t.text} as ${n.to}`} onPress={() => onChange(`${value.slice(0, t.start)}${n.to}${value.slice(t.end)}`)} />;
          })}
          {heard.spare.map((p) => (
            <Chip key={`${p.list}:${p.term}`} label={`+ ${p.term}`} casing="lower" ghost name={`add ${p.term}`} onPress={() => onSpare(p)} />
          ))}
        </div>
      )}
      {learned.length > 0 && onLearned !== undefined && (
        <div className={s.meta} aria-label="learned by ear">
          <Tally value={learned.length} label="learned" />
          {learned.map((l) => (
            <Chip key={l.term} label={l.term} value={l.plain} casing="lower" ghost name={`say ${l.term}`} onPress={() => onLearned(l.term)} />
          ))}
        </div>
      )}
    </section>
  );
}
