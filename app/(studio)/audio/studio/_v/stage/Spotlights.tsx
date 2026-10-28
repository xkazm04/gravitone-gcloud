// TWO SPOTLIGHTS (variant "stage", kind `duel`): the same song two ways, A and B, each under its own
// light with its own play mark. The light that is sounding burns brighter. Picking one is the agent's
// own proposal for that side; with none offered, the card says so and offers nothing.
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import { localPlay, soundKey } from "../../_host/press.ts";
import { disarmed, proposalsAt, type StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

export function Spotlights({ node, ctx }: { readonly node: StudioNodeOf<"duel">; readonly ctx: StageCtx }) {
  const { turn, transport } = ctx;
  const picks = proposalsAt(turn, node.id);
  const sides = [
    { side: "a" as const, ...node.a },
    { side: "b" as const, ...node.b },
  ];
  return (
    <section className={s.duel} aria-label={`two spotlights: ${node.question}`}>
      <span className={s.duelHead}>
        <b className={s.question}>{node.question}</b>
        {node.source !== undefined && <SourceTag kind={node.source} />}
      </span>
      <div className={s.lamps}>
        {sides.map((x) => {
          const key = soundKey(turn.id, node.id, x.side);
          const state = transport.stateOf(key);
          const pick = picks.find((a) => a.kind === "pick" && a.side === x.side);
          const why = pick === undefined ? null : disarmed(pick, ctx.offline, ctx.thinking);
          const play = (): void => (x.side === "a" ? ctx.press(localPlay(node.id)) : transport.toggle(key, [{ id: "b", href: x.audio.href }], { name: x.label }));
          return (
            <div key={x.side} className={s.lamp} data-on={state !== "idle" || undefined}>
              <span className={s.beam} aria-hidden="true" />
              <span className={s.lampSide}>{x.side.toUpperCase()}</span>
              <EarButton state={state} name={`side ${x.side.toUpperCase()}, ${x.label}`} onPress={play} big />
              <b className={s.lampLabel}>{x.label}</b>
              {pick !== undefined ? <Button label={pick.label} tone="cyan" size="sm" disabled={why !== null} onPress={() => ctx.press(pick)} /> : <span className={s.cardQuiet}>no pick offered for this side</span>}
              {why !== null && <span className={s.cardQuiet}>{why}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
