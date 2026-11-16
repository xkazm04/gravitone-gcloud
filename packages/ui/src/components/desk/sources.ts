// WHICH BYTES A PICTURE ASKS FOR - the pure half of Plate and Clip (desk/Plate.tsx, desk/Clip.tsx).
//
// The blob door answers a picture at three widths (@gt/domain/blob.thumb, THUMB_WIDTHS) and the
// original. A tile drawn 230 CSS pixels wide on a 2x screen needs 460 device pixels: the 640
// variant, a few KB, where the original is megabytes. A detail or a lens that judges the pixels
// passes no width and gets the original, untouched.
//
// A URL that is not a blob address (a public still, a data: URL, another file door) has no
// variants: `thumbUrl` hands it back unchanged, and it is drawn as it is, with no srcset - a
// srcset of three identical URLs would claim three widths the bytes do not have.
import { THUMB_WIDTHS, thumbUrl, type ThumbWidth } from "@gt/domain/blob.thumb";

/**
 * The smallest variant that covers `cssWidth` CSS pixels at `dpr` device pixels per CSS pixel,
 * or undefined when even the widest does not (the caller then draws the original). A width that
 * is not a positive finite number covers nothing and asks for no variant.
 */
export function pickThumbWidth(cssWidth: number, dpr: number): ThumbWidth | undefined {
  if (!(cssWidth > 0) || !Number.isFinite(cssWidth)) return undefined;
  const need = cssWidth * (dpr > 0 && Number.isFinite(dpr) ? dpr : 1);
  return THUMB_WIDTHS.find((w) => w >= need);
}

/** Does this URL have variants at all? (`thumbUrl` changes only a blob address.) */
export const hasVariants = (src: string): boolean => thumbUrl(src, THUMB_WIDTHS[0]) !== src;

export type PlateSources = { readonly src: string; readonly srcSet?: string; readonly sizes?: string };

/**
 * The img attributes for `src` drawn `width` CSS pixels wide. A blob address gets all three
 * variants as a srcset, so the browser picks by its own device ratio and zoom; `src` is the
 * variant for a 1x screen, for a browser that reads no srcset. A lazy picture's `sizes` leads with
 * `auto`: the browser then measures the box the layout gave it (a Library tile is as wide as its
 * column, not as the hint), and the hint is the fallback for a browser that cannot.
 *
 * No width, a width past the widest variant, or a URL with no variants: the original, alone.
 */
export function plateSources(src: string, width: number | undefined, lazy: boolean): PlateSources {
  if (width === undefined || !hasVariants(src)) return { src };
  const one = pickThumbWidth(width, 1);
  if (one === undefined) return { src };
  const hint = `${Math.ceil(width)}px`;
  return { src: thumbUrl(src, one), srcSet: THUMB_WIDTHS.map((w) => `${thumbUrl(src, w)} ${w}w`).join(", "), sizes: lazy ? `auto, ${hint}` : hint };
}

/**
 * A clip's poster at `width` CSS pixels. A poster attribute takes one URL (no srcset), so the
 * device ratio is assumed, not measured: 2, so a poster is never soft on a dense screen - and a
 * server render, which knows no screen, asks for the same URL the client does.
 */
export const POSTER_DPR = 2;
export function posterSource(poster: string, width: number | undefined): string {
  if (width === undefined) return poster;
  const w = pickThumbWidth(width, POSTER_DPR);
  return w === undefined ? poster : thumbUrl(poster, w);
}
