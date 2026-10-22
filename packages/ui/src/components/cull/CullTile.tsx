// One candidate on the matrix (prototype index.html `CullTile`, `Zoom`): the media, its
// label and second word, a badge once decided (✓ keep, ✕ reject), the reject's reasons as
// rose chips, and the cursor ring. An audio take draws its waveform, title, provider line and
// prompt instead of a plate. A TEXT cell (a text/* candidate: a scout finding's claim, a
// watchlist line) draws its words instead: the label is the claim, the prompt the quote under
// it, the meta where it would land - the same button, keys and spoken name as a plate, and the
// lens shows the quote whole. The verdict is spoken in the tile's name, never colour alone.
import { useRef } from "react";

import type { ItemWords } from "../../board/port.ts";
import type { BoardVerdict } from "../../board/boardGate.ts";
import { useLayer } from "../../layers/useLayer.ts";
import { Chip } from "../chip/Chip.tsx";
import { Plate } from "../desk/Plate.tsx";
import { cx } from "../cx.ts";
import { Keycap } from "../keycaps/Keycaps.tsx";
import { Wave } from "../wave/Wave.tsx";
import s from "./Cull.module.css";

export type TileMedia = { readonly url: string; readonly mime: string };

export const kindOf = (mime: string): "image" | "video" | "audio" | "text" | "other" =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : mime.startsWith("text/") ? "text" : "other";

export type CullTileProps = {
  readonly index: number;
  readonly words: ItemWords;
  readonly media: TileMedia;
  readonly verdict: BoardVerdict | undefined;
  readonly current: boolean;
  /** Flashed rose: the commit refused while this one is open. */
  readonly nudged: boolean;
  readonly playing?: boolean;
  /** A clip loops, muted, where it lies (the opened run, where each tile is large). */
  readonly play?: boolean;
  /** The opened run's size: the media fills the screen's height, whole (contained), not a 16:9 crop. */
  readonly large?: boolean;
  readonly onPress: (index: number) => void;
};

export function spokenTile(words: ItemWords, v: BoardVerdict | undefined): string {
  const base = words.meta === undefined ? words.label : `${words.label} ${words.meta}`;
  if (v === undefined) return base;
  return `${base}, ${v.verdict}${v.reasons.length > 0 ? `: ${v.reasons.join(", ")}` : ""}`;
}

export function CullTile({ index, words, media, verdict, current, nudged, playing = false, play = false, large = false, onPress }: CullTileProps) {
  const kind = kindOf(media.mime);
  return (
    <button
      type="button"
      className={cx(s.tile, large && s.large, kind === "text" && s.textTile, current && s.cur, verdict?.verdict === "keep" && s.keep, verdict?.verdict === "reject" && s.reject, nudged && s.nudge)}
      data-tile={index}
      role="gridcell"
      aria-selected={current}
      aria-label={spokenTile(words, verdict)}
      // A pointer moves the cursor without taking focus: a focused button owns ⏎ (keymap
      // target.ts), so a clicked tile would turn the next ⏎ into another click instead of the
      // desk's commit. The keyboard still reaches every tile with Tab.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress(index)}
    >
      {kind === "audio" ? (
        <>
          <div className={s.wavebox}>
            <Wave peaks={words.peaks ?? []} width={210} height={54} tone={words.music === true ? "violet" : "cyan"} />
          </div>
          <div className={s.takeBody}>
            <div className={s.takeTitle}>
              {playing ? "▶ " : ""}
              {words.label}
            </div>
            {words.meta !== undefined && <div className={s.takeMeta}>{words.meta}</div>}
            {words.prompt !== undefined && <div className={s.prompt}>{words.prompt}</div>}
          </div>
        </>
      ) : kind === "text" ? (
        <span className={s.textBody}>
          <span className={s.claim}>{words.label}</span>
          {words.prompt !== undefined && <span className={s.detail}>{words.prompt}</span>}
          {words.meta !== undefined && <span className={s.textMeta}>{words.meta}</span>}
        </span>
      ) : (
        <>
          {kind === "video" ? (
            <video className={s.media} src={media.url} muted playsInline preload="metadata" autoPlay={play} loop={play} />
          ) : (
            <Plate className={s.media} src={media.url} alt="" lazy />
          )}
          <span className={s.cap}>
            <span className={s.ell}>{words.label}</span>
            {words.meta !== undefined && (
              <span className={s.capMeta}>
                {words.meta}
                {kind === "video" ? " ▶" : ""}
              </span>
            )}
          </span>
        </>
      )}
      <span className={s.badge} aria-hidden="true">
        {verdict?.verdict === "keep" ? "✓" : "✕"}
      </span>
      {verdict?.verdict === "reject" && verdict.reasons.length > 0 && (
        <span className={s.reasons} aria-hidden="true">
          {verdict.reasons.map((r) => (
            <Chip key={r} label={r} tone="rose" />
          ))}
        </span>
      )}
    </button>
  );
}

export type ZoomProps = {
  readonly words: ItemWords;
  readonly media: TileMedia;
  readonly verdict: BoardVerdict | undefined;
  readonly position: string;
  readonly onClose: () => void;
  readonly specimen?: boolean;
};

/** The lens's own legend (prototype Zoom: keep, reject, move, close), each cap from the keymap. */
const ZOOM_KEYS: readonly (readonly [string, string])[] = [
  ["keep", "keep"],
  ["reject", "reject"],
  ["prev", "move"],
  ["next", "move"],
  ["zoom", "close"],
];

/** Z: the current candidate large, over the desk. A lens, not a dialog: the desk's keys keep working. */
export function Zoom({ words, media, verdict, position, onClose, specimen = false }: ZoomProps) {
  const panel = useRef<HTMLDivElement | null>(null);
  useLayer(!specimen, { kind: "zoom", panelRef: panel, onClose });
  const kind = kindOf(media.mime);
  return (
    <div ref={panel} className={cx(s.zoom, verdict?.verdict === "keep" && s.zKeep, verdict?.verdict === "reject" && s.zReject)} data-zoom="">
      {kind === "text" ? (
        <div className={s.zText}>
          <p className={s.zClaim}>{words.label}</p>
          {words.prompt !== undefined && <blockquote className={s.zQuote}>{words.prompt}</blockquote>}
        </div>
      ) : kind === "video" ? (
        <video className={s.zMedia} src={media.url} autoPlay muted loop playsInline />
      ) : (
        <Plate className={s.zMedia} src={media.url} alt={words.label} />
      )}
      <div className={s.zcap}>
        <span className={s.zPos}>{position}</span>
        {kind !== "text" && <b className={s.zLabel}>{words.label}</b>}
        {words.meta !== undefined && <Chip label={words.meta} />}
        {verdict === undefined ? (
          <Chip label="undecided" ghost />
        ) : (
          <Chip label={`${verdict.verdict}${verdict.reasons.length > 0 ? ` · ${verdict.reasons.join(", ")}` : ""}`} tone={verdict.verdict === "keep" ? "emerald" : "rose"} />
        )}
        <span className={s.zKeys} role="group" aria-label="zoom keys">
          {ZOOM_KEYS.map(([verb, does]) => (
            <span key={verb} className={s.zKey}>
              <Keycap mode="board.cull" verb={verb} /> {does}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
