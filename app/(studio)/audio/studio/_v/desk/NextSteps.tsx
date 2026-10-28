// THE DESK'S SIDE PANEL (spark audio-agent-studio, variant "desk"): the agent's proposed next steps
// as buttons that dispatch (each with its reason, and whether it plays here or asks the agent), and
// below them what works with no agent at all: play or stop the track, the finished mix, put the
// mix back as it was made. With the agent offline the panel keeps every local step working and
// says the asking ones wait. Nothing here runs because it rendered.
import type { StudioAction } from "@gt/domain/audio.studio";
import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import type { StemMix } from "@gt/ui/components/audio/mix.ts";
import { rowMix } from "@gt/ui/components/studio-desk/desk.ts";

import { soundOf } from "../../_host/press.ts";
import { deskSound, mixPlay, turnOf, type DeskCtx } from "./ctx.ts";
import s from "./side.module.css";

/** Is a local mix proposal already true of the mix (so the panel can say "on now"). */
function holds(a: StudioAction, mix: StemMix): boolean {
  if (a.kind === "mute") return (mix.muted === true) === a.on;
  if (a.kind === "solo") return (mix.solo === true) === a.on;
  if (a.kind === "level") return Math.abs((mix.levelDb ?? 0) - a.db) < 0.5;
  if (a.kind === "pan") return Math.abs((mix.pan ?? 0) - a.pan) < 0.05;
  return false;
}

export function NextSteps({ ctx }: { readonly ctx: DeskCtx }) {
  const { v, actions } = ctx;
  const { transport, dock } = v;
  const stems = ctx.desk.stems[0];
  const rowOf = (id: string) => stems?.node.rows.find((r) => r.id === id);
  const visible = turnOf(v, ctx.visibleId);
  const waitWords = dock.state === "offline" ? "waits: the agent is offline" : dock.state === "thinking" ? "waits: the agent is answering" : "asks the agent";
  return (
    <aside className={s.side} aria-label="next steps">
      <Panel title="next steps" tally={{ value: actions.length, label: "proposed" }}>
        {actions.length === 0 ? (
          <p className={s.empty}>The agent has nothing to suggest right now. Say what you want in the box below.</p>
        ) : (
          <ul className={s.list}>
            {actions.map((a) => {
              const local = STUDIO_ACTION_GOES[a.kind] === "local";
              const stemId = a.kind === "mute" || a.kind === "solo" || a.kind === "level" || a.kind === "pan" ? a.stem : undefined;
              const stem = stemId === undefined ? undefined : rowOf(stemId);
              const on = stemId !== undefined && holds(a, transport.mixOf(stemId, stem === undefined ? undefined : rowMix(stem)));
              const sound = (a.kind === "play" || a.kind === "hear") && visible !== undefined ? soundOf(visible, a) : null;
              const playing = sound !== null && transport.stateOf(sound.key) !== "idle";
              return (
                <li key={a.id} className={s.step} data-goes={local ? "local" : "agent"}>
                  <Button label={playing ? `stop: ${a.label}` : a.label} tone={local ? "neutral" : "cyan"} disabled={!local && !ctx.agentOpen} onPress={() => ctx.press(a)} />
                  {on && <Chip label="on now" tone="emerald" casing="lower" />}
                  <span className={s.why}>
                    {a.why !== undefined && <span>{a.why}</span>}
                    <span className={s.goes}>{local ? (stem !== undefined && stem.audio === undefined ? "changes a planned part here" : "plays here, nothing is sent") : waitWords}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="without the agent">
        <Local ctx={ctx} />
      </Panel>
    </aside>
  );
}

function Local({ ctx }: { readonly ctx: DeskCtx }) {
  const { transport } = ctx.v;
  const all = deskSound(ctx.v, ctx.desk);
  const mix = mixPlay(ctx.desk);
  const sounding = transport.state !== "idle";
  const allOn = all !== null && transport.stateOf(all.key) !== "idle";
  const mixT = mix === null ? undefined : turnOf(ctx.v, mix.turnId);
  const mixSound = mix === null || mixT === undefined ? null : (mix.a.kind === "play" ? soundOf(mixT, mix.a) : null);
  const mixOn = mixSound !== null && transport.stateOf(mixSound.key) !== "idle";
  return (
    <ul className={s.list}>
      <li className={s.step}>
        <Button label={allOn ? "stop the track" : "play the track"} disabled={all === null} onPress={() => (allOn ? transport.stop() : ctx.playFrom(0))} />
        <span className={s.why}>
          <span className={s.goes}>{all === null ? "nothing to play yet" : "every part together, so the lane controls are heard"}</span>
        </span>
      </li>
      <li className={s.step}>
        <Button label={mixOn ? "stop the finished mix" : "play the finished mix"} disabled={mix === null} onPress={() => mix !== null && ctx.press(mix.a, mix.turnId)} />
        <span className={s.why}>
          <span className={s.goes}>the track exactly as the agent made it</span>
        </span>
      </li>
      <li className={s.step}>
        <Button label="put the mix back" onPress={transport.resetMix} />
        <span className={s.why}>
          <span className={s.goes}>undo every mute, volume and left or right change</span>
        </span>
      </li>
      <li className={s.step}>
        <Button label="stop everything" disabled={!sounding} onPress={transport.stop} />
      </li>
    </ul>
  );
}
