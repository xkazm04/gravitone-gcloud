"use client";

// ONE RESULT CARD (canvas, WP3): one agent answer and the ask that opened it. Open, it is the
// answer's pieces in slot order (./registry.tsx: header, hero, band, parts, inline, footer), each
// realized by lookup; the footer also holds this variant's system notes (what the door dropped from
// this turn, in the dock's own words). Folded, an older card is a one-line strip: a play mark for
// its take, its number, its name and the ask - a playable history of versions. A pending card is the
// ask the agent is still working on.
import { useEffect } from "react";

import type { StudioAction } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { droppedWords } from "@gt/ui/components/dock/dock.ts";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

import { localPlay, nodeSound } from "../../_host/press.ts";
import type { Dispatch } from "../../_host/types.ts";
import { soundsUnder } from "./live.ts";
import { cardTitle, nodeOf, stemLabel, type CardModel } from "./model.ts";
import { Piece, SLOTS, slotOf, type PieceCtx } from "./registry.tsx";
import s from "./canvas.module.css";

export type CardProps = {
  readonly card: CardModel;
  readonly latest: boolean;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly turns: readonly ParsedTurn[];
  readonly transport: MixTransport;
  readonly dispatch: Dispatch;
  readonly askBlocked: string | null;
  readonly renders: "ready" | "missing";
  readonly thinking: boolean;
};

export function Card(p: CardProps) {
  const { card } = p;
  if (card.answer === null) return <Pending ask={card.ask?.text ?? null} n={card.n} thinking={p.thinking} />;
  return <Answer {...p} answer={card.answer} />;
}

function Pending({ ask, n, thinking }: { readonly ask: string | null; readonly n: number; readonly thinking: boolean }) {
  return (
    <article className={s.card} data-pending="true" aria-busy={thinking} aria-label={`answer ${n}, on its way`}>
      <header className={s.cardHead}>
        <span className={s.num}>{n}</span>
        <p className={s.ask}>{ask ?? "your ask"}</p>
      </header>
      <p className={s.working}>{thinking ? "The agent is working on this..." : "Waiting for the agent."}</p>
      <div className={s.skeleton} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </article>
  );
}

function Answer({ card, latest, open, onOpen, turns, transport, dispatch, askBlocked, renders, answer }: CardProps & { readonly answer: ParsedTurn }) {
  const turn = answer.turn;
  const title = cardTitle(turn);
  const track = nodeOf(turn, "track");
  const lead = track ?? turn.show.find((n) => nodeSound(turn, n) !== null);
  const leadSound = lead === undefined ? null : nodeSound(turn, lead);
  const stemsNode = nodeOf(turn, "stems");
  const hrefs = [...(track === undefined ? [] : [track.mix.href]), ...(stemsNode?.rows.flatMap((r) => (r.audio === undefined ? [] : [r.audio.href])) ?? [])];
  const { decode } = transport;
  const want = open ? hrefs.join("|") : "";
  useEffect(() => {
    if (want !== "") decode(want.split("|"));
  }, [want, decode]);

  const lengthS = track?.lengthS ?? track?.mix.durationS ?? (track !== undefined && soundsUnder(transport, turn.id, track.id) ? transport.duration : null);
  const ctx: PieceCtx = {
    turn,
    latest,
    transport,
    press: (a: StudioAction) => dispatch(a, turn.id),
    askBlocked,
    renders,
    lengthS,
    stemName: (id) => stemLabel(turns, turn.id, id),
  };
  const notes = droppedWords(answer.dropped);
  const ask = turn.show.some((n) => n.kind === "heard") ? null : card.ask;

  if (!open)
    return (
      <article className={s.strip} aria-label={`answer ${card.n}: ${title}`}>
        {leadSound !== null && lead !== undefined ? (
          <EarButton state={transport.stateOf(leadSound.key)} name={`answer ${card.n}, ${leadSound.name}`} onPress={() => dispatch(localPlay(lead.id), turn.id)} />
        ) : (
          <span className={s.noEar} aria-hidden="true" />
        )}
        <span className={s.num}>{card.n}</span>
        <span className={s.stripTitle}>{title}</span>
        {card.ask !== null && <span className={s.stripAsk}>{card.ask.text}</span>}
        {notes !== null && <span className={s.stripNote}>{notes.summary}</span>}
        <Button label="open" size="sm" onPress={() => onOpen(true)} />
      </article>
    );

  return (
    <article className={s.card} data-latest={latest || undefined} aria-label={`answer ${card.n}: ${title}`}>
      <header className={s.cardHead}>
        <span className={s.num}>{card.n}</span>
        <div className={s.headBody}>
          {ask !== null && (
            <p className={s.ask}>
              <span className={s.youSaid}>you said</span>
              {ask.text}
            </p>
          )}
          {turn.show.filter((n) => slotOf(n.kind) === "header").map((n) => (
            <Piece key={n.id} node={n} ctx={ctx} />
          ))}
          <p className={s.reply}>{turn.text}</p>
        </div>
        {!latest && <Button label="fold" size="sm" onPress={() => onOpen(false)} />}
      </header>
      {SLOTS.filter((slot) => slot !== "header").map((slot) => {
        const pieces = turn.show.filter((n) => slotOf(n.kind) === slot);
        const isFoot = slot === "footer";
        if (pieces.length === 0 && !(isFoot && notes !== null)) return null;
        return (
          <div key={slot} className={s.slot} data-slot={slot}>
            {pieces.map((n) => (
              <Piece key={n.id} node={n} ctx={ctx} />
            ))}
            {isFoot && notes !== null && (
              <details className={s.notes}>
                <summary>{notes.summary}</summary>
                <ul>
                  {notes.rows.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
      {turn.show.length === 0 && <p className={s.working}>{"This answer is words only; nothing to play."}</p>}
    </article>
  );
}
