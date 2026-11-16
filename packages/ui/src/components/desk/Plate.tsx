"use client";

// The one picture the studio draws (desk tiles, references, arms, the lens, Library faces, shelf
// tiles, shot rails, the cut's monitor).
//
// @gt/ui imports nothing but @gt/domain, so next/image is not available here, and it would not
// help: a desk's media is a candidate's own bytes, served by the blob door - the operator judges
// the pixels the producer made. A grid is the exception the door makes for itself: given a
// `width`, a blob is asked for at its nearest variant (./sources.ts), resized by the server from
// those same bytes; a detail or a lens passes no width and gets the original. One element with
// the rule's exemption, instead of six.
//
// Three drawn states (./settle.ts):
//  - waiting: the img's box on the ink ground - at its aspect when the caller knows it (`aspect`),
//    so the bytes landing move nothing. The ground is on the img itself, which still paints its
//    pixels over it with no script at all: a server render is never a blank.
//  - loaded: bytes that arrived on screen fade in (opacity, `--ease`, `--dur`); a cached picture
//    is simply there. Reduced motion: no fade, the same end state.
//  - failed: a picture whose bytes fail to load is a drawn state, not the browser's broken-image
//    glyph - the hatched ground FrameCanvas draws for an absent plate, named "not loaded" - or the
//    caller's own face for it (`failed`: the Library's unreadable face). The error path is this
//    one; the face is the caller's.
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { enter, imgDone, useSettle } from "./settle.ts";
import { plateSources } from "./sources.ts";
import s from "./Plate.module.css";

export type PlateProps = {
  readonly src: string | undefined;
  readonly alt: string;
  readonly className?: string | undefined;
  readonly lazy?: boolean;
  /** CSS pixels the picture is drawn at: a blob is fetched at the variant that covers it. None: the original. */
  readonly width?: number | undefined;
  /** Width over height, when the caller knows it: the box is reserved before a byte arrives. */
  readonly aspect?: number | undefined;
  /** What a picture that would not load is drawn as, in place of the hatched ground. */
  readonly failed?: ReactNode;
};

/**
 * The hatched "not loaded" ground on its own: a picture that failed (Plate, Clip), or a picture a
 * surface knows it cannot reach. `label` names it; without one it is a mark inside a box that is
 * already named (the cut's monitor), and hidden from the accessibility tree.
 */
export function PlateMissing({ label, className, aspect }: { readonly label?: string | undefined; readonly className?: string | undefined; readonly aspect?: number | undefined }) {
  const box = aspect === undefined ? undefined : { aspectRatio: aspect };
  return label === undefined ? (
    <span className={cx(className, s.failed)} style={box} data-state="failed" aria-hidden="true" />
  ) : (
    <span className={cx(className, s.failed)} style={box} role="img" aria-label={label === "" ? "not loaded" : `${label}: not loaded`} data-state="failed" />
  );
}

export function Plate({ src, alt, className, lazy = false, width, aspect, failed }: PlateProps) {
  const { phase, settle } = useSettle(src);
  const box = aspect === undefined ? undefined : { aspectRatio: aspect };
  // No source yet (an arm still being drawn): the waiting ground, with nothing to fetch.
  if (src === undefined || src === "") return <span className={cx(className, s.plate, s.blank)} style={box} data-state="waiting" aria-hidden="true" />;
  if (phase === "failed")
    return failed ?? <PlateMissing label={alt} className={className} aspect={aspect} />;
  const at = plateSources(src, width, lazy);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a judged candidate is shown as its own bytes (see above)
    <img
      className={cx(className, s.plate)}
      src={at.src}
      srcSet={at.srcSet}
      sizes={at.sizes}
      alt={alt}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      draggable={false}
      style={box}
      data-state={phase === "waiting" ? "waiting" : "loaded"}
      data-enter={phase === "entered" ? "" : undefined}
      onLoad={(e) => {
        if (phase !== "waiting") return;
        enter(e.currentTarget);
        settle("entered");
      }}
      onError={() => settle("failed")}
      ref={(el) => {
        // A load or an error that landed before the handlers were attached (cache, hydration).
        const done = el === null || phase !== "waiting" ? undefined : imgDone(el);
        if (done !== undefined) settle(done);
      }}
    />
  );
}
