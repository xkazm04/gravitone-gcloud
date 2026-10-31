// A CARD'S SENTENCE STRIP (spark audio-agent-studio, stage S2; desk's strip inside canvas's card):
// what the agent heard, in the person's own words, each linked phrase underlined with what it became
// written under it; words it did not use struck through and said; and a pull (two wishes that
// disagree) as two playable sides, each with what it would do and a "lean this way" that asks the
// agent. A side with no audio says so instead of a play mark.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { deskAct, proposal, sentencePieces, type Placed } from "@gt/ui/components/studio-desk/desk.ts";

import { soundKey } from "../_host/press.ts";
import type { CardCtx } from "./ctx.ts";
import s from "./strip.module.css";

/** The heard kind: the sentence with its links. */
export function HeardLine({ placed }: { readonly placed: Placed<"heard">; readonly ctx: CardCtx }) {
  const { node } = placed;
  const { pieces, loose } = sentencePieces(node.sentence, node.links, node.unheard ?? []);
  const unused = (node.unheard ?? []).filter((u) => !pieces.some((p) => p.unheard === true && p.text.toLowerCase() === u.toLowerCase()));
  return (
    <div className={s.heard} data-carried={placed.carried || undefined}>
      <span className={s.kicker}>{placed.carried ? "what I heard, from an earlier answer" : "what I heard"}</span>
      <p className={s.sentence}>
        {pieces.map((p, i) =>
          p.to !== undefined ? (
            <ruby key={i} className={s.link}>
              {p.text}
              <rt className={s.became}>{p.to}</rt>
            </ruby>
          ) : p.unheard === true ? (
            <s key={i} className={s.unheard} title="not used">
              {p.text}
            </s>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </p>
      {(loose.length > 0 || unused.length > 0) && (
        <div className={s.extra}>
          {loose.map((l) => (
            <Chip key={l.words} label={`${l.words} became ${l.to}`} casing="lower" />
          ))}
          {unused.length > 0 && <span className={s.meta}>{`not used: ${unused.join(", ")}`}</span>}
        </div>
      )}
      {(node.unheard ?? []).length > 0 && unused.length === 0 && <span className={s.meta}>struck words were not used</span>}
      {node.source !== undefined && <SourceTag kind={node.source} />}
    </div>
  );
}

/** The pull kind: two sides to hear and lean toward. */
export function PullSides({ placed, ctx }: { readonly placed: Placed<"pull">; readonly ctx: CardCtx }) {
  const { node, turnId } = placed;
  const { transport } = ctx.v;
  return (
    <div className={s.pull} role="group" aria-label={node.question}>
      <span className={s.kicker}>{`two wishes pull apart: ${node.question}`}</span>
      <div className={s.sides}>
        {node.sides.map((side, i) => {
          const idx = i === 0 ? 0 : 1;
          const key = soundKey(turnId, node.id, `side${idx}`);
          const a = proposal(ctx.actions, "settle_pull", (p) => p.node === node.id && p.side === idx) ?? deskAct.settle(node.id, idx, `lean ${side.label}`);
          return (
            <div key={side.label} className={s.side}>
              {side.audio === undefined ? (
                <span className={s.noSound} title="nothing to hear for this side" />
              ) : (
                <EarButton state={transport.stateOf(key)} name={`how ${side.label} sounds`} onPress={() => side.audio !== undefined && transport.toggle(key, [{ id: `side${idx}`, href: side.audio.href }], { name: `how ${side.label} sounds` })} big />
              )}
              <span className={s.sideWords}>
                <b className={s.sideName}>{side.label}</b>
                <span className={s.meta}>{side.audio === undefined ? `${side.says} (nothing to hear for this side)` : side.says}</span>
              </span>
              <Button label={a.label} size="sm" tone="cyan" disabled={!ctx.agentOpen} onPress={() => ctx.press(a, turnId)} />
            </div>
          );
        })}
      </div>
      {!ctx.agentOpen && ctx.blocked !== null && <span className={s.meta}>{ctx.blocked}</span>}
      {node.source !== undefined && <SourceTag kind={node.source} />}
    </div>
  );
}
