"use client";

// THE CANVAS'S SIDE PANELS (WP3). Left: the versions rail - every answer in order, its take's play
// mark and its name; pressing a name opens that card and scrolls to it. Right: what sounds now (the
// kit's transport row), the agent's next steps for the newest card - each a press that DISPATCHES,
// with its `why` and, derived from the resolved action, what pressing it does (registry
// action-consent-wiring) - and the few presses that work with no agent at all.
import { STUDIO_ACTION_GOES } from "@gt/domain/audio.studio.kinds";
import type { StudioAction, StudioTurn } from "@gt/domain/audio.studio";
import type { ParsedTurn } from "@gt/domain/audio.studio.door";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { EarButton } from "@gt/ui/components/audio/EarButton.tsx";
import { TransportRow } from "@gt/ui/components/audio/TransportRow.tsx";
import type { MixTransport } from "@gt/ui/components/audio/useMix.ts";

import { localPlay, nodeSound, soundKey, soundOf } from "../../_host/press.ts";
import type { Dispatch } from "../../_host/types.ts";
import { cardTitle, doesWords, nodeOf, resolverOf, stemLabel, type CardModel } from "./model.ts";
import s from "./canvas.module.css";

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
      {cards.length === 0 && <p className={s.quiet}>No answers yet.</p>}
    </nav>
  );
}

type NextProps = {
  readonly visible: ParsedTurn | null;
  readonly turns: readonly ParsedTurn[];
  readonly transport: MixTransport;
  readonly dispatch: Dispatch;
  readonly askBlocked: string | null;
  readonly offline: boolean;
};

/** Is a local proposal already in effect (its sound playing, its mix setting already set). */
function inEffect(a: StudioAction, turn: StudioTurn, t: MixTransport): boolean {
  if (a.kind === "play" || a.kind === "hear") {
    const snd = soundOf(turn, a);
    return snd !== null && t.stateOf(snd.key) !== "idle";
  }
  if (a.kind === "mute") return (t.mixOf(a.stem).muted ?? false) === a.on;
  if (a.kind === "solo") return (t.mixOf(a.stem).solo ?? false) === a.on;
  if (a.kind === "level") return t.mixOf(a.stem).levelDb === a.db;
  if (a.kind === "pan") return t.mixOf(a.stem).pan === a.pan;
  return false;
}

/** The newest turn holding a piece of this kind (the latest card may only offer choices). */
const newestWith = (turns: readonly ParsedTurn[], kind: "track" | "stems"): { readonly turn: StudioTurn; readonly id: string } | null => {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]?.turn;
    const n = t === undefined ? undefined : nodeOf(t, kind);
    if (t !== undefined && n !== undefined) return { turn: t, id: n.id };
  }
  return null;
};

export function NextSteps({ visible, turns, transport, dispatch, askBlocked, offline }: NextProps) {
  const turn = visible?.turn ?? null;
  const now = transport.sounding;
  const take = newestWith(turns, "track");
  const parts = newestWith(turns, "stems");
  const takeKey = take === null ? null : soundKey(take.turn.id, take.id);
  const partsKey = parts === null ? null : soundKey(parts.turn.id, parts.id);
  const stemsNode = parts === null ? undefined : nodeOf(parts.turn, "stems");
  const edited = stemsNode?.rows.some((r) => {
    const m = transport.mixOf(r.id);
    return m.muted !== undefined || m.solo !== undefined || m.levelDb !== undefined || m.pan !== undefined;
  });
  const resolve = turn === null ? null : resolverOf(turn, (id) => stemLabel(turns, turn.id, id));
  const candidateName = (node: string, id: string): string | null => {
    const n = turn?.show.find((x) => x.id === node);
    return n?.kind === "candidates" ? (n.rows.find((r) => r.id === id)?.name ?? null) : null;
  };
  return (
    <aside className={s.next} aria-label="next steps">
      <section className={s.nowPlaying} aria-label="now playing">
        <CapsHeading text="now playing" />
        <TransportRow
          name={now?.name ?? "the newest take"}
          state={transport.state}
          clock={transport.clock}
          duration={transport.duration}
          failed={transport.failed}
          onToggle={() => {
            if (now !== null) transport.stop();
            else if (take !== null) dispatch(localPlay(take.id), take.turn.id);
          }}
          onSeek={transport.seek}
          onStop={transport.stop}
        />
      </section>
      <section className={s.steps}>
        <CapsHeading text="next steps" tally={{ value: turn?.actions.length ?? 0, label: "suggested" }} />
        {offline && <p className={s.offline}>{"No agent is listening. Everything that plays or mixes here still works; the asks wait."}</p>}
        {turn === null || turn.actions.length === 0 ? (
          <p className={s.quiet}>{turn === null ? "The agent has not answered yet." : "The agent suggested nothing this time; say what you want below."}</p>
        ) : (
          <ol className={s.stepList}>
            {turn.actions.map((a) => {
              const toAgent = STUDIO_ACTION_GOES[a.kind] === "agent";
              const blocked = toAgent ? askBlocked : null;
              const on = !toAgent && inEffect(a, turn, transport);
              return (
                <li key={a.id} className={s.step} data-goes={toAgent ? "agent" : "here"} data-blocked={blocked !== null || undefined}>
                  <div className={s.stepHead}>
                    <Button label={a.label} size="sm" tone={toAgent ? "cyan" : "neutral"} disabled={blocked !== null} onPress={() => dispatch(a)} />
                    <Chip label={toAgent ? "asks the agent" : "plays here"} casing="lower" ghost={!toAgent} {...(on ? { tone: "emerald" as const, dot: true, label: "on now" } : {})} />
                  </div>
                  {a.why !== undefined && <p className={s.why}>{a.why}</p>}
                  {resolve !== null && <p className={s.does}>{doesWords(a, resolve, candidateName)}</p>}
                  {blocked !== null && <p className={s.quiet}>{blocked}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className={s.steps} aria-label="always here">
        <CapsHeading text="always here" />
        <div className={s.always}>
          <Button
            label={takeKey !== null && transport.stateOf(takeKey) !== "idle" ? "stop the newest take" : "play the newest take"}
            size="sm"
            disabled={take === null}
            onPress={() => take !== null && dispatch(localPlay(take.id), take.turn.id)}
          />
          <Button
            label={partsKey !== null && transport.stateOf(partsKey) !== "idle" ? "stop the parts" : "play every part, with my changes"}
            size="sm"
            disabled={parts === null}
            onPress={() => parts !== null && dispatch(localPlay(parts.id), parts.turn.id)}
          />
          <Button label="stop everything" size="sm" disabled={transport.state === "idle"} onPress={transport.stop} />
          <Button label="undo my mixer changes" size="sm" disabled={edited !== true} onPress={transport.resetMix} />
        </div>
      </section>
    </aside>
  );
}
