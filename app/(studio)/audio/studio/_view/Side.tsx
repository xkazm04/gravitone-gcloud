"use client";

// THE STUDIO VIEW'S SIDE PANELS (spark audio-agent-studio, stage S2: canvas's places, desk's style).
// Left: the versions rail - every answer in order, its take's play mark and its name; pressing a name
// opens that card and scrolls to it. Right: the agent's next steps for the newest card - each a press
// that DISPATCHES, with its `why`, whether it plays here or asks the agent, and, derived from the
// resolved action, what pressing it does (registry action-consent-wiring) - and what works with no
// agent at all: play or stop the newest take, every part with my changes, stop, put the mix back.
import type { ReactNode } from "react";

import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import type { StudioAction, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { Panel } from "@gt/ui/components/panel/Panel.tsx";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";
import { rowMix } from "@gt/ui/components/studio-desk/desk.ts";

import { localPlay, nodeSound, soundKey, soundOf } from "../_host/press.ts";
import type { Dispatch } from "../_host/types.ts";
import { cardTitle, doesWords, nodeOf, resolverOf, stemLabel, type CardModel } from "./model.ts";
import s from "./side.module.css";

export function Rail({ cards, latestKey, transport, dispatch, onJump }: { readonly cards: readonly CardModel[]; readonly latestKey: string | undefined; readonly transport: MixTransport; readonly dispatch: Dispatch; readonly onJump: (key: string) => void }) {
  return (
    <nav className={s.rail} aria-label="versions">
      <CapsHeading text="versions" tally={{ value: cards.filter((c) => c.answer !== null).length, label: "answers" }} />
      <ol className={s.railList}>
        {cards.map((c) => {
          const turn = c.answer?.turn;
          const track = turn === undefined ? undefined : nodeOf(turn, "track");
          const snd = turn === undefined || track === undefined ? null : nodeSound(turn, track);
          return (
            <li key={c.key} className={s.railItem} aria-current={c.key === latestKey ? "step" : undefined}>
              {snd !== null && turn !== undefined && track !== undefined ? (
                <EarButton state={transport.stateOf(snd.key)} name={`version ${c.n}, ${snd.name}`} onPress={() => dispatch(localPlay(track.id), turn.id)} />
              ) : (
                <span className={s.noEar} aria-hidden="true" />
              )}
              <button type="button" className={s.railJump} onClick={() => onJump(c.key)}>
                <span className={s.num}>{c.n}</span>
                <span className={s.railTitle}>{turn === undefined ? "on its way..." : cardTitle(turn)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type NextProps = {
  readonly visible: ParsedTurn | null;
  readonly turns: readonly ParsedTurn[];
  readonly transport: MixTransport;
  readonly dispatch: Dispatch;
  readonly blocked: string | null;
  /** The dock reads offline: "listening" = the offline preview (asks refused), "nobody" = no agent has looked yet (asks wait). */
  readonly offline: "listening" | "nobody" | null;
  /** Spark suno-advisor: the confirmed taste profile, between the next steps and what always works. */
  readonly taste?: ReactNode;
};

/** Is a local proposal already in effect (its sound playing, its mix setting already set). */
function inEffect(a: StudioAction, turn: StudioTurn, t: MixTransport, base: (stem: string) => ReturnType<typeof rowMix> | undefined): boolean {
  if (a.kind === "play" || a.kind === "hear") {
    const snd = soundOf(turn, a);
    return snd !== null && t.stateOf(snd.key) !== "idle";
  }
  if (a.kind !== "mute" && a.kind !== "solo" && a.kind !== "level" && a.kind !== "pan") return false;
  const mix = t.mixOf(a.stem, base(a.stem));
  if (a.kind === "mute") return (mix.muted === true) === a.on;
  if (a.kind === "solo") return (mix.solo === true) === a.on;
  if (a.kind === "level") return Math.abs((mix.levelDb ?? 0) - a.db) < 0.5;
  return Math.abs((mix.pan ?? 0) - a.pan) < 0.05;
}

/** The newest turn holding a piece of this kind (the newest card may only offer choices). */
function newestWith(turns: readonly ParsedTurn[], kind: "track" | "stems"): { readonly turn: StudioTurn; readonly id: string } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    const n = t === undefined ? undefined : nodeOf(t, kind);
    if (t !== undefined && n !== undefined) return { turn: t, id: n.id };
  }
  return null;
}

export function NextSteps({ visible, turns, transport, dispatch, blocked, offline, taste }: NextProps) {
  const turn = visible?.turn ?? null;
  const take = newestWith(turns, "track");
  const parts = newestWith(turns, "stems");
  const takeKey = take === null ? null : soundKey(take.turn.id, take.id);
  const partsKey = parts === null ? null : soundKey(parts.turn.id, parts.id);
  const stemsNode = parts === null ? undefined : nodeOf(parts.turn, "stems");
  const base = (id: string) => {
    const r = stemsNode?.rows.find((x) => x.id === id);
    return r === undefined ? undefined : rowMix(r);
  };
  const resolve = turn === null ? null : resolverOf(turn, (id) => stemLabel(turns, turn.id, id));
  const candidateName = (node: string, id: string): string | null => {
    const n = turn?.show.find((x) => x.id === node);
    return n?.kind === "candidates" ? (n.rows.find((r) => r.id === id)?.name ?? null) : null;
  };
  const actions = turn?.actions ?? [];
  return (
    <aside className={s.side} aria-label="next steps">
      <Panel title="next steps" tally={{ value: actions.length, label: "suggested" }}>
        {offline !== null && <p className={s.offline}>{offline === "nobody" ? "No agent is listening yet. An ask waits until it looks; everything that plays or mixes here works now." : "No agent is listening. Everything that plays or mixes here still works; the asks wait."}</p>}
        {turn === null || actions.length === 0 ? (
          <p className={s.empty}>{turn === null ? "The agent has not answered yet." : "The agent suggested nothing this time; say what you want below."}</p>
        ) : (
          <ul className={s.list}>
            {actions.map((a) => {
              const toAgent = STUDIO_ACTION_GOES[a.kind] === "agent";
              const stop = toAgent ? blocked : null;
              const on = !toAgent && inEffect(a, turn, transport, base);
              const playing = on && (a.kind === "play" || a.kind === "hear");
              return (
                <li key={a.id} className={s.step} data-goes={toAgent ? "agent" : "local"}>
                  <Button label={playing ? `stop: ${a.label}` : a.label} size="sm" tone={toAgent ? "cyan" : "neutral"} disabled={stop !== null} onPress={() => dispatch(a)} />
                  <Chip label={on ? "on now" : toAgent ? "asks the agent" : "plays here"} casing="lower" ghost={!toAgent && !on} {...(on ? { tone: "emerald" as const, dot: true } : {})} />
                  <span className={s.why}>
                    {a.why !== undefined && <span>{a.why}</span>}
                    {resolve !== null && <span className={s.goes}>{doesWords(a, resolve, candidateName)}</span>}
                    {stop !== null && <span className={s.goes}>{stop}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {taste}
      <Panel title="always here">
        <ul className={s.list}>
          <li className={s.step}>
            <Button label={takeKey !== null && transport.stateOf(takeKey) !== "idle" ? "stop the newest take" : "play the newest take"} size="sm" disabled={take === null} onPress={() => take !== null && dispatch(localPlay(take.id), take.turn.id)} />
            <span className={s.why}>
              <span className={s.goes}>{take === null ? "nothing to play yet" : "the track exactly as the agent made it"}</span>
            </span>
          </li>
          <li className={s.step}>
            <Button label={partsKey !== null && transport.stateOf(partsKey) !== "idle" ? "stop the parts" : "play every part, with my changes"} size="sm" disabled={parts === null} onPress={() => parts !== null && dispatch(localPlay(parts.id), parts.turn.id)} />
            <span className={s.why}>
              <span className={s.goes}>so every mute, volume and left or right change is heard</span>
            </span>
          </li>
          <li className={s.step}>
            <Button label="put the mix back" size="sm" onPress={transport.resetMix} />
            <span className={s.why}>
              <span className={s.goes}>undo every mute, volume and left or right change</span>
            </span>
          </li>
          <li className={s.step}>
            <Button label="stop everything" size="sm" disabled={transport.state === "idle"} onPress={transport.stop} />
          </li>
        </ul>
      </Panel>
    </aside>
  );
}
