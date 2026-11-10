"use client";

// Suno's own read of a pulled take (spark suno-api), one column of ./TakeFacts.tsx beside what was
// measured and what Gemini heard: tempo, key, beats a bar, genre / mood / vocals from its listen
// answer, the words its lyric alignment placed (a tally), the top labels with their probability, its
// terms, the A/B/C sections and the answer in Suno's words. A row another read disagrees with names
// that read's value (./reads.ts). `read` is free: idle, working while Suno answers, a refusal in
// Suno's words; `processing` says a part was still out when the read stopped waiting.
import { useState } from "react";

import type { SunoRead } from "@gt/domain/audio.suno";

import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { ErrorLine } from "../errorline/ErrorLine.tsx";
import { CapsHeading } from "../heading/CapsHeading.tsx";
import { Tally } from "../tally/Tally.tsx";
import { answerProse, offWords, type ReadsDisagree } from "./reads.ts";
import { clock } from "./suno.ts";
import s from "./TakeFacts.module.css";

export type ReadPress = { readonly kind: "idle" } | { readonly kind: "working" } | { readonly kind: "refused"; readonly reason: string };

type Row = { readonly term: string; readonly value: string; readonly off?: string };

/** The labels the column shows: the most probable first. */
export const TOP_LABELS = 3;
/** The terms the column shows. */
export const TOP_TERMS = 6;

export function sunoRows(r: SunoRead, dis: ReadsDisagree): readonly Row[] {
  const bpmOff = offWords(dis.bpm.suno);
  const keyOff = offWords(dis.key.suno);
  return [
    ...(r.bpm !== undefined ? [{ term: "bpm", value: r.bpm.toFixed(1), ...(bpmOff !== null ? { off: bpmOff } : {}) }] : []),
    ...(r.key !== undefined ? [{ term: "key", value: r.key, ...(keyOff !== null ? { off: keyOff } : {}) }] : []),
    ...(r.timeSignature !== undefined ? [{ term: "beats/bar", value: String(r.timeSignature) }] : []),
    ...(r.genre !== undefined ? [{ term: "genre", value: r.genre.join(", ") }] : []),
    ...(r.mood !== undefined ? [{ term: "mood", value: r.mood.join(", ") }] : []),
    ...(r.vocals !== undefined ? [{ term: "vocals", value: r.vocals.heard ? (r.vocals.character ?? "heard") : "none heard" }] : []),
  ];
}

export function SunoColumn({ read, dis, onRead, seed = { kind: "idle" } }: { readonly read: SunoRead | undefined; readonly dis: ReadsDisagree; readonly onRead?: () => Promise<string | null>; readonly seed?: ReadPress }) {
  const [press, setPress] = useState<ReadPress>(seed);
  const run = (): void => {
    if (press.kind === "working" || onRead === undefined) return;
    setPress({ kind: "working" });
    void onRead().then((reason) => setPress(reason === null ? { kind: "idle" } : { kind: "refused", reason }));
  };
  const labels = [...(read?.labels ?? [])].sort((a, b) => b.p - a.p).slice(0, TOP_LABELS);
  const prose = read?.answer === undefined ? "" : answerProse(read.answer);
  return (
    <div className={s.col}>
      <div className={s.colHead}>
        <CapsHeading text="suno" level={4} />
        {read?.status === "processing" && <Chip label="processing" tone="amber" ghost casing="lower" />}
        {read?.status === "unavailable" && <Chip label="unavailable" ghost casing="lower" />}
        <span className={s.grow} />
        <Button label={press.kind === "working" ? "reading…" : "read"} size="sm" tone="violet" badge={{ label: "free" }} disabled={press.kind === "working"} onPress={run} />
      </div>
      {press.kind === "refused" && <ErrorLine message={press.reason} live />}
      {read !== undefined && (
        <>
          <dl className={s.rows}>
            {sunoRows(read, dis).map((r) => (
              <div key={r.term} className={s.row}>
                <dt className={s.term}>{r.term}</dt>
                <dd className={s.value}>
                  {r.value}
                  {r.off !== undefined && <span className={s.off}>{r.off}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {(read.words !== undefined || labels.length > 0) && (
            <div className={s.chips}>
              {read.words !== undefined && <Tally value={read.words} label="words aligned" />}
              {labels.map((l) => (
                <Chip key={l.label} label={l.label} value={l.p.toFixed(2)} tone="violet" ghost casing="lower" />
              ))}
            </div>
          )}
          {read.terms.length > 0 && (
            <ul className={s.chips} aria-label="suno terms">
              {read.terms.slice(0, TOP_TERMS).map((t) => (
                <li key={t} className={s.chipItem}>
                  <Chip label={t} ghost casing="lower" />
                </li>
              ))}
            </ul>
          )}
          {read.sections.length > 0 && (
            <ol className={s.list} aria-label="suno sections">
              {read.sections.map((x, i) => {
                const near = dis.sections.suno.get(i);
                return (
                  <li key={`${x.label}:${x.startS}`} className={s.item}>
                    <span className={s.time}>{`${clock(x.startS)}–${clock(x.endS)}`}</span>
                    <span className={s.value}>{x.label}</span>
                    {near !== undefined && <span className={s.off}>{`gemini ${clock(near)}`}</span>}
                  </li>
                );
              })}
            </ol>
          )}
          {prose !== "" && <blockquote className={s.quote}>{prose}</blockquote>}
        </>
      )}
    </div>
  );
}
