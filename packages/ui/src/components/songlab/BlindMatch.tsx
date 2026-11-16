"use client";

// THE BLIND MATCH (the contest winner "Knockout", the owner's third why): two masked arms over one
// shared playhead and window, a flip between them at the same second, and the three forced-choice
// questions - clearer lyrics, more real vocal, would release - where `would release` decides who
// advances. `neither` on any question names one defect before the vote can go.
//
// AFTER THE VOTE the masks slide off: each arm shows the take it was, its seed, gate, rights and
// scores (the better figure of each row lit), each question says whether the ear agreed with the
// meter, and the outcome names the upset. The reveal is the SERVER's: this component draws a
// `RevealView` when it is handed one and has no way to know the takes before that.
import { useState } from "react";

import { AB_QUESTIONS, type AbAnswer, type AbQuestion } from "@gt/domain/audio.yue2";

import { useKeys } from "../../keymap/dispatch.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { Tally } from "../tally/Tally.tsx";
import { vars } from "../vars.ts";
import { SONGLAB_KEYMAP, SONGLAB_MODE } from "./keys.ts";
import { clock, QUESTION_WORDS, type BlindMatchView, type EntrantView, type RevealArm, type RevealView } from "./songlab.ts";
import { useArms } from "./useArms.ts";
import s from "./BlindMatch.module.css";

export type VoteInput = { readonly pairId: string; readonly answers: Readonly<Record<AbQuestion, AbAnswer>>; readonly defect?: string };

export type BlindMatchProps = {
  /** The match waiting for the ear; absent when a decided match is open instead. */
  readonly match?: BlindMatchView;
  /** A decided match, unmasked. */
  readonly reveal?: RevealView;
  /** The defect taxonomy a `neither` names one of. */
  readonly defects: readonly string[];
  /** Resolve with the refusal in words, or null when the vote went. */
  readonly onVote: (v: VoteInput) => Promise<string | null>;
  readonly onNext?: () => void;
  /** /kit only: answers drawn already given. */
  readonly seed?: Partial<Record<AbQuestion, AbAnswer>>;
};

const LETTER = { a: "A", b: "B", neither: "neither" } as const;
const ANSWERS: readonly AbAnswer[] = ["a", "b", "neither"];
const TICKS = [5, 10, 15, 20];

function Vs({ vs }: { readonly vs: readonly [EntrantView, EntrantView] }) {
  return (
    <div className={s.vs}>
      {vs.map((e) => (
        <span key={e.seed} className={s.vsrow}>
          <span className={s.sd}>{e.seed}</span>
          <span className={s.lb}>{e.cond}</span>
          <Chip label={e.rights.short} tone="amber" name={e.rights.licence} />
        </span>
      ))}
    </div>
  );
}

