"use client";

// A CARD ON THE ARRANGE BOARD - one version stack: its head's title, the version it is on, the
// waveform measured at ingest, its length, its label once finalized, and (open) the versions
// under it with what each was filed from. v1 app/playground/arrange/Card.tsx absorbed.
//
// The card is focusable, not a button: Enter and Space on a button are the button's own, and a
// card answers the keymap's verbs (arrows walk, ⇧arrows move, F finalizes, V opens versions -
// the Arrange island binds them). A press that travels becomes a drag (the island owns the
// pointer). A card whose move is in flight is drawn PROVISIONAL (dashed rim, `aria-busy`) until
// the store answers - the request posture (drag-drop ownership-boundaries): nothing downstream
// treats it as moved before then.
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Wave } from "../wave/Wave.tsx";
import { PlayMark } from "./AudioPreview.tsx";
import { versionNumber, type ArrangeTake, type Stack } from "./arrange.ts";
import { lengthOf } from "./hunt.ts";
import s from "./Arrange.module.css";

export type CardStem = {
  readonly role: string;
  readonly instrumentName: string;
  readonly src: string;
  readonly reused?: boolean;
};

/** What a card draws of a take, beside what the board's rules read. */
export type CardTake = ArrangeTake & {
  readonly verdict: string;
  /** The take's bytes, served; null for a row with no file. */
  readonly src: string | null;
  /** The ingest measure's peaks, else the take's own; empty draws the dashed midline. */
  readonly peaks: readonly number[];
  /** Measured length, else asked. */
  readonly lengthS: number | null;
  readonly prompt: string;
  readonly origin: string;
  readonly fileName: string | null;
  readonly stems?: readonly CardStem[];
};

export type TakeCardProps = {
  readonly stack: Stack<CardTake>;
  readonly focused: boolean;
  readonly pending: boolean;
  /** The id of the version the one transport is playing, if it is in this stack. */
  readonly playing: string | null;
  readonly open: boolean;
  readonly onFocus: () => void;
  readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly onPlay: (take: CardTake) => void;
  readonly onVersions: () => void;
  /** The round trip, on a card in a manual stage. */
  readonly children?: ReactNode;
};

const W = 220;
const H = 30;

function PlayButton({ take, on, onPlay }: { readonly take: CardTake; readonly on: boolean; readonly onPlay: (t: CardTake) => void }) {
  if (take.src === null) return null;
  return (
    <button type="button" className={cx(s.play, on && s.playOn)} aria-label={`${on ? "pause" : "play"} ${take.title}`} onClick={() => onPlay(take)} data-nodrag>
      <PlayMark on={on} className={s.playMark} />
    </button>
  );
}

export function TakeCard({ stack, focused, pending, playing, open, onFocus, onPointerDown, onPlay, onVersions, children }: TakeCardProps) {
  const h = stack.head;
  const n = stack.versions.length;
  const finalized = h.stage === "finalized" && h.label !== null;
  return (
    <article
      className={cx(s.card, focused && s.focused, pending && s.pending)}
      tabIndex={0}
      data-card={h.id}
      aria-label={n > 1 ? `${h.title}, v${n}` : h.title}
      aria-busy={pending || undefined}
      onFocus={onFocus}
      onPointerDown={onPointerDown}
    >
      <div className={s.cardHead}>
        <PlayButton take={h} on={playing === h.id} onPlay={onPlay} />
        <span className={s.title}>{h.title}</span>
        {n > 1 && <Chip label={`v${n}`} casing="lower" tone="violet" pressed={open} name={`versions of ${h.title}`} onPress={onVersions} />}
      </div>
      <div className={s.cardWave}>
        <Wave peaks={h.peaks} width={W} height={H} tone={finalized ? "emerald" : "cyan"} stretch />
      </div>
      <div className={s.cardMeta}>
        {/* The hunt's spelling, so a crowned effect reads the same length here as on the map it
            won (0.6 s, not m:ss rounded to 0:01). */}
        <span>{h.lengthS === null ? "–" : lengthOf(h.lengthS)}</span>
        {h.stems !== undefined && h.stems.length > 0 && <Chip label={`${h.stems.length} stems`} casing="lower" tone="cyan" />}
        {finalized && <Chip label={h.label ?? ""} casing="lower" tone="emerald" />}
      </div>
      {h.stems !== undefined && h.stems.length > 0 && (
        <ul className={s.versions} aria-label={`stems of ${h.title}`}>
          {h.stems.map((st) => {
            const stemTake: CardTake = { ...h, id: `${h.id}:${st.role}`, title: `${h.title} · ${st.role}`, src: st.src };
            return (
              <li key={st.role} className={s.version}>
                <PlayButton take={stemTake} on={playing === stemTake.id} onPlay={onPlay} />
                <b>{st.role}</b>
                <span className={s.versionFrom}>{st.instrumentName}</span>
                {st.reused && <Chip label="reused" casing="lower" tone="cyan" />}
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <ol className={s.versions} aria-label={`versions of ${h.title}`}>
          {stack.versions.map((v) => (
            <li key={v.id} className={s.version}>
              <PlayButton take={v} on={playing === v.id} onPlay={onPlay} />
              <b>v{versionNumber(stack, v.id)}</b>
              <span className={s.versionFrom}>{v.origin === "suno-return" ? (v.fileName ?? "suno return") : v.origin}</span>
              <span>{v.stage ?? "pending"}</span>
            </li>
          ))}
        </ol>
      )}
      {children}
    </article>
  );
}
