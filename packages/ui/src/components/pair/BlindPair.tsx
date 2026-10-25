"use client";

// THE BLIND PAIR (prototype index.html :575-622): two masked arms, the question, a pip per
// pair; 1 left, 2 right, 0 tie, X both bad. Once picked, the arms unmask and the machine's
// pick is shown with "agrees" or "differs" for a beat, then the next pair comes up; after the
// last, a summary of every pick and the machine's agreement.
//
// BLIND IS THE SERVER'S PROPERTY, NOT THIS COMPONENT'S. `PairView.machine` exists only for a
// pair the operator has judged (kernel decision/read.ts revealPicks, the EXISTS guard) and an
// arm's grades are withheld until then, so there is nothing here to forget to hide. The arm
// labels are masked regardless; an adapter withholds them too (the fixture does).
import { useEffect, useRef, useState } from "react";

import type { PickOutcome } from "@gt/domain/board";

import type { BoardPacket } from "../../board/port.ts";
import { OUTCOME_OF, agreement, armLook, currentPair, outcomeWords } from "../../board/pair.ts";
import { useKeys } from "../../keymap/dispatch.ts";
import { Chip } from "../chip/Chip.tsx";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { CommitButton, DeskFrame, OracleStrip } from "../desk/Desk.tsx";
import { Keycap, Keycaps } from "../keycaps/Keycaps.tsx";
import { PipRow } from "../piprow/PipRow.tsx";
import type { Look } from "../status/status.ts";
import { Tally } from "../tally/Tally.tsx";
import s from "./Pair.module.css";

/** How long a revealed pick stays up before the next pair (the prototype's 1150 ms; 500 reduced). */
export const REVEAL_MS = 1150;
export const REVEAL_REDUCED_MS = 500;

/** The reveal time the viewer's motion setting asks for; the full reveal where there is no media query (server, tests). */
export function defaultRevealMs(): number {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return reduced ? REVEAL_REDUCED_MS : REVEAL_MS;
}

export type BlindPairProps = {
  readonly packet: BoardPacket;
  readonly onPick: (pair: string, outcome: PickOutcome) => void;
  readonly undo: () => void;
  readonly onCommit: () => void;
  readonly busy?: boolean;
  readonly announce?: (message: string) => void;
  readonly keys?: boolean;
  /** Reveal time; 0 shows the next pair at once (tests). Unset, it follows prefers-reduced-motion. */
  readonly revealMs?: number;
};

