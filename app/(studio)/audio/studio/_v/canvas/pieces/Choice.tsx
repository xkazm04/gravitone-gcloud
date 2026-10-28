"use client";

// THE TWO-WAY CHOICES (canvas, WP3): a duel (two whole takes, say which is better) and a pull (two
// wishes that pull apart, lean one way), each an inline card inside its turn's card, each side its
// own play mark. The host's vocabulary plays only a duel's side A by action, so side B and a pull's
// sides play through the page's one transport under their own part keys (./live.ts hrefPart).
// The verdict buttons ask the agent; they send the turn's own proposal when it made one.
// Degraded: a pull side with no audio reads "nothing to hear for this side", and every verdict is
// disarmed with its reason while no agent can answer.
import type { StudioAction } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import { localPlay, soundKey } from "../../../_host/press.ts";
import { hrefPart } from "../live.ts";
import type { PieceProps } from "../registry.tsx";
import s from "./shelf.module.css";

export function Duel({ node, ctx }: PieceProps<"duel">) {
  const { turn, transport } = ctx;
  const pick = (side: "a" | "b"): StudioAction =>
    turn.actions.find((a) => a.kind === "pick" && a.node === node.id && a.side === side) ?? { id: `ask.pick.${node.id}.${side}`, kind: "pick", label: `prefer ${side.toUpperCase()}`, node: node.id, side };
  const b = hrefPart(turn.id, node.id, "b", node.b.audio.href, node.b.label);
  const sides = [
    { side: "a" as const, letter: "A", label: node.a.label, key: soundKey(turn.id, node.id, "a"), play: () => ctx.press(localPlay(node.id)) },
    { side: "b" as const, letter: "B", label: node.b.label, key: b.key, play: () => b.toggle(transport) },
  ];
  return (
    <section className={s.choice} aria-label={node.question} data-provisional={node.source === "illustrative" || undefined}>
      <header className={s.head}>
        <h4 className={s.title}>{node.title ?? `Which is better: ${node.question}`}</h4>
        {node.source !== undefined && <SourceTag kind={node.source} />}
        <p className={s.how}>{"Both play the whole song; only one thing differs."}</p>
      </header>
      <div className={s.pads}>
        {sides.map((x) => {
          const st = transport.stateOf(x.key);
          return (
            <div key={x.side} className={s.pad} data-sounding={st !== "idle" || undefined}>
              <EarButton big state={st} name={`version ${x.letter}, ${x.label}`} onPress={x.play} />
              <span className={s.padWords}>
                <b className={s.letter}>{x.letter}</b>
                <span className={s.name}>{x.label}</span>
              </span>
              <Button label={`${x.letter} is better`} size="sm" tone="cyan" disabled={ctx.askBlocked !== null} onPress={() => ctx.press(pick(x.side))} />
            </div>
          );
        })}
      </div>
      {ctx.askBlocked !== null && <p className={s.quiet}>{ctx.askBlocked}</p>}
    </section>
  );
}

export function Pull({ node, ctx }: PieceProps<"pull">) {
  const { turn, transport } = ctx;
  const settle = (side: 0 | 1): StudioAction =>
    turn.actions.find((a) => a.kind === "settle_pull" && a.node === node.id && a.side === side) ?? {
      id: `ask.settle.${node.id}.${side}`,
      kind: "settle_pull",
      label: `lean ${node.sides[side].label}`,
      node: node.id,
      side,
    };
  return (
    <section className={s.choice} aria-label={node.question} data-provisional={node.source === "illustrative" || undefined}>
      <header className={s.head}>
        <h4 className={s.title}>{node.title ?? `Your words pull two ways: ${node.question}`}</h4>
        {node.source !== undefined && <SourceTag kind={node.source} />}
        <p className={s.how}>{"Hear what each way sounds like, then pick the one to lean into."}</p>
      </header>
      <div className={s.pads}>
        {node.sides.map((side, i) => {
          const idx = i === 0 ? 0 : 1;
          const part = side.audio === undefined ? null : hrefPart(turn.id, node.id, `side${idx}`, side.audio.href, `${side.label}: ${side.says}`);
          const st = part === null ? "idle" : transport.stateOf(part.key);
          return (
            <div key={side.label} className={s.pad} data-sounding={st !== "idle" || undefined}>
              {part === null ? <span className={s.noEar} aria-hidden="true" /> : <EarButton big state={st} name={`the ${side.label} way`} onPress={() => part.toggle(transport)} />}
              <span className={s.padWords}>
                <b className={s.name}>{side.label}</b>
                <span className={s.says}>{side.says}</span>
                {part === null && <span className={s.quiet}>nothing to hear for this side</span>}
              </span>
              <Button label={`lean ${side.label}`} size="sm" tone="cyan" disabled={ctx.askBlocked !== null} onPress={() => ctx.press(settle(idx))} />
            </div>
          );
        })}
      </div>
      {ctx.askBlocked !== null && <p className={s.quiet}>{ctx.askBlocked}</p>}
    </section>
  );
}
