"use client";

// THE DUEL CARD - one pair at a time (./duel.ts): two sounds that differ on one axis, each with
// its play mark, then A, B, or no difference. The words for each side stay hidden until the
// choice is made, so the pick is the ear's; the progress is a pip per axis. When every axis is
// answered, the seed's words are listed with the pair that decided each, and Use hands the seed
// to the composer.
import { Button } from "../button/Button.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { PipRow } from "../piprow/PipRow.tsx";
import type { Look } from "../status/status.ts";
import { compileDuel, nextAxis, type Answer, type DuelAxis, type DuelSound } from "./duel.ts";
import { EarButton } from "./EarButton.tsx";
import type { EarState } from "./useEar.ts";
import s from "./Ear.module.css";

export type DuelCardProps = {
  readonly axes: readonly DuelAxis[];
  readonly answers: Readonly<Record<string, Answer>>;
  readonly hrefOf: (sound: DuelSound) => string;
  readonly stateOf: (href: string) => EarState;
  readonly onPlay: (href: string) => void;
  readonly onAnswer: (axis: string, a: Answer) => void;
  readonly onUse: () => void;
  readonly onAgain: () => void;
};

export function DuelCard({ axes, answers, hrefOf, stateOf, onPlay, onAnswer, onUse, onAgain }: DuelCardProps) {
  const at = nextAxis(axes, answers);
  const looks: Look[] = axes.map((x) => (answers[x.id] === undefined ? (x === at ? "running" : "idle") : answers[x.id] === "skip" ? "paused" : "done"));
  const decided = axes.filter((x) => answers[x.id] !== undefined && answers[x.id] !== "skip").length;
  const pad = (side: "a" | "b") => {
    if (at === null) return null;
    const href = hrefOf(at[side].sound);
    return (
      <div className={s.pad} data-sounding={stateOf(href) !== "idle"}>
        <EarButton state={stateOf(href)} name={`sound ${side.toUpperCase()}`} onPress={() => onPlay(href)} big />
        <span className={s.padName}>{side.toUpperCase()}</span>
        <Button label={`Pick ${side.toUpperCase()}`} size="sm" tone="cyan" onPress={() => onAnswer(at.id, side)} />
      </div>
    );
  };
  if (at === null) {
    const { reasons } = compileDuel(axes, answers);
    return (
      <section className={s.duel} aria-label="duel">
        <div className={s.stripHead}>
          <CapsHeading text="by ear" variant="section" level={4} />
          <PipRow looks={looks} label={`${decided} of ${axes.length} axes decided`} />
          <span className={s.grow} />
          <Button label="Again" size="sm" onPress={onAgain} />
          <Button label="Use" tone="cyan" size="sm" disabled={reasons.length === 0} onPress={onUse} />
        </div>
        <ul className={s.rows}>
          {reasons.map((r) => (
            <li key={`${r.list}:${r.term}`} className={s.reason}>
              <span className={s.plain}>{r.term}</span>
              <span className={s.termWord}>{r.why}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section className={s.duel} aria-label="duel">
      <div className={s.stripHead}>
        <CapsHeading text={at.name} variant="section" level={4} />
        <PipRow looks={looks} label={`${decided} of ${axes.length} axes decided`} />
        <span className={s.grow} />
        <Button label="No difference" size="sm" onPress={() => onAnswer(at.id, "skip")} />
      </div>
      <div className={s.pads}>
        {pad("a")}
        {pad("b")}
      </div>
    </section>
  );
}
