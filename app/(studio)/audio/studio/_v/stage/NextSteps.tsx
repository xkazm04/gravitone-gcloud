// THE SIDE PANEL (variant "stage"): the agent's proposed next steps, each a button that dispatches,
// with the agent's `why` and, under it, what the press will actually do, read from the action itself.
// Below them the steps that need no agent (play or stop the band, everyone back on stage), so the
// panel still works with no agent listening; then the backstage notes: what could not be shown.
import type { StudioAction, StudioDropped } from "@gt/domain/audio.studio";
import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import { disarmed, meaning, type StageCtx } from "./ctx.ts";
import s from "./stage.module.css";

export type NextStepsProps = {
  readonly ctx: StageCtx | null;
  readonly actions: readonly StudioAction[];
  readonly offline: boolean;
  readonly thinking: boolean;
  /** Play or stop the band (null when nothing can play). */
  readonly onBand: (() => void) | null;
  /** Everyone back on stage, as recorded (null when nobody was changed). */
  readonly onReset: (() => void) | null;
  readonly dropped: readonly StudioDropped[];
  readonly missing: boolean;
  /** A proposal pressed (the variant's press, which may start the band for a mixer step). */
  readonly onStep: (a: StudioAction) => void;
};

export function NextSteps({ ctx, actions, offline, thinking, onBand, onReset, dropped, missing, onStep }: NextStepsProps) {
  const sounding = ctx?.transport.sounding ?? null;
  return (
    <aside className={s.side} aria-label="next steps">
      <CapsHeading text="next steps" tally={{ value: actions.length, label: "proposed" }} />
      {offline && <Chip label="no agent listening" tone="amber" casing="lower" dot />}
      {thinking && <Chip label="the agent is thinking" tone="violet" casing="lower" dot />}
      {actions.length === 0 ? (
        <p className={s.sideQuiet}>{offline ? "No agent is listening, so nothing new is proposed." : "The agent has not proposed anything yet."}</p>
      ) : (
        <ol className={s.steps}>
          {actions.map((a) => {
            const why = disarmed(a, offline, thinking);
            const toAgent = STUDIO_ACTION_GOES[a.kind] === "agent";
            return (
              <li key={a.id} className={s.step} data-goes={toAgent ? "agent" : "here"}>
                <Button label={a.label} tone={toAgent ? "cyan" : "neutral"} disabled={why !== null} onPress={() => onStep(a)} />
                {a.why !== undefined && <span className={s.stepWhy}>{`why: ${a.why}`}</span>}
                <span className={s.stepDoes}>{why ?? meaning(a)}</span>
              </li>
            );
          })}
        </ol>
      )}
      <CapsHeading text="on stage" />
      <div className={s.stateActs}>
        <Button label={sounding === null ? "Play the band" : "Stop"} tone={sounding === null ? "emerald" : "neutral"} disabled={sounding === null && onBand === null} onPress={() => (sounding === null ? onBand?.() : ctx?.transport.stop())} />
        {onReset !== null && <Button label="Everyone back on stage" size="sm" onPress={onReset} />}
      </div>
      {(dropped.length > 0 || missing) && (
        <>
          <CapsHeading text="backstage notes" tally={{ value: dropped.length + (missing ? 1 : 0), label: "notes" }} />
          <ul className={s.backstage}>
            {missing && <li>Some recordings are missing from this machine, so some players cannot be heard.</li>}
            {dropped.map((d) => (
              <li key={`${d.at}|${d.reason}`}>
                <b>{`${d.at.startsWith("actions") ? "a proposed step" : "a piece"}${d.kind === "?" ? "" : ` ("${d.kind}")`}`}</b>
                {` could not be shown: ${d.reason}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
