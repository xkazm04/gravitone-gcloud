"use client";

// THE AUDIO STUDIO'S ONE VIEW (spark audio-agent-studio, stage S2; owner's pick at the S1 gate:
// "Canvas layout, but use Desk component design and style"). Canvas's frame: one result card per
// agent answer, newest at the bottom and scrolled to when it lands; older cards fold to a playable
// one-line strip and open again in place; a versions rail on the left jumps between answers; the
// right panel holds the agent's next steps for the newest card and what always works. Inside each
// card, desk's pieces in desk's style (./Card.tsx). Everything arrives through VariantProps; nothing
// here reads app state, and nothing runs because it rendered.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VariantProps } from "../_host/types.ts";
import { Card } from "./Card.tsx";
import { askBlockedWords, cardsOf } from "./model.ts";
import { NextSteps, Rail } from "./Side.tsx";
import s from "./view.module.css";

const reducedMotion = (): boolean => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function View(v: VariantProps) {
  const { session, dock, dispatch, transport } = v;
  const cards = useMemo(() => cardsOf(session.turns), [session.turns]);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const nodes = useRef(new Map<string, HTMLElement>());
  const lastKey = cards[cards.length - 1]?.key;
  // The newest ANSWERED card stays open (and speaks for the panel) while the next ask is on its way.
  const answeredKey = [...cards].reverse().find((c) => c.answer !== null)?.key;
  const seen = useRef<string | undefined>(lastKey);

  const scrollTo = useCallback((key: string): void => {
    nodes.current.get(key)?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  }, []);

  // A new card (an ask on its way, then its answer) is scrolled to; the first paint is left alone.
  useEffect(() => {
    if (lastKey === undefined || seen.current === lastKey) return;
    seen.current = lastKey;
    scrollTo(lastKey);
  }, [lastKey, scrollTo]);

  const setOpen = (key: string, open: boolean): void =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  const jump = (key: string): void => {
    setOpen(key, true);
    requestAnimationFrame(() => scrollTo(key));
  };

  const blocked = askBlockedWords(dock.state, dock.presence);

  if (cards.length === 0) return <p className={s.quiet}>The agent has not answered yet. Say what you would like to hear below.</p>;
  return (
    <div className={s.view} data-view="studio">
      <Rail cards={cards} latestKey={answeredKey} transport={transport} dispatch={dispatch} onJump={jump} />
      <div className={s.stack} aria-label="answers, oldest first">
        {cards.map((c) => (
          <div
            key={c.key}
            className={s.cardSlot}
            ref={(el) => {
              if (el === null) nodes.current.delete(c.key);
              else nodes.current.set(c.key, el);
            }}
          >
            <Card v={v} card={c} latest={c.key === answeredKey} open={c.key === answeredKey || c.key === lastKey || opened.has(c.key)} onOpen={(open) => setOpen(c.key, open)} agentOpen={blocked === null} blocked={blocked} />
          </div>
        ))}
      </div>
      <NextSteps visible={session.visible} turns={session.turns} transport={transport} dispatch={dispatch} blocked={blocked} offline={dock.state === "offline" ? dock.presence : null} />
    </div>
  );
}
