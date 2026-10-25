"use client";

// One VARIANT in the opened run, large: the media (a still whole, a clip with its own control bar, a
// take with its waveform and player, a finding's words), its caption, and the verdict under it by
// click (VerdictPick). A press on the media puts the desk's cursor on it, so the keys and the clicks
// act on the same variant. Decided is drawn on the frame and spoken in the card's name.
//
// A MODEL (model/*, a game asset's glb - spark game-3d-assets): the variant under the cursor is the
// live 3D viewer, every other one its poster render, so one WebGL context exists at a time and it
// follows the cursor. The live stage is not inside the media button - the viewer's own toggles are
// buttons - and a press on it takes no focus, so the number keys, the arrows and Z still reach the desk; it
// orbits by pointer only. Lazy: a run that never shows a model fetches none of three.
//
// WORDS (text/*) are one wide card: the label as the headline, the body as paragraphs and a list (WordsBody) -
// a storyboard's paragraph and bullets (spark scout-storyboards), a finding's quote.
import { lazy, Suspense, useRef } from "react";

import type { BoardVerdict } from "../../board/boardGate.ts";
import type { ItemWords } from "../../board/port.ts";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { Wave } from "../wave/Wave.tsx";
import { kindOf, spokenTile, type TileMedia } from "./CullTile.tsx";
import { VerdictPick, type VerdictReasons } from "./VerdictPick.tsx";
import { VideoBar } from "./VideoBar.tsx";
import { WordsBody } from "./WordsBody.tsx";
import s from "./Verdict.module.css";

const ModelViewer = lazy(() => import("../model/ModelViewer.tsx").then((x) => ({ default: x.ModelViewer })));

export type VariantCardProps = {
  readonly index: number;
  readonly words: ItemWords;
  readonly media: TileMedia;
  readonly verdict: BoardVerdict | undefined;
  readonly current: boolean;
  readonly nudged: boolean;
  readonly reasons: VerdictReasons;
  readonly onFocus: (index: number) => void;
  readonly onVerdict: (v: BoardVerdict | null) => void;
  /** A words card's columns when it closes a row its stills began (RunView); absent, it takes a row of its own. */
  readonly span?: 1 | 2;
};

export function VariantCard({ index, words, media, verdict, current, nudged, reasons, onFocus, onVerdict, span }: VariantCardProps) {
  const kind = kindOf(media.mime);
  const video = useRef<HTMLVideoElement | null>(null);
  const live = kind === "model" && current;
  const wordsOnly = kind === "text" || (kind === "model" && words.poster === undefined && !live);
  return (
    <figure className={cx(s.card, current && s.cur, verdict?.verdict === "keep" && s.kept, verdict?.verdict === "reject" && s.rejected, nudged && s.nudge, kind === "text" && (span === 1 ? s.span1 : span === 2 ? s.span2 : s.wide))} data-tile={index} role="gridcell" aria-selected={current} aria-label={spokenTile(words, verdict)}>
      {live ? (
        <div className={s.stage} data-live-model="" onMouseDown={(e) => e.preventDefault()}>
          <Suspense fallback={null}>
            <ModelViewer key={media.url} src={media.url} title={words.label} fill {...(words.poster === undefined ? {} : { poster: words.poster })} />
          </Suspense>
        </div>
      ) : (
        <button type="button" className={s.media} onMouseDown={(e) => e.preventDefault()} onClick={() => onFocus(index)} aria-label={`select ${words.label}`}>
          {kind === "video" ? (
            <video ref={video} className={s.frame} src={media.url} muted autoPlay loop playsInline preload="metadata" />
          ) : kind === "audio" ? (
            <span className={s.wave}>
              <Wave peaks={words.peaks ?? []} width={420} height={110} tone={words.music === true ? "violet" : "cyan"} stretch />
            </span>
          ) : wordsOnly ? (
            <span className={s.text}>
              <span className={s.claim}>{words.label}</span>
              {words.prompt !== undefined && <WordsBody text={words.prompt} />}
            </span>
          ) : (
            <Plate className={s.frame} src={kind === "model" ? (words.poster ?? "") : media.url} alt={words.label} />
          )}
        </button>
      )}
      {kind === "video" && <VideoBar video={video} label={words.label} />}
      {kind === "audio" && <audio className={s.player} src={media.url} controls preload="none" />}
      <figcaption className={s.caption}>
        {!wordsOnly && <span className={s.capLabel}>{words.label}</span>}
        {words.meta !== undefined && <span className={s.capMeta}>{words.meta}</span>}
      </figcaption>
      <VerdictPick label={words.label} verdict={verdict} reasons={reasons} onChange={onVerdict} />
    </figure>
  );
}
