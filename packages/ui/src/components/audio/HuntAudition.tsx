"use client";

// THE AUDITION - every heard leaf side by side, so the comparison is the layout (v1
// app/playground/hunt/Audition.tsx). One transport plays one take at a time (the island's
// useTransport); ← and → step through the row in board order, so two briefs are heard back to
// back. The crown is here too: the verdict is given where the takes are heard.
//
// Dropped from v1: the linked playhead (stepping carried the second the last take was at). The
// desk's one transport (app/(studio)/audio/_audio/useTransport.ts) exposes no position; carrying
// it needs that seam, raised with the Director rather than a second <audio> here.
import { Button } from "../button/Button.tsx";
import { Chip } from "../chip/Chip.tsx";
import { cx } from "../cx.ts";
import { Wave } from "../wave/Wave.tsx";
import { PlayMark } from "./AudioPreview.tsx";
import { headTake, lengthOf, type AuditionTake, type HuntLeafView } from "./hunt.ts";
import s from "./Hunt.module.css";

export type HuntAuditionProps = {
  /** Heard leaves, in board order. */
  readonly heard: readonly HuntLeafView[];
  readonly takes: Readonly<Record<string, AuditionTake>>;
  readonly playing: string | null;
  readonly crowning: ReadonlySet<string>;
  readonly onPlay: (take: AuditionTake) => void;
  readonly onCrown: (leaf: HuntLeafView, takeId: string, on: boolean) => void;
};

/** The take ← or → moves to from the one playing (wrapping), in board order. */
export function stepTake(heard: readonly HuntLeafView[], playing: string | null, by: -1 | 1): string | undefined {
  const ids = heard.flatMap((l) => {
    const t = headTake(l);
    return t === undefined ? [] : [t];
  });
  if (ids.length === 0) return undefined;
  const at = playing === null ? -1 : ids.indexOf(playing);
  if (at === -1) return by === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(at + by + ids.length) % ids.length];
}

export function HuntAudition({ heard, takes, playing, crowning, onPlay, onCrown }: HuntAuditionProps) {
  return (
    <div className={s.audition} role="group" aria-label="audition">
      {heard.map((leaf) => {
        const tid = headTake(leaf);
        const take = tid === undefined ? undefined : takes[tid];
        if (take === undefined) return null;
        const on = playing === take.id;
        return (
          <div key={leaf.id} className={cx(s.take, on && s.takeOn, leaf.winner && s.won)}>
            <span className={s.takeAxis}>{leaf.axis}</span>
            <div className={s.takeHead}>
              {take.src !== null && (
                <button type="button" className={cx(s.play, on && s.playOn)} aria-label={`${on ? "pause" : "play"} ${leaf.label}`} onClick={() => onPlay(take)}>
                  <PlayMark on={on} className={s.playMark} />
                </button>
              )}
              <span className={s.takeTitle}>{leaf.label}</span>
            </div>
            <span className={s.wave}>
              <Wave peaks={take.peaks} width={200} height={28} tone={leaf.winner ? "emerald" : "cyan"} stretch />
            </span>
            <div className={s.leafActs}>
              <Chip label={leaf.provider} casing="lower" />
              <Chip label={take.lengthS === null ? "–" : lengthOf(take.lengthS)} casing="lower" />
              <Button label={leaf.winner ? "Uncrown" : "Crown"} size="sm" tone={leaf.winner ? "neutral" : "emerald"} disabled={crowning.has(leaf.id) || take.verdict === "rejected"} onPress={() => onCrown(leaf, take.id, !leaf.winner)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
