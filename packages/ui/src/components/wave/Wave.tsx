// An audio take's peaks (shell.js `Wave`), drawn in SVG units: `width` and `height` are the
// strip's geometry, the take's data, not a style. A take with no peaks draws a dashed
// midline rather than nothing - an absent measurement shows as absent.
import { cx } from "../cx.ts";
import { waveBars } from "./wave.ts";
import s from "./Wave.module.css";

export type WaveProps = {
  readonly peaks: readonly number[];
  readonly width: number;
  readonly height: number;
  readonly tone: "cyan" | "violet" | "emerald" | "amber";
  /** The playhead, 0..1: bars after it dim. */
  readonly played?: number;
  /** Fill the box the caller sizes, both ways (the prototype's Library preview set
   *  preserveAspectRatio="none" on its strip); absent, the strip keeps its proportions. */
  readonly stretch?: boolean;
};

export function Wave({ peaks, width, height, tone, played, stretch = false }: WaveProps) {
  const bars = waveBars(peaks, width, height, played);
  return (
    <svg className={cx(s.wave, s[tone])} width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={stretch ? "none" : undefined} aria-hidden="true">
      {bars.length === 0 ? (
        <line className={s.flat} x1="0" y1={height / 2} x2={width} y2={height / 2} />
      ) : (
        bars.map((b, i) => <rect key={i} className={cx(s.bar, !b.played && s.later)} x={b.x} y={b.y} width={b.w} height={b.h} rx="0.8" />)
      )}
    </svg>
  );
}
