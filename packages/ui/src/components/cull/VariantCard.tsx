"use client";

// One VARIANT in the opened run, large: the media (a still whole, a clip with its own control bar, a
// take with its waveform and player, a finding's words), its caption, and the verdict under it by
// click (VerdictPick). A press on the media puts the desk's cursor on it, so the keys and the clicks
// act on the same variant. Decided is drawn on the frame and spoken in the card's name.
import { useRef } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import type { ItemWords } from "../../board/port.ts";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { Wave } from "../wave/Wave.tsx";
import { kindOf, spokenTile, type TileMedia } from "./CullTile.tsx";
import { VerdictPick } from "./VerdictPick.tsx";
import { VideoBar } from "./VideoBar.tsx";
import s from "./Verdict.module.css";

export type VariantCardProps = {
  readonly index: number;
  readonly words: ItemWords;
  readonly media: TileMedia;
  readonly verdict: BoardVerdict | undefined;
  readonly current: boolean;
  readonly nudged: boolean;
  readonly reasons: readonly string[];
  readonly maxReasons: number;
  readonly onFocus: (index: number) => void;
  readonly onVerdict: (v: BoardVerdict | null) => void;
};

export function VariantCard({ index, words, media, verdict, current, nudged, reasons, maxReasons, onFocus, onVerdict }: VariantCardProps) {
  const kind = kindOf(media.mime);
  const video = useRef<HTMLVideoElement | null>(null);
  return (
    <figure className={cx(s.card, current && s.cur, verdict?.verdict === "keep" && s.kept, verdict?.verdict === "reject" && s.rejected, nudged && s.nudge, kind === "text" && s.wide)} data-tile={index} role="gridcell" aria-selected={current} aria-label={spokenTile(words, verdict)}>
      <button type="button" className={s.media} onMouseDown={(e) => e.preventDefault()} onClick={() => onFocus(index)} aria-label={`select ${words.label}`}>
        {kind === "video" ? (
          <video ref={video} className={s.frame} src={media.url} muted autoPlay loop playsInline preload="metadata" />
        ) : kind === "audio" ? (
          <span className={s.wave}>
            <Wave peaks={words.peaks ?? []} width={420} height={110} tone={words.music === true ? "violet" : "cyan"} stretch />
          </span>
        ) : kind === "text" ? (
          <span className={s.text}>
            <span className={s.claim}>{words.label}</span>
            {words.prompt !== undefined && <span className={s.quote}>{words.prompt}</span>}
          </span>
        ) : (
          <Plate className={s.frame} src={media.url} alt={words.label} />
        )}
      </button>
      {kind === "video" && <VideoBar video={video} label={words.label} />}
      {kind === "audio" && <audio className={s.player} src={media.url} controls preload="none" />}
      <figcaption className={s.caption}>
        {kind !== "text" && <span className={s.capLabel}>{words.label}</span>}
        {words.meta !== undefined && <span className={s.capMeta}>{words.meta}</span>}
      </figcaption>
      <VerdictPick label={words.label} verdict={verdict} reasons={reasons} maxReasons={maxReasons} onChange={onVerdict} />
    </figure>
  );
}
