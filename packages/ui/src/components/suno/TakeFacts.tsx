"use client";

// What Gravitone knows about one Suno take (spark suno-advisor; spark suno-api), read by takeId - the
// agent never copies a number into its words. Up to three reads side by side, each column named by
// its source word, none replacing another (the listener doctrine):
//   measured  this server's sidecar on the file (tempo with its octave neighbours, key and how clearly
//             it won, loudness, true peak, range, length) - always there;
//   suno      Suno's own free reads (./SunoColumn.tsx) - only for a take pulled from Suno, with a free
//             `read` press; a take uploaded by hand has no Suno column at all;
//   gemini    the priced listen, behind an "unconfirmed" stamp: audio models over-specify instruments
//             and misread vocals, so the read is a hypothesis. Listen is a priced press (receipt
//             first): idle shows the quote, an unpriced take cannot be pressed and says why, working
//             while the read is on its way, the done read names its model and time (and "stand-in"
//             for a DRY run), and a refusal is shown verbatim.
// Where two reads disagree on tempo, key or a section start, each side's row names the other's value
// (./reads.ts readsDisagree).
import { useState } from "react";

import type { StudioListen, StudioTakeFacts } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { offWords, readsDisagree, type ReadsDisagree } from "./reads.ts";
import { SunoColumn, type ReadPress } from "./SunoColumn.tsx";
import { clock, listenView, measuredRows, stamp, usd, type ListenPress } from "./suno.ts";
import s from "./TakeFacts.module.css";

export type TakeFactsProps = {
  readonly facts: StudioTakeFacts;
  /** Run the priced listener; resolve with the refusal in words, or null when it went (the facts then carry `listened`). */
  readonly onListen: (takeId: string) => Promise<string | null>;
  /** Ask Suno's free reads of a pulled take; resolve with the refusal in Suno's words, or null when it went. */
  readonly onRead?: (takeId: string) => Promise<string | null>;
  /** /kit only: the presses as drawn before any click. */
  readonly seed?: ListenPress;
  readonly readSeed?: ReadPress;
};

/** Why an unpriced take cannot be listened to: a fact about the pricing table, not about the page. */
export const UNPRICED = "no audio-input rate in the pricing table";

type Heard = { readonly term: string; readonly value: string; readonly off?: string };

function heardRows(l: StudioListen, dis: ReadsDisagree): readonly Heard[] {
  const bpmOff = offWords(dis.bpm.gemini);
  const keyOff = offWords(dis.key.gemini);
  return [
    ...(l.genre.length > 0 ? [{ term: "genre", value: l.genre.join(", ") }] : []),
    ...(l.mood.length > 0 ? [{ term: "mood", value: l.mood.join(", ") }] : []),
    ...(l.bpm !== undefined ? [{ term: "bpm", value: String(Math.round(l.bpm)), ...(bpmOff !== null ? { off: bpmOff } : {}) }] : []),
    ...(l.key !== undefined ? [{ term: "key", value: l.key, ...(keyOff !== null ? { off: keyOff } : {}) }] : []),
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

function Measured({ facts, dis }: { readonly facts: StudioTakeFacts; readonly dis: ReadsDisagree }) {
  const off: Readonly<Record<string, string | null>> = { bpm: offWords(dis.bpm.measured?.filter((o) => o.source === "suno")), key: offWords(dis.key.measured?.filter((o) => o.source === "suno")) };
  return (
    <div className={s.col}>
      <div className={s.colHead}>
        <CapsHeading text="measured" level={4} />
      </div>
      <dl className={s.rows}>
        {measuredRows(facts).map((r) => (
          <div key={r.term} className={s.row}>
            <dt className={s.term}>{r.term}</dt>
            <dd className={s.value}>
              {r.value}
              {r.aside !== undefined && <span className={s.aside}>{r.aside}</span>}
              {(off[r.term] ?? null) !== null && <span className={s.off}>{off[r.term]}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Gemini({ facts, dis, press, onPress }: { readonly facts: StudioTakeFacts; readonly dis: ReadsDisagree; readonly press: ListenPress; readonly onPress: () => void }) {
  const l = facts.listened;
  const heard = l === undefined ? [] : heardRows(l, dis);
  return (
    <div className={s.col}>
      <div className={s.colHead}>
        <CapsHeading text="gemini" level={4} {...(l !== undefined ? { tally: { value: heard.length + l.instruments.length + l.sections.length, label: "unconfirmed" } } : {})} />
        <span className={s.grow} />
        <Listen facts={facts} press={press} onPress={onPress} />
      </div>
      {press.kind === "refused" && l === undefined && <ErrorLine message={press.reason} live />}
      {l !== undefined && (
        <>
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
              {l.sections.map((x, i) => {
                const near = dis.sections.gemini.get(i);
                return (
                  <li key={`${x.name}:${x.startS}`} className={s.item}>
                    <span className={s.time}>{`${clock(x.startS)}–${clock(x.endS)}`}</span>
                    <span className={s.heard}>{x.name}</span>
                    <span className={s.aside}>{x.says}</span>
                    {near !== undefined && <span className={s.off}>{`suno ${clock(near)}`}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export function TakeFacts({ facts, onListen, onRead, seed = { kind: "idle" }, readSeed }: TakeFactsProps) {
  const [press, setPress] = useState<ListenPress>(seed);
  const run = (): void => {
    if (press.kind === "working") return;
    setPress({ kind: "working" });
    void onListen(facts.takeId).then((reason) => setPress(reason === null ? { kind: "idle" } : { kind: "refused", reason }));
  };
  const dis = readsDisagree({ measured: facts.measured, ...(facts.suno !== undefined ? { suno: facts.suno } : {}), ...(facts.listened !== undefined ? { gemini: facts.listened } : {}) });
  return (
    <section className={s.take} aria-label={`take ${facts.name}`}>
      <header className={s.head}>
        <span className={s.name}>{facts.name}</span>
        {facts.clip !== undefined && <Chip label="take" value={facts.clip} casing="lower" />}
        {facts.sunoClipId !== undefined && <Chip label="suno song" value={facts.sunoClipId.slice(0, 8)} tone="violet" ghost casing="lower" name={`suno song ${facts.sunoClipId}`} />}
      </header>
      <div className={s.cols}>
        <Measured facts={facts} dis={dis} />
        {facts.sunoClipId !== undefined && (
          <SunoColumn read={facts.suno} dis={dis} {...(onRead !== undefined ? { onRead: () => onRead(facts.takeId) } : {})} {...(readSeed !== undefined ? { seed: readSeed } : {})} />
        )}
        <Gemini facts={facts} dis={dis} press={press} onPress={run} />
      </div>
    </section>
  );
}
