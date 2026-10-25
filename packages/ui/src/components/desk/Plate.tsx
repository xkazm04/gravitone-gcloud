"use client";

// The one <img> the desks draw (tiles, references, arms, the lens, the pair summary).
//
// @gt/ui imports nothing but @gt/domain, so next/image is not available here, and it would not
// help: a desk's media is a candidate's own bytes, served as they are by the blob door - the
// operator judges the pixels the producer made, not a resized, re-encoded stand-in. One element
// with the rule's exemption, instead of six.
//
// A picture whose bytes fail to load is a drawn state, not the browser's broken-image glyph: the
// hatched ground FrameCanvas draws for a plate that is absent, named "not loaded". Failure is
// remembered per `src`, so a new src gets its own try. (A client component: the error is an event.)
import { useState } from "react";

import { cx } from "../cx.ts";
import s from "./Plate.module.css";

export type PlateProps = { readonly src: string | undefined; readonly alt: string; readonly className?: string | undefined; readonly lazy?: boolean };

export function Plate({ src, alt, className, lazy = false }: PlateProps) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  if (src !== undefined && failed === src) return <span className={cx(className, s.failed)} role="img" aria-label={alt === "" ? "not loaded" : `${alt}: not loaded`} data-state="failed" />;
  // eslint-disable-next-line @next/next/no-img-element -- a judged candidate is shown as its own bytes (see above)
  return <img className={className} src={src} alt={alt} loading={lazy ? "lazy" : undefined} onError={() => setFailed(src)} />;
}
