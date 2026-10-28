"use client";

// THE CONVERSATION CANVAS (spark audio-agent-studio WP3): a chat that produces music. The main frame
// is a stack of result cards, one per agent answer, newest at the bottom and scrolled to when it
// lands; older cards fold to a one-line strip with a play mark (a playable history of versions) and
// open again in place. The newest card is large: its take as a hero player, its sections as a thin
// band under the waveform, its parts as compact rows, its choices (instrument shelf, duel, pull) as
// inline cards, the person's words as its header and what was measured as its footer. A versions
// rail on the left jumps between answers; the panel on the right holds what sounds now, the agent's
// next steps for the newest card and the presses that need no agent. Everything arrives through
// VariantProps; nothing here reads app state, and nothing runs because it rendered.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VariantProps } from "../../_host/types.ts";
import { Card } from "./Card.tsx";
import { useReducedMotion } from "./live.ts";
import { cardsOf } from "./model.ts";
import { NextSteps, Rail } from "./Side.tsx";
import s from "./canvas.module.css";

export function Variant({ session, dock, dispatch, transport, renders }: VariantProps) {
  const cards = useMemo(() => cardsOf(session.turns), [session.turns]);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const nodes = useRef(new Map<string, HTMLElement>());
  const reduced = useReducedMotion();
  const lastKey = cards[cards.length - 1]?.key;
  // The newest ANSWERED card stays open (and speaks for the panel) while the next ask is on its way.
  const answeredKey = [...cards].reverse().find((c) => c.answer !== null)?.key;
  const seen = useRef<string | undefined>(lastKey);

  const scrollTo = useCallback(
    (key: string): void => {
      nodes.current.get(key)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [reduced],
  );

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

  const askBlocked = dock.state === "offline" ? "No agent is listening, so this cannot be sent." : dock.state === "thinking" ? "Wait for the agent to finish the last ask." : null;

  if (cards.length === 0) return <p className={s.quiet}>The agent has not answered yet. Say what you would like to hear below.</p>;
  return (
    <div className={s.canvas} data-variant="canvas">
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
            <Card
              card={c}
              latest={c.key === answeredKey}
              open={c.key === answeredKey || c.key === lastKey || opened.has(c.key)}
              onOpen={(open) => setOpen(c.key, open)}
              turns={session.turns}
              transport={transport}
              dispatch={dispatch}
              askBlocked={askBlocked}
              renders={renders}
              thinking={dock.state === "thinking"}
            />
          </div>
        ))}
      </div>
      <NextSteps visible={session.visible} turns={session.turns} transport={transport} dispatch={dispatch} askBlocked={askBlocked} offline={dock.state === "offline"} />
    </div>
  );
}