function Revealed({ arm }: { readonly arm: RevealArm }) {
  return (
    <div className={s.rev}>
      <div className={s.revTitle}>{arm.entrant.label}</div>
      <div className={s.chips}>
        <Chip label={`seed ${arm.entrant.seed}`} casing="lower" />
        {arm.stages !== undefined && <Chip label={arm.stages} tone="violet" casing="lower" />}
        {arm.gate === "pass" ? <Chip label="gate ✓" tone="emerald" casing="lower" /> : arm.gate === "fail" ? <Chip label="gate ✗" tone="rose" casing="lower" /> : <Chip label="not scored yet" ghost casing="lower" />}
        <Chip label={arm.entrant.rights.licence} tone="amber" />
      </div>
      <div className={s.scores}>
        {arm.scores.map((r) => (
          <div key={r.label} className={cx(s.sc, r.tone === "better" && s.better, r.tone === "worse" && s.worse)}>
            <span>{r.label}</span>
            <b>{r.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlindMatch({ match, reveal, defects, onVote, onNext, seed = {} }: BlindMatchProps) {
  const [ans, setAns] = useState<Partial<Record<AbQuestion, AbAnswer>>>(seed);
  const [defect, setDefect] = useState<string | undefined>(undefined);
  const [focus, setFocus] = useState(0);
  const [press, setPress] = useState<{ readonly kind: "pending" } | { readonly kind: "refused"; readonly reason: string } | null>(null);
  const live = match !== undefined && reveal === undefined;
  const windowS = match?.windowS ?? reveal?.windowS ?? 25;
  const ear = useArms(match !== undefined && match.window === "cut" ? match.arms : null, windowS);
  const shown: Partial<Record<AbQuestion, AbAnswer>> = reveal?.answers ?? ans;
  const answered = AB_QUESTIONS.filter((q) => shown[q] !== undefined).length;
  const needsDefect = AB_QUESTIONS.some((q) => shown[q] === "neither") && (reveal?.defect ?? defect) === undefined;
  const ready = live && answered === 3 && !needsDefect && press?.kind !== "pending";

  const answer = (q: AbQuestion, a: AbAnswer) => {
    if (!live) return;
    setAns((x) => ({ ...x, [q]: a }));
    const qi = AB_QUESTIONS.indexOf(q);
    setFocus(a !== "neither" && qi < 2 ? qi + 1 : qi);
  };
  const send = () => {
    if (!ready || match === undefined) return;
    const answers = { lyrics: ans.lyrics ?? "neither", vocal: ans.vocal ?? "neither", release: ans.release ?? "neither" } as const;
    setPress({ kind: "pending" });
    ear.stop();
    void onVote({ pairId: match.pairId, answers, ...(defect === undefined || !Object.values(answers).includes("neither") ? {} : { defect }) }).then((reason) => setPress(reason === null ? null : { kind: "refused", reason }));
  };

  useKeys(
    SONGLAB_MODE,
    {
      "play-a": () => ear.play(0),
      "play-b": () => ear.play(1),
      flip: () => ear.flip(),
      toggle: () => ear.toggle(),
      seek: ({ index }) => ear.seek(ear.pos + (index === 0 ? -2 : 2)),
      answer: ({ index }) => {
        const q = AB_QUESTIONS[focus];
        const a = ANSWERS[index];
        if (q !== undefined && a !== undefined) answer(q, a);
      },
      send: () => (reveal !== undefined ? onNext?.() : send()),
    },
    { facts: live ? ["match", "blind"] : reveal !== undefined ? ["match"] : [] },
  );

  const title = match?.title ?? reveal?.title ?? "";
  const drawName = match?.drawName ?? reveal?.drawName ?? "";
  const playing = (i: 0 | 1) => ear.playing && ear.active === i;
  const f = Math.min(1, ear.pos / windowS);

  return (
    <div className={s.booth} data-role="sl-booth">
      <div className={s.mhead}>
        <h2 className={s.title} data-role="sl-booth-title">
          {title}
        </h2>
        <Chip label={drawName} casing="lower" />
        {reveal !== undefined ? <Chip label="revealed" tone="emerald" dot casing="lower" /> : <Chip label="blind" tone="amber" dot casing="lower" />}
        {match?.window === "cutting" && <Chip label="window cutting" tone="cyan" ghost casing="lower" />}
        <span className={s.keys}>
          <span>
            <Keycap mode={SONGLAB_MODE} verb="play-a" size="sm" map={SONGLAB_KEYMAP} />
            <Keycap mode={SONGLAB_MODE} verb="play-b" size="sm" map={SONGLAB_KEYMAP} /> play
          </span>
          <span>
            <Keycap mode={SONGLAB_MODE} verb="flip" size="sm" map={SONGLAB_KEYMAP} /> flip
          </span>
          <span className={s.k2}>
            <Keycap mode={SONGLAB_MODE} verb="seek" size="sm" map={SONGLAB_KEYMAP} /> 2 s
          </span>
        </span>
      </div>
      {reveal !== undefined && (
        <>
          <div className={cx(s.outcome, reveal.winnerArm !== undefined && s.top)} data-role="sl-outcome">
            <div className={s.l1}>
              {reveal.winnerArm === undefined ? "neither advances · both out" : `${reveal.arms[reveal.winnerArm === "a" ? 0 : 1].entrant.label} advances`}
              {reveal.outcome === "upset" && <Chip label="upset" tone="amber" casing="lower" />}
            </div>
            <div className={s.l2}>{reveal.line}</div>
          </div>
          {onNext !== undefined && (
            <div className={s.sendrow}>
              <Button label="Next match" tone="cyan" size="sm" onPress={onNext} shortcut={{ mode: SONGLAB_MODE, verb: "send" }} />
            </div>
          )}
        </>
      )}
      {match !== undefined && <Vs vs={match.vs} />}
      {ear.error !== undefined && <ErrorLine message={ear.error} live />}
      <div className={cx(s.arms, reveal !== undefined && s.revealed)}>
        {([0, 1] as const).map((i) => {
          const arm = i === 0 ? "a" : "b";
          const letter = i === 0 ? "A" : "B";
          const picks = AB_QUESTIONS.filter((q) => shown[q] === arm);
          const won = reveal?.winnerArm === arm;
          return (
            <div key={arm} className={cx(s.arm, playing(i) && s.sounding, won && s.won, i === 1 && s.second)} data-role={i === 0 ? "sl-arm" : "sl-arm-b"}>
              <div className={s.armTop}>
                <span className={s.letter} data-role="sl-arm-letter">
                  {letter}
                </span>
                <button type="button" className={cx(s.play, playing(i) && s.on)} aria-label={`${playing(i) ? "pause" : "play"} ${letter}`} aria-pressed={playing(i)} disabled={!live || match?.window !== "cut"} onClick={() => ear.play(i)}>
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    {playing(i) ? <path d="M2 1.5h3v9H2zM7 1.5h3v9H7z" fill="currentColor" /> : <path d="M2.5 1.2v9.6L10.5 6z" fill="currentColor" />}
                  </svg>
                </button>
                <span className={s.time}>
                  <b>{clock(ear.pos)}</b>
                  <span className={s.of}> / {clock(windowS, false)}</span>
                </span>
              </div>
              <div
                className={s.scrub}
                role="slider"
                aria-label={`position ${letter}`}
                aria-valuemin={0}
                aria-valuemax={windowS}
                aria-valuenow={Math.round(ear.pos * 10) / 10}
                tabIndex={0}
                data-role="sl-scrub"
                onPointerDown={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  ear.seek(((e.clientX - r.left) / Math.max(1, r.width)) * windowS);
                }}
              >
                {TICKS.map((t) => (
                  <i key={t} className={s.tick} style={vars({ "--at": `${(t / windowS) * 100}%` })} />
                ))}
                <i className={s.played} style={vars({ "--f": `${f * 100}%` })} />
                <i className={s.head} style={vars({ "--f": `${f * 100}%` })} />
              </div>
              <div className={s.cover}>
                <div className={s.mask} data-role="sl-mask">
                  <Chip label="masked" casing="lower" />
                  {picks.map((q) => (
                    <Chip key={q} label={QUESTION_WORDS[q]} tone="cyan" casing="lower" />
                  ))}
                </div>
                {reveal !== undefined && <Revealed arm={reveal.arms[i]} />}
              </div>
            </div>
          );
        })}
        <div className={s.flipcol}>
          <button type="button" className={s.flip} aria-label="flip A and B" disabled={!live || match?.window !== "cut"} onClick={() => ear.flip()}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 5h9l-2.5-2.5M13 11H4l2.5 2.5" />
            </svg>
            <span>F</span>
          </button>
        </div>
      </div>
      <div className={s.questions} role="group" aria-label="questions">
        {AB_QUESTIONS.map((q, qi) => (
          <div key={q} className={cx(s.q, qi === focus && live && s.qcur)}>
            <span className={s.ql} data-role="sl-question">
              {QUESTION_WORDS[q]}
            </span>
            <div className={s.seg} role="group" aria-label={QUESTION_WORDS[q]}>
              {ANSWERS.map((a) => (
                <button key={a} type="button" className={cx(a === "neither" && s.n)} aria-pressed={shown[q] === a} disabled={!live} onClick={() => answer(q, a)}>
                  <kbd className={s.kbd}>{a === "neither" ? "N" : LETTER[a]}</kbd>
                  {LETTER[a]}
                </button>
              ))}
            </div>
            {reveal !== undefined && (
              <span className={s.verdict}>
                <span className={cx(reveal.verdicts[q].agree === "agrees" && s.agree, reveal.verdicts[q].agree === "differs" && s.differ, reveal.verdicts[q].agree === "neither" && s.neitherWord)}>{reveal.verdicts[q].agree}</span>
                <span>{reveal.verdicts[q].detail}</span>
              </span>
            )}
          </div>
        ))}
        {live && AB_QUESTIONS.some((q) => ans[q] === "neither") && (
          <div className={s.defects} role="group" aria-label="defect">
            {defects.map((d) => (
              <Chip key={d} label={d} casing="lower" pressed={defect === d} onPress={() => setDefect(defect === d ? undefined : d)} />
            ))}
          </div>
        )}
        {reveal?.defect !== undefined && (
          <div className={s.defects}>
            <Chip label={reveal.defect} tone="rose" casing="lower" />
          </div>
        )}
      </div>
      {live && (
        <div className={s.sendrow}>
          <Button label={press?.kind === "pending" ? "Send vote…" : "Send vote"} tone={ready ? "cyan" : "neutral"} size="sm" disabled={!ready} onPress={send} shortcut={{ mode: SONGLAB_MODE, verb: "send" }} />
          <Tally value={answered} label="of 3" />
          {needsDefect && <span className={s.warn}>neither · name a defect</span>}
        </div>
      )}
      {press?.kind === "refused" && <ErrorLine message={press.reason} live />}
    </div>
  );
}
