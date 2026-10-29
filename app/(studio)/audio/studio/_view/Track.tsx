// A CARD'S MASTER LANE (spark audio-agent-studio, stage S2; desk's pieces inside canvas's card): the
// transport across the top (play every part / stop, where it is, seek), the duel as an A/B switch on
// that transport (switching keeps the second you are at), and the track itself as the first lane:
// its title, tempo, key and length in words, the finished mix's own play mark, the measures as
// chips, the mix's waveform. A track answering a Suno prompt says so (a sketch of it, or its take a /
// b); the person's uploaded take carries its measured and heard facts as a row under the lane.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";
import { clockOf } from "@gt/ui/components/audio/mix.ts";
import { deskAct, proposal, type Placed } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound, soundKey } from "../_host/press.ts";
import { cardSound, turnOf, type CardCtx } from "./ctx.ts";
import { LaneBody, PEAKS } from "./Lanes.tsx";
import { AnswersChip, TakeRow } from "./Suno.tsx";
import lanes from "./lanes.module.css";
import s from "./master.module.css";

/** The transport bar: plays every part (so the lanes' controls are heard live), the duel's switch beside it. */
export function TransportBar({ ctx }: { readonly ctx: CardCtx }) {
  const { transport } = ctx.v;
  const all = cardSound(ctx.v, ctx.desk);
  return (
    <div className={s.bar}>
      <TransportRow
        name={transport.sounding?.name ?? all?.name ?? "the track"}
        state={transport.state}
        clock={transport.clock}
        duration={transport.duration}
        failed={transport.failed}
        onToggle={() => (transport.state === "idle" ? ctx.playFrom(0) : transport.stop())}
        onSeek={transport.seek}
        onStop={transport.stop}
      />
      {ctx.slot("duel")}
    </div>
  );
}

const keyWords = (key: string): string => (/minor/i.test(key) ? `${key}, moody` : /major/i.test(key) ? `${key}, bright` : key);

/** The track kind: the master lane. */
export function TrackLane({ placed, ctx }: { readonly placed: Placed<"track">; readonly ctx: CardCtx }) {
  const { node, turnId } = placed;
  const { transport } = ctx.v;
  const t = turnOf(ctx.v, turnId);
  const snd = t === undefined ? null : nodeSound(t, node);
  const length = node.lengthS ?? node.mix.durationS;
  const facts = [node.bpm === undefined ? null : `${node.bpm} beats a minute`, node.key === undefined ? null : keyWords(node.key), length === undefined ? null : `${clockOf(length)} long`].filter((x) => x !== null);
  return (
    <>
      <div className={`${lanes.lane} ${s.master}`} data-row="master">
        <div className={s.head}>
          <div className={s.top}>
            {snd !== null && <EarButton state={transport.stateOf(snd.key)} name={`${node.title ?? "the track"}, the finished mix`} onPress={() => ctx.press(localPlay(node.id), turnId)} big />}
            <span className={s.words}>
              <b className={s.title}>{node.title ?? "the track"}</b>
              <span className={s.facts}>{facts.length === 0 ? "the finished mix" : `the finished mix · ${facts.join(" · ")}`}</span>
            </span>
            {node.source !== undefined && <SourceTag kind={node.source} />}
          </div>
          <div className={s.chips}>
            <AnswersChip node={node} />
            {ctx.slot("measures")}
          </div>
          {placed.carried && <span className={s.hint}>from an earlier answer</span>}
        </div>
        <LaneBody ctx={ctx} peaks={transport.peaks(node.mix.href, PEAKS)} tone="cyan" note={ctx.v.renders === "missing" ? "the sound is not in the store" : "drawing the waveform"} markEnd />
      </div>
      {/* The take's facts stand on the card that brought the take; a later card carrying the track only marks it. */}
      {!placed.carried && <TakeRow node={node} ctx={ctx} />}
    </>
  );
}

/** No track on the card yet. */
export function MasterAbsent() {
  return <p className={s.absent}>No track yet. The first answer that makes one puts it here, with every part beneath it.</p>;
}

/** The duel kind: an A/B switch on the transport, and the pick that tells the agent. */
export function DuelSwitch({ placed, ctx }: { readonly placed: Placed<"duel">; readonly ctx: CardCtx }) {
  const { node, turnId } = placed;
  const { transport } = ctx.v;
  const sides = [
    { side: "a" as const, letter: "A", ...node.a },
    { side: "b" as const, letter: "B", ...node.b },
  ];
  const keyOf = (side: "a" | "b"): string => soundKey(turnId, node.id, side);
  const playing = transport.state !== "idle";
  return (
    <div className={s.duel} role="group" aria-label={`compare: ${node.question}`}>
      <span className={s.question}>{node.question}</span>
      <div className={s.ab}>
        {sides.map((x) => {
          const on = transport.sounding?.key === keyOf(x.side) && playing;
          return (
            <button
              key={x.side}
              type="button"
              className={s.side}
              aria-pressed={on}
              aria-label={`${x.letter}: ${x.label}`}
              onClick={() => (on ? transport.stop() : transport.play(keyOf(x.side), [{ id: x.side, href: x.audio.href }], { from: playing ? transport.position() : 0, name: `${x.letter}: ${x.label}` }))}
            >
              <b className={s.letter}>{x.letter}</b>
              {x.label}
            </button>
          );
        })}
      </div>
      <div className={s.picks}>
        {sides.map((x) => {
          const a = proposal(ctx.actions, "pick", (p) => p.node === node.id && p.side === x.side) ?? deskAct.pick(node.id, x.side, `${x.letter} is better`);
          return <Button key={x.side} label={a.label} size="sm" tone="cyan" disabled={!ctx.agentOpen} onPress={() => ctx.press(a, turnId)} />;
        })}
      </div>
      {node.source !== undefined && <SourceTag kind={node.source} />}
      {!ctx.agentOpen && ctx.blocked !== null && <span className={s.hint}>{ctx.blocked}</span>}
    </div>
  );
}

const TONE = { ok: "emerald", warn: "amber", bad: "rose" } as const;

/** The measures kind: chips in the master lane. */
export function MeasureChips({ placed }: { readonly placed: Placed<"measures">; readonly ctx: CardCtx }) {
  const { node } = placed;
  return (
    <>
      {node.rows.map((r) => (
        <Chip key={r.label} label={r.label} value={r.value} tone={r.tone === undefined ? "neutral" : TONE[r.tone]} casing="lower" />
      ))}
      {node.source !== undefined && <SourceTag kind={node.source} />}
    </>
  );
}