export function BlindPair({ packet, onPick, undo, onCommit, busy = false, announce = () => undefined, keys = true, revealMs }: BlindPairProps) {
  const { view, present } = packet;
  const pairs = view.pairs;
  const [revealing, setRevealing] = useState<string | null>(null);
  const [refusals, setRefusals] = useState(0);
  const next = currentPair(pairs);
  const shownIdx = revealing === null ? next : pairs.findIndex((p) => p.row === revealing);
  const pair = pairs[shownIdx];
  const done = pair === undefined;
  const left = pairs.filter((p) => p.outcome === null).length;
  const byId = new Map(view.items.map((it) => [it.id, it]));

  // The reveal lasts one beat, then the next pair comes up.
  useEffect(() => {
    if (revealing === null) return;
    const t = setTimeout(() => setRevealing(null), revealMs ?? defaultRevealMs());
    return () => clearTimeout(t);
  }, [revealing, revealMs]);
  // A reveal arrives with the server's answer: say what the machine thought, once per answer.
  const said = useRef(announce);
  useEffect(() => {
    said.current = announce;
  });
  const revealedPair = revealing === null ? undefined : pairs.find((p) => p.row === revealing);
  const revealWords =
    revealedPair === undefined || revealedPair.outcome === null
      ? null
      : `${outcomeWords(revealedPair.outcome)}${revealedPair.machine === undefined || revealedPair.machine.agrees === null ? "" : ` · machine ${revealedPair.machine.agrees ? "agrees" : "differs"}`}`;
  useEffect(() => {
    if (revealWords !== null) said.current(revealWords);
  }, [revealWords]);

  const pick = (outcome: PickOutcome) => {
    if (pair === undefined || revealing !== null || pair.outcome !== null) return;
    setRevealing(pair.row);
    onPick(pair.row, outcome);
  };
  const commit = () => {
    if (left > 0) {
      setRefusals((n) => n + 1);
      announce(`${left} left`);
      return;
    }
    onCommit();
  };
  const verb = (v: string) => () => {
    const o = OUTCOME_OF[v];
    if (o !== undefined) pick(o);
  };
  useKeys(
    "board.pair",
    {
      left: verb("left"),
      right: verb("right"),
      tie: verb("tie"),
      "both-bad": verb("both-bad"),
      undo: () => {
        setRevealing(null);
        undo();
      },
      commit,
    },
    { enabled: keys },
  );

  const looks: Look[] = pairs.map((p, i) => (p.outcome !== null ? (p.machine?.agrees === true ? "done" : "awaiting") : i === shownIdx ? "running" : "idle"));
  const agree = agreement(pairs);

  const arm = (side: "a" | "b") => {
    if (pair === undefined) return null;
    const id = side === "a" ? pair.a : pair.b;
    const it = byId.get(id);
    const revealed = revealing === pair.row && pair.outcome !== null;
    const look = revealed ? armLook(pair.outcome, side) : "open";
    const words = present.items[id];
    const video = it?.media.mime.startsWith("video/") === true;
    return (
      <button type="button" className={cx(s.arm, s[look])} aria-label={side === "a" ? "left arm" : "right arm"} onClick={() => pick(side)}>
        {video ? <video className={s.media} src={it?.url} autoPlay muted loop playsInline /> : <Plate className={s.media} src={it?.url} alt={side === "a" ? "left arm" : "right arm"} />}
        <div className={s.armcap}>
          <Keycap mode="board.pair" verb={side === "a" ? "left" : "right"} />
          <span className={s.lab}>{revealed && words !== undefined ? words.label : <span className={s.masked}>{side === "a" ? "LEFT" : "RIGHT"} · ▒▒▒▒</span>}</span>
          {revealed && pair.machine?.candidate === id && (
            <span className={s.mpick}>
              <Chip label="machine pick" tone="violet" />
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <DeskFrame
      title={view.title ?? view.id}
      {...(present.meta !== undefined ? { meta: present.meta } : {})}
      marks={present.oracle !== undefined && <OracleStrip oracle={present.oracle} />}
      foot={
        <>
          <Keycaps mode="board.pair" label="pair keys" />
          <CommitButton mode="board.pair" refusals={refusals} busy={busy} onPress={commit} {...(left > 0 ? { waiting: `${left} left` } : {})} />
        </>
      }
    >
      <div className={s.pair} data-component="BlindPair">
        {done ? (
          <div className={s.summary}>
            {pairs.map((p) => {
              const a = byId.get(p.a);
              const b = byId.get(p.b);
              const won = p.outcome === "a" ? p.a : p.outcome === "b" ? p.b : null;
              return (
                <div key={p.row} className={s.sumRow}>
                  <Plate className={cx(s.thumb, p.outcome === "a" ? s.won : s.lost)} src={a?.url} alt="" />
                  <Plate className={cx(s.thumb, p.outcome === "b" ? s.won : s.lost)} src={b?.url} alt="" />
                  <div>
                    <div className={s.question}>{present.questions?.[p.row] ?? p.row}</div>
                    <div className={s.kv}>
                      {p.outcome !== null && <Chip label={won !== null ? `picked · ${present.items[won]?.label ?? won}` : outcomeWords(p.outcome)} tone={won !== null ? "emerald" : p.outcome === "both-bad" ? "rose" : "neutral"} />}
                      {p.machine?.agrees != null && <Chip label={`machine ${p.machine.agrees ? "agrees" : "differs"}`} tone={p.machine.agrees ? "emerald" : "amber"} />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className={s.kv}>
              <Tally value={agree.agree} of={agree.compared} label="agreement" />
            </div>
          </div>
        ) : (
          <>
            <div className={s.q}>
              <span className={s.pos}>
                {shownIdx + 1}/{pairs.length}
              </span>
              <b>{present.questions?.[pair.row] ?? pair.row}</b>
              <PipRow looks={looks} label={`${pairs.length - left} of ${pairs.length} pairs judged`} />
            </div>
            <div className={s.arms}>
              {arm("a")}
              {arm("b")}
            </div>
            <div className={s.banner} aria-live="polite">
              {revealing === pair.row && pair.machine !== undefined ? (
                <Chip label={pair.machine.agrees === null ? "machine not comparable" : `machine ${pair.machine.agrees ? "agrees" : "differs"}`} tone={pair.machine.agrees === true ? "emerald" : "amber"} />
              ) : (
                <Chip label="machine pick ▒▒ masked" />
              )}
            </div>
          </>
        )}
      </div>
    </DeskFrame>
  );
}
