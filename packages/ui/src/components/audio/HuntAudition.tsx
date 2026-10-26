"use client";

// THE AUDITION - every heard leaf side by side, so the comparison is the layout (v1
// app/playground/hunt/Audition.tsx). One transport plays one take at a time (the island's
// useTransport); Previous and Next step through the row in board order, so two briefs are heard
// back to back. The crown is here too: the verdict is given where the takes are heard.
//
// ONE PLAYHEAD (v1's, returned in L72 once the transport exposed its position): with it on, a step
// starts the next take at the second the last one was at - the same moment of two briefs, the only
// fair way to hear a variant against its sibling (media-generation generated-music-acceptance:
// judge against the brief, not against which take happened to be at its chorus). Off, each take
// starts from its top.
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

/** The take ← or → moves to from the one playing (wrapping), in board order. A take with no bytes
 *  (or none in `takes`) is passed over: the step lands on what plays, never sticks before it. */
export function stepTake(heard: readonly HuntLeafView[], playing: string | null, by: -1 | 1, takes: Readonly<Record<string, AuditionTake>>): string | undefined {
  const ids = heard.flatMap((l) => {
    const t = headTake(l);
    return t === undefined || (takes[t]?.src ?? null) === null ? [] : [t];
  });
  if (ids.length === 0) return undefined;
  const at = playing === null ? -1 : ids.indexOf(playing);
  if (at === -1) return by === 1 ? ids[0] : ids[ids.length - 1];
  return ids[(at + by + ids.length) % ids.length];
}

/** The second a step starts `next` at: the playing take's, carried, only while linked and only
 *  from ANOTHER take that is playing - a fresh play, or the same take again, starts at its top. */
export function carryFrom(linked: boolean, playing: string | null, next: string, at: number): number {
  return linked && playing !== null && playing !== next && Number.isFinite(at) && at > 0 ? at : 0;
}

/** What a leaf asked for: its length, and the tempo, key and loop when it named them. Drawn on the
 *  map card and beside each audition take, so the crown is judged against the brief. */
export function AskedChips({ leaf }: { readonly leaf: HuntLeafView }) {
  return (
    <>
      <Chip label="length" value={lengthOf(leaf.durationS)} casing="lower" />
      {leaf.tempoBpm !== null && <Chip label="bpm" value={leaf.tempoBpm} casing="lower" />}
      {leaf.key !== null && <Chip label="key" value={leaf.key} casing="lower" />}
      {leaf.loop === true && <Chip label="loop" casing="lower" />}
    </>
  );
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
          <div key={leaf.id} className={cx(s.take, on && s.takeOn, leaf.winner && s.won)} role="group" aria-label={leaf.label}>
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
            <div className={s.leafMeta}>
              <AskedChips leaf={leaf} />
            </div>
            <div className={s.leafActs}>
              <Chip label={leaf.provider} casing="lower" />
              <Chip label="heard" value={take.lengthS === null ? "–" : lengthOf(take.lengthS)} casing="lower" />
              <Button label={leaf.winner ? "Uncrown" : "Crown"} size="sm" tone={leaf.winner ? "neutral" : "emerald"} disabled={crowning.has(leaf.id) || take.verdict === "rejected"} onPress={() => onCrown(leaf, take.id, !leaf.winner)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
