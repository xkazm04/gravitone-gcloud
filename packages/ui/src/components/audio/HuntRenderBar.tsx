"use client";

// THE RENDER BAR - what "render the selection" will do, before anything is priced (./hunt.ts
// renderPlan): the leaves that render and the seconds of audio they ask for, the ones that go by
// hand, the ones already heard or in flight, the ones no engine here reaches. Its one act opens
// the receipt (the island's), which prices those seconds; nothing spends from this bar.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { Tally } from "../tally/Tally.tsx";
import type { RenderPlan } from "./hunt.ts";
import s from "./Hunt.module.css";

export type HuntRenderBarProps = {
  readonly plan: RenderPlan;
  readonly picked: number;
  readonly busy: boolean;
  /** Why a live render is refused here, when it is; the receipt still runs dry. */
  readonly liveBlock: string | null;
  readonly onRender: () => void;
  readonly onClear: () => void;
};

export function HuntRenderBar({ plan, picked, busy, liveBlock, onRender, onClear }: HuntRenderBarProps) {
  // Settled is two states: a leaf in flight has not been heard yet.
  const inFlight = plan.settled.filter((n) => n.state === "rendering").length;
  const heard = plan.settled.length - inFlight;
  return (
    <div className={s.bar} role="group" aria-label="render the selection">
      <Tally value={picked} label="picked" />
      <Chip label="render" value={plan.render.length} tone="cyan" />
      <Chip label="seconds" value={plan.seconds} tone="cyan" casing="lower" />
      {plan.byHand.length > 0 && <Chip label="by hand" value={plan.byHand.length} tone="amber" />}
      {heard > 0 && <Chip label="heard" value={heard} />}
      {inFlight > 0 && <Chip label="rendering" value={inFlight} tone="violet" />}
      {plan.unreachable.length > 0 && <Chip label="no engine" value={plan.unreachable.length} tone="rose" />}
      {liveBlock !== null && <Chip label="live" value="off" ghost name={`live off: ${liveBlock}`} />}
      <span className={s.barGrow} />
      <Button label="Clear" size="sm" disabled={picked === 0} onPress={onClear} />
      <Button label={busy ? "Rendering…" : "Render"} tone="emerald" disabled={busy || plan.render.length === 0} onPress={onRender} />
    </div>
  );
}
