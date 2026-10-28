"use client";

// THE EAR STRIP - instruments heard in turn, each playing the SAME phrase at the seed's tempo and
// key (the audition route renders it), so the only thing that differs between two rows is the
// instrument. Plain words first, the term Suno reads second: the audition is the input, the term
// is what it teaches. `blind` hides every word until one is chosen, so a pick is made by ear alone.
//
// `swap` lists one instrument's candidates with the instrument itself on top (`now`), so the
// comparison always has its reference; `add` lists what the seed does not hold yet.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Toggle } from "../toggle/Toggle.tsx";
import type { AtlasEntry } from "./atlas.ts";
import { EarButton } from "./EarButton.tsx";
import type { EarState } from "./useEar.ts";
import s from "./Ear.module.css";

export type EarStripProps = {
  readonly title: string;
  /** The instrument being swapped, drawn first as the reference; absent when adding. */
  readonly now?: AtlasEntry;
  readonly candidates: readonly AtlasEntry[];
  readonly stateOf: (e: AtlasEntry) => EarState;
  readonly onPlay: (e: AtlasEntry) => void;
  readonly onPick: (e: AtlasEntry) => void;
  readonly onClose: () => void;
  readonly blind: boolean;
  readonly onBlind: (b: boolean) => void;
  /** What every row holds still - bars, key, tempo, loudness - so only the instrument differs. */
  readonly held?: readonly string[];
};

export function EarStrip({ title, now, candidates, stateOf, onPlay, onPick, onClose, blind, onBlind, held = [] }: EarStripProps) {
  const row = (e: AtlasEntry, i: number, isNow: boolean) => {
    const st = stateOf(e);
    return (
      <li key={e.id} className={s.cand} data-now={isNow} data-sounding={st !== "idle"}>
        <EarButton state={st} name={blind && !isNow ? `sound ${i + 1}` : e.term} onPress={() => onPlay(e)} />
        {blind && !isNow ? (
          <span className={s.words}>
            <span className={s.plain}>{`sound ${i + 1}`}</span>
            <span className={s.hidden}>· · ·</span>
          </span>
        ) : (
          <span className={s.words}>
            <span className={s.plain}>{e.plain.join(" · ")}</span>
            <span className={s.termWord}>{e.term}</span>
          </span>
        )}
        <span className={s.role}>{blind && !isNow ? "" : e.role}</span>
        {isNow ? <span className={s.termWord}>now</span> : <Button label="Use" size="sm" onPress={() => onPick(e)} />}
      </li>
    );
  };
  return (
    <section className={s.strip} aria-label={title}>
      <div className={s.stripHead}>
        <CapsHeading text={title} variant="section" level={4} />
        {held.map((h) => (
          <Chip key={h} label={h} casing="lower" />
        ))}
        <span className={s.grow} />
        <Toggle label="blind" on={blind} onToggle={onBlind} />
        <Button label="Close" size="sm" onPress={onClose} />
      </div>
      <ul className={`${s.rows} ${s.cards}`}>
        {now !== undefined && row(now, -1, true)}
        {candidates.map((e, i) => row(e, i, false))}
      </ul>
    </section>
  );
}
