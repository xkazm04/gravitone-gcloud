"use client";

// THE SIGN - one lesson, "when X, brief Y, because Z", written or accepted by the operator over
// the evidence it stands on (v1 app/playground/hunt/Lesson.tsx). The proposal may be the text
// engine's draft or a hand draft (claim empty, evidence filled from the map); either way NOTHING
// is saved until Sign, and Discard leaves no trace - a draft is never stored (./lesson.ts).
//
// The claim is held to ./lesson.ts `claimProblem` before the door is asked, and the refusal is
// drawn where the operator is typing; the door's own refusal (a hunt that moved since the draft)
// arrives as `error`, verbatim. The engine's failure, when it could not draft, is drawn the same
// way: the operator then writes the sentence over the same evidence.
import { useEffect, useId, useRef, useState } from "react";

import { FIELD_ATTR } from "../../keymap/target.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Tally } from "../tally/Tally.tsx";
import { claimProblem, evidenceWords, type LessonProposal } from "./lesson.ts";
import s from "./Lesson.module.css";

export const CLAIM_FIELD = "lesson-claim";

export type LessonFormProps = {
  readonly proposal: LessonProposal;
  /** What won, for a hunt's lesson: the axes and the techniques against the heard losers. */
  readonly axes?: readonly { readonly axis: string; readonly n: number }[];
  readonly techniques?: readonly { readonly technique: string; readonly won: number; readonly lost: number }[];
  /** The kind's technique slugs, the only ones a lesson may rest on. */
  readonly known: readonly string[];
  readonly draftedBy: string | null;
  readonly engineError: string | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSign: (claim: string, technique: readonly string[]) => void;
  readonly onDiscard: () => void;
};

export function LessonForm({ proposal, axes = [], techniques = [], known, draftedBy, engineError, busy, error, onSign, onDiscard }: LessonFormProps) {
  const [claim, setClaim] = useState(proposal.claim);
  const [tech, setTech] = useState<readonly string[]>(proposal.technique);
  const [refused, setRefused] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();
  useEffect(() => {
    field.current?.focus();
  }, []);
  const e = proposal.evidence;
  return (
    <form
      className={s.sign}
      aria-labelledby={id}
      onSubmit={(ev) => {
        ev.preventDefault();
        if (busy) return;
        const p = claimProblem(claim);
        setRefused(p);
        if (p === null) onSign(claim.trim(), tech);
      }}
    >
      <span id={id} hidden>
        sign the lesson
      </span>
      <div className={s.evidence}>
        <Tally value={e.n} label={evidenceWords(proposal.source).n} />
        {e.keepRate !== null && <Chip label={evidenceWords(proposal.source).rate} value={`${Math.round(e.keepRate * 100)}%`} tone="emerald" />}
        {e.meanScore !== null && <Chip label="mean" value={e.meanScore} />}
        {proposal.provider !== null && <Chip label={proposal.provider} casing="lower" />}
        {axes.map((a) => (
          <Chip key={a.axis} label={a.axis} {...(a.n > 1 ? { value: `×${a.n}` } : {})} tone="emerald" dot casing="lower" />
        ))}
      </div>
      {techniques.length > 0 && (
        <table className={s.techs}>
          <caption hidden>techniques on the crowned leaves against the heard ones</caption>
          <thead>
            <tr>
              <th scope="col">technique</th>
              <th scope="col">won</th>
              <th scope="col">lost</th>
            </tr>
          </thead>
          <tbody>
            {techniques.map((t) => (
              <tr key={t.technique}>
                <td>{t.technique}</td>
                <td className={s.won}>{t.won}</td>
                <td>{t.lost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <textarea
        ref={field}
        className={s.claim}
        value={claim}
        maxLength={600}
        placeholder="when X, brief Y, because Z"
        aria-label="the lesson, one sentence"
        onChange={(ev) => {
          setClaim(ev.currentTarget.value);
          setRefused(null);
        }}
        {...{ [FIELD_ATTR]: CLAIM_FIELD }}
      />
      <div className={s.pick} role="group" aria-label="techniques the lesson rests on">
        {known.map((t) => {
          const on = tech.includes(t);
          return <Chip key={t} label={t} casing="lower" tone={on ? "violet" : "neutral"} pressed={on} onPress={() => setTech((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))} />;
        })}
      </div>
      {refused !== null && <ErrorLine message={refused} live />}
      {engineError !== null && <ErrorLine message={`text engine · ${engineError}`} />}
      {error !== null && <ErrorLine message={error} live />}
      <div className={s.acts}>
        <Button label="Discard" size="sm" onPress={onDiscard} />
        <Button label={busy ? "Signing…" : "Sign"} tone="violet" submit disabled={busy} />
        {draftedBy !== null && <span className={s.by}>{draftedBy}</span>}
      </div>
    </form>
  );
}
