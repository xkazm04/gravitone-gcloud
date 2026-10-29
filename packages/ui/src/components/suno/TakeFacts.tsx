"use client";

// What Gravitone knows about one uploaded Suno take (spark suno-advisor), read by takeId - the agent
// never copies a number into its words. MEASURED rows are this server's (tempo with its octave
// neighbours, key and how clearly it won, loudness, true peak, range, length). HEARD rows are a
// listener model's read, behind an "unconfirmed" stamp: audio models over-specify instruments and
// misread vocals, so the read is a hypothesis, and where its tempo or key disagrees with the
// measurement the measured value stands and the heard one is marked.
//
// Listen is a priced press (receipt first): idle shows the quote, an unpriced take cannot be pressed
// and says why, working while the read is on its way, the done read names its model and time (and
// "stand-in" for a DRY run), and a refusal is shown verbatim.
import { useState } from "react";

import type { StudioListen, StudioTakeFacts } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { clock, disagreement, listenView, measuredRows, stamp, usd, type ListenPress } from "./suno.ts";
import s from "./TakeFacts.module.css";

export type TakeFactsProps = {
  readonly facts: StudioTakeFacts;
  /** Run the priced listener; resolve with the refusal in words, or null when it went (the facts then carry `listened`). */
  readonly onListen: (takeId: string) => Promise<string | null>;
  /** /kit only: the press as drawn before any click. */
  readonly seed?: ListenPress;
};

/** Why an unpriced take cannot be listened to: a fact about the pricing table, not about the page. */
export const UNPRICED = "no audio-input rate in the pricing table";

type Heard = { readonly term: string; readonly value: string; readonly off?: string };

function heardRows(l: StudioListen, facts: StudioTakeFacts): readonly Heard[] {
  const dis = disagreement(facts.measured, l);
  return [
    ...(l.genre.length > 0 ? [{ term: "genre", value: l.genre.join(", ") }] : []),
    ...(l.mood.length > 0 ? [{ term: "mood", value: l.mood.join(", ") }] : []),
    ...(l.bpm !== undefined ? [{ term: "bpm", value: String(Math.round(l.bpm)), ...(dis.bpm && facts.measured.bpm !== undefined ? { off: `measured ${Math.round(facts.measured.bpm)}` } : {}) }] : []),
    ...(l.key !== undefined ? [{ term: "key", value: l.key, ...(dis.key && facts.measured.key !== undefined ? { off: `measured ${facts.measured.key}` } : {}) }] : []),
    { term: "vocals", value: l.vocals.heard ? (l.vocals.character ?? "heard") : "none heard" },
  ];
}

function Listen({ facts, press, onPress }: { readonly facts: StudioTakeFacts; readonly press: ListenPress; readonly onPress: () => void }) {
  const view = listenView(facts, press);
  if (view === "done" && facts.listened !== undefined) {
    return (
      <span className={s.listen}>
        <Chip label="heard by" value={facts.listened.model} casing="lower" />
        <span className={s.at}>{stamp(facts.listened.at)}</span>
        {facts.listened.standIn === true && <Chip label="stand-in" tone="amber" ghost casing="lower" />}
      </span>
    );
  }
  return (
    <span className={s.listen}>
      {view === "working" ? (
        <Button label={"listening…"} size="sm" disabled />
      ) : view === "unpriced" ? (
        <>
          <Button label="Listen" size="sm" disabled />
          <Chip label="unpriced" ghost casing="lower" />
          <span className={s.why}>{UNPRICED}</span>
        </>
      ) : (
        <Button label="Listen" size="sm" tone="violet" badge={{ label: usd(facts.listenUsd ?? 0) }} onPress={onPress} />
      )}
    </span>
  );
}

export function TakeFacts({ facts, onListen, seed = { kind: "idle" } }: TakeFactsProps) {
  const [press, setPress] = useState<ListenPress>(seed);
  const run = (): void => {
    if (press.kind === "working") return;
    setPress({ kind: "working" });
    void onListen(facts.takeId).then((reason) => setPress(reason === null ? { kind: "idle" } : { kind: "refused", reason }));
  };
  const l = facts.listened;
  const heard = l === undefined ? [] : heardRows(l, facts);
  return (
    <section className={s.take} aria-label={`take ${facts.name}`}>
      <header className={s.head}>
        <span className={s.name}>{facts.name}</span>
        {facts.clip !== undefined && <Chip label="take" value={facts.clip} casing="lower" />}
        <span className={s.grow} />
        <Listen facts={facts} press={press} onPress={run} />
      </header>
      {press.kind === "refused" && l === undefined && <ErrorLine message={press.reason} live />}
      <div className={s.cols}>
        <div className={s.col}>
          <CapsHeading text="measured" level={4} />
          <dl className={s.rows}>
            {measuredRows(facts).map((r) => (
              <div key={r.term} className={s.row}>
                <dt className={s.term}>{r.term}</dt>
                <dd className={s.value}>
                  {r.value}
                  {r.aside !== undefined && <span className={s.aside}>{r.aside}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {l !== undefined && (
          <div className={s.col}>
            <CapsHeading text="heard" tally={{ value: heard.length + l.instruments.length + l.sections.length, label: "unconfirmed" }} level={4} />
            <dl className={s.rows}>
              {heard.map((r) => (
                <div key={r.term} className={s.row}>
                  <dt className={s.term}>{r.term}</dt>
                  <dd className={s.heard}>
                    {r.value}
                    {r.off !== undefined && <span className={s.off}>{r.off}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {l.instruments.length > 0 && (
              <ul className={s.list} aria-label="instruments heard">
                {l.instruments.map((i) => (
                  <li key={`${i.name}:${i.role}`} className={s.item}>
                    <Chip label={i.prominence} tone={i.prominence === "lead" ? "cyan" : "neutral"} ghost={i.prominence === "background"} casing="lower" />
                    <span className={s.heard}>{i.name}</span>
                    <span className={s.aside}>{i.role}</span>
                  </li>
                ))}
              </ul>
            )}
            {l.sections.length > 0 && (
              <ol className={s.list} aria-label="sections heard">
                {l.sections.map((x) => (
                  <li key={`${x.name}:${x.startS}`} className={s.item}>
                    <span className={s.time}>{`${clock(x.startS)}–${clock(x.endS)}`}</span>
                    <span className={s.heard}>{x.name}</span>
                    <span className={s.aside}>{x.says}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
