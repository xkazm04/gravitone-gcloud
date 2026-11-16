// THE GEOMETRY OF A SECTION OVER A SONG (spark track-mirror-studio), pure, so the limits are tested without a DOM.
// A span is two times in seconds; a handle moves inside the bounds its partner and the length limits leave it,
// and the span dragged as one keeps its width and stops at either end of the song. Every answer is rounded to
// the keyboard's finest step (0.1 s), so a dragged value and a keyed value land on the same grid.
//
// A song shorter than the least length leaves no legal span but the whole song: the limits shrink to the song
// rather than answering an empty or inverted range.

export type Span = { readonly startS: number; readonly endS: number };
export type Limits = { readonly lenS: number; readonly minS: number; readonly maxS: number };
export type Bounds = { readonly min: number; readonly max: number };

export const STEP_S = 0.1;
export const BIG_STEP_S = 1;

const tenth = (n: number): number => Math.round(n * 10) / 10;
const clamp = (v: number, b: Bounds): number => Math.min(b.max, Math.max(b.min, v));

/** The limits a song of this length can actually hold. */
export function effective(l: Limits): Limits {
  const lenS = Math.max(0, l.lenS);
  const minS = Math.min(l.minS, lenS);
  return { lenS, minS, maxS: Math.max(minS, Math.min(l.maxS, lenS)) };
}

/** Where the start handle may go with the end held. */
export function startBounds(span: Span, l: Limits): Bounds {
  const e = effective(l);
  return { min: tenth(Math.max(0, span.endS - e.maxS)), max: tenth(Math.max(0, span.endS - e.minS)) };
}

/** Where the end handle may go with the start held. */
export function endBounds(span: Span, l: Limits): Bounds {
  const e = effective(l);
  return { min: tenth(Math.min(e.lenS, span.startS + e.minS)), max: tenth(Math.min(e.lenS, span.startS + e.maxS)) };
}

/** Any span made legal: inside the song, no shorter than the least, no longer than the most. */
export function fitSpan(span: Span, l: Limits): Span {
  const e = effective(l);
  const width = Math.min(e.maxS, Math.max(e.minS, span.endS - span.startS));
  const startS = Math.min(Math.max(0, span.startS), e.lenS - width);
  return { startS: tenth(startS), endS: tenth(startS + width) };
}

export function setStart(span: Span, toS: number, l: Limits): Span {
  return { startS: tenth(clamp(toS, startBounds(span, l))), endS: span.endS };
}

export function setEnd(span: Span, toS: number, l: Limits): Span {
  return { startS: span.startS, endS: tenth(clamp(toS, endBounds(span, l))) };
}

/** The span dragged as one: its width kept, stopped at either end of the song. */
export function moveSpan(span: Span, deltaS: number, l: Limits): Span {
  const e = effective(l);
  const width = span.endS - span.startS;
  const startS = clamp(span.startS + deltaS, { min: 0, max: Math.max(0, e.lenS - width) });
  return { startS: tenth(startS), endS: tenth(startS + width) };
}

/** The seconds a key moves a handle by: arrows a tenth, with shift a whole second; null for any other key. */
export function keyDelta(key: string, shift: boolean): number | null {
  const step = shift ? BIG_STEP_S : STEP_S;
  if (key === "ArrowRight" || key === "ArrowUp") return step;
  if (key === "ArrowLeft" || key === "ArrowDown") return -step;
  return null;
}

/** A pointer's x inside a box of `width`, as seconds into the song. */
export function xToS(x: number, width: number, lenS: number): number {
  if (width <= 0 || lenS <= 0) return 0;
  return tenth(Math.min(1, Math.max(0, x / width)) * lenS);
}

/** A time as a share of the song, 0..1, for placing a mark. */
export const share = (s: number, lenS: number): number => (lenS <= 0 ? 0 : Math.min(1, Math.max(0, s / lenS)));

/** `1:04.3`: minutes, seconds and the tenth the keyboard moves by. */
export function clockTenths(s: number): string {
  const t = Math.max(0, tenth(s));
  const m = Math.floor(t / 60);
  const rest = (t - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rest}`;
}
