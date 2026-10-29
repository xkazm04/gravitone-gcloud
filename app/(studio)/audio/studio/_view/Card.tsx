"use client";

// ONE RESULT CARD (spark audio-agent-studio, stage S2: canvas's card, desk's pieces). Open, it is one
// agent answer under the ask that opened it: the reply in words, the sentence strip (what was heard,
// a pull), then the card's timeline - the transport with the duel's A/B switch, the sections ruler,
// the track as the master lane with its measures, a lane per part with "try instead" drawers docked
// under the part they would replace - and the card's notes (what the door dropped from this answer,
// pieces past the one a place shows). The arrangement and what was heard carry into the card from an
// earlier answer until one replaces them (./model.ts cardPieces). Folded, an older card is a
// one-line strip: a play mark for its take, its number, its name and the ask. A pending card is the
// ask the agent is still working on.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { sectionSpans } from "@gt/ui/components/audio/mix.ts";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { droppedWords } from "@gt/ui/components/dock/dock.ts";
import { axisTemplate, deskAxis, fracAt } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound } from "../_host/press.ts";
import type { ParsedTurn, VariantProps } from "../_host/types.ts";
import { arrangementKeys, cardPresses, cardSound, type CardCtx } from "./ctx.ts";
import { cardPieces, cardTitle, compactLanes, hasTimeline, nodeOf, type CardModel } from "./model.ts";
import { TransportBar } from "./Track.tsx";
import { drawKind, extras } from "./registry.tsx";
import { usePlayhead } from "./usePlayhead.ts";
import lanes from "./lanes.module.css";
import s from "./view.module.css";

export type CardProps = {
  readonly v: VariantProps;
  readonly card: CardModel;
  readonly latest: boolean;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly agentOpen: boolean;
  readonly blocked: string | null;
};

export function Card(p: CardProps) {
  const { card } = p;
  if (card.answer === null) return <Pending ask={card.ask?.text ?? null} n={card.n} thinking={p.v.dock.state === "thinking"} />;
  if (!p.open) return <Folded {...p} answer={card.answer} />;
  return <Answer {...p} answer={card.answer} />;
}

function Pending({ ask, n, thinking }: { readonly ask: string | null; readonly n: number; readonly thinking: boolean }) {
  return (
    <article className={s.card} data-pending="true" aria-busy={thinking} aria-label={`answer ${n}, on its way`}>
      <header className={s.cardHead}>
        <span className={s.num}>{n}</span>
        <p className={s.ask}>
          <span className={s.youSaid}>you said</span>
          {ask ?? "your ask"}
        </p>
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

function Folded({ v, card, onOpen, answer }: CardProps & { readonly answer: ParsedTurn }) {
  const { transport, dispatch } = v;
  const turn = answer.turn;
  const title = cardTitle(turn);
  const lead = nodeOf(turn, "track") ?? turn.show.find((n) => nodeSound(turn, n) !== null);
  const leadSound = lead === undefined ? null : nodeSound(turn, lead);
  const notes = droppedWords(answer.dropped);
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
}

function Answer({ v, card, latest, onOpen, agentOpen, blocked, answer }: CardProps & { readonly answer: ParsedTurn }) {
  const { transport, session } = v;
  const turn = answer.turn;
  const desk = useMemo(() => cardPieces(session.turns, turn.id), [session.turns, turn.id]);
  const timeline = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({});

  const track = desk.track[0];
  const sections = desk.sections[0];
  const all = cardSound(v, desk);
  const mine = arrangementKeys(desk);
  const key = transport.sounding?.key ?? null;
  // This card's arrangement sounds: every part, one part, or the finished mix (not a candidate on its own, not a pull's side).
  const sounding = key !== null && transport.state === "playing" && mine.some((k) => key === k || key.startsWith(`${k}/`));
  const mixHref = track?.node.mix.href;
  const length = transport.duration;
  // The track's length, learned the first time it sounds (React's adjust-state-while-rendering pattern).
  if (mixHref !== undefined && length !== null && key !== null && measured[mixHref] === undefined && (key === mine[0] || (all !== null && key.startsWith(all.key)))) {
    setMeasured({ ...measured, [mixHref]: length });
  }
  const totalS = track?.node.lengthS ?? track?.node.mix.durationS ?? (mixHref === undefined ? undefined : measured[mixHref]) ?? null;
  const spans = sections === undefined ? null : sectionSpans(sections.node.rows, track?.node.bpm);
  const axis = sections === undefined ? null : deskAxis(sections.node.rows, spans, totalS);

  const hrefs = useMemo(() => [...(desk.track[0] === undefined ? [] : [desk.track[0].node.mix.href]), ...(desk.stems[0]?.node.rows.flatMap((r) => (r.audio === undefined ? [] : [r.audio.href])) ?? [])], [desk]);
  const { decode } = transport;
  useEffect(() => {
    if (hrefs.length > 0) decode(hrefs);
  }, [decode, hrefs]);

  usePlayhead(timeline, sounding, transport.position, transport.duration, transport.clock, axis?.audio ?? 1);

  const ctx: CardCtx = {
    v,
    turn,
    actions: turn.actions,
    latest,
    desk,
    axis,
    totalS,
    agentOpen,
    blocked,
    head: sounding ? fracAt(transport.clock, transport.duration) : null,
    slot: (kind, only) => drawKind(kind, ctx, only),
    ...cardPresses(v, desk, turn.id),
  };
  const title = cardTitle(turn);
  const notes = droppedWords(answer.dropped);
  const more = extras(ctx);
  const onCard = new Set(desk.stems[0]?.node.rows.map((r) => r.id) ?? []);
  const strip = desk.heard.length + desk.pull.length > 0;

  return (
    <article className={s.card} data-latest={latest || undefined} aria-label={`answer ${card.n}: ${title}`}>
      <header className={s.cardHead}>
        <span className={s.num}>{card.n}</span>
        <div className={s.headBody}>
          {card.ask !== null && (
            <p className={s.ask}>
              <span className={s.youSaid}>you said</span>
              {card.ask.text}
            </p>
          )}
          <p className={s.reply}>{turn.text}</p>
        </div>
        {!latest && <Button label="fold" size="sm" onPress={() => onOpen(false)} />}
      </header>
      {strip && (
        <section className={s.sentence} aria-label="what I heard">
          {ctx.slot("heard")}
          {ctx.slot("pull")}
        </section>
      )}
      {hasTimeline(desk) ? (
        <div ref={timeline} className={`${s.timeline} ${lanes.axis}`} style={{ "--desk-cols": axisTemplate(axis) } as CSSProperties} data-playing={sounding} data-compact={compactLanes(desk.stems[0]?.node.rows.length ?? 0) || undefined}>
          <TransportBar ctx={ctx} />
          {ctx.slot("sections")}
          {ctx.slot("track")}
          {ctx.slot("stems")}
          {ctx.slot("candidates", (c) => c.kind === "candidates" && !("stem" in c.for && onCard.has(c.for.stem)))}
        </div>
      ) : (
        !strip && desk.measures.length === 0 && <p className={s.working}>This answer is words only; nothing to play.</p>
      )}
      {desk.track.length === 0 && desk.measures.length > 0 && <div className={s.chips}>{ctx.slot("measures")}</div>}
      {(notes !== null || more.length > 0) && (
        <section className={s.notes} aria-label="notes on this answer">
          {notes !== null && <b className={s.noteHead}>{notes.summary}</b>}
          <ul className={s.noteList}>
            {[...(notes?.rows ?? []), ...more].map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
