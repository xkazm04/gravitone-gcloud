"use client";

// THE HUNT'S SHELF AND ITS IDEA BOX (v1 app/playground/hunt/Start.tsx absorbed). The box takes
// one problem in the operator's words - its placeholder is the operator's own example of a good
// one (./hunt.ts IDEA_EXAMPLE), the shape rather than a sentence about it - and the shelf draws
// every past hunt of the kind as a mini-map: one stack of pips per axis, a pip per leaf in its
// state, the crowned ones emerald. The pips are a picture for the sighted; each card's name says
// the same in words (its idea and its counts).
import { useId, useState } from "react";

import { FIELD_ATTR } from "../../keymap/target.ts";
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { Tally } from "../tally/Tally.tsx";
import { IDEA_EXAMPLE, type HuntCardView } from "./hunt.ts";
import s from "./Hunt.module.css";

export const IDEA_FIELD = "hunt-idea";

export type HuntIdeaProps = {
  readonly kind: "music" | "sfx";
  readonly busy: boolean;
  readonly error: string | null;
  readonly onDraft: (idea: string) => void;
};

export function HuntIdea({ kind, busy, error, onDraft }: HuntIdeaProps) {
  const [v, setV] = useState("");
  const id = useId();
  return (
    <form
      className={s.idea}
      aria-labelledby={id}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && v.trim() !== "") onDraft(v.trim());
      }}
    >
      <span id={id} hidden>
        idea
      </span>
      <textarea className={s.ideaField} value={v} maxLength={2000} placeholder={IDEA_EXAMPLE[kind]} aria-label={`${kind} hunt idea`} onChange={(e) => setV(e.currentTarget.value)} {...{ [FIELD_ATTR]: IDEA_FIELD }} />
      <div className={s.ideaActs}>
        <Button label={busy ? "Drafting…" : "Draft the map"} tone="cyan" submit disabled={busy || v.trim() === ""} />
      </div>
      {error !== null && <ErrorLine message={error} live />}
    </form>
  );
}

const pipClass = (state: string, winner: boolean): string => cx(s.pip, s[`pip_${state}`], winner && s.pipWin);

export type HuntShelfProps = {
  readonly hunts: readonly HuntCardView[];
  readonly open: string | null;
  readonly hrefOf: (id: string) => string;
};

export function HuntShelf({ hunts, open, hrefOf }: HuntShelfProps) {
  return (
    <ul className={s.shelf} aria-label="past hunts">
      {hunts.map((h) => {
        const c = h.counts;
        return (
          <li key={h.id}>
            <a className={cx(s.card, h.id === open && s.cardOn)} href={hrefOf(h.id)} aria-current={h.id === open ? "page" : undefined} aria-label={`${h.idea} · ${c.rendered} of ${c.leaves} heard · ${c.winners} crowned${c.failed > 0 ? ` · ${c.failed} failed` : ""}${h.lessonId === null ? "" : " · lesson signed"}`}>
              <span className={s.cardIdea}>{h.idea}</span>
              <span className={s.mini} aria-hidden="true">
                {h.mini.map((col, i) => (
                  <span key={`${col.axis}-${i}`} className={s.miniCol} title={col.axis}>
                    {col.leaves.map((l, j) => (
                      <span key={j} className={pipClass(l.state, l.winner)} />
                    ))}
                  </span>
                ))}
              </span>
              <span className={s.cardMeta} aria-hidden="true">
                <Tally value={c.rendered} of={c.leaves} label="heard" />
                {c.winners > 0 && <Chip label="crowned" value={c.winners} tone="emerald" />}
                {c.failed > 0 && <Chip label="failed" value={c.failed} tone="rose" />}
                {h.lessonId !== null && <Chip label="lesson" tone="violet" dot />}
                <span>{h.createdAt.slice(0, 10)}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
