"use client";

// THE SLEEVE AND ITS LIGHT (direction "sleeve"): the release's art as the hero of the frame, or - with no sleeve - a
// designed blank, the white label a test pressing ships in (the title set in the serif on paper stock, the catalogue
// line under it), so a missing sleeve is still a sleeve-shaped thing and never a hole. And the ground behind the
// whole frame: the sleeve itself, blurred far back and dimmed under an ink vignette; a hatched paper wash without one.
// Kit candidates: `SleeveFace`, `ArtWash`.
import { motion, useReducedMotion } from "motion/react";

import { Plate } from "@gt/ui/components/desk/Plate.tsx";
import type { Release } from "@gt/domain/release";

import { titleOf } from "./liner.ts";
import a from "./art.module.css";

export const hrefOf = (r: Release): string | null => (r.sleeve !== null && r.sleeve.href !== null ? r.sleeve.href : null);

/** The release's face at any size; `layoutId` lets it travel between the masthead and the sleeve side. */
export function SleeveFace({ release: r, width, layoutId, className }: { readonly release: Release; readonly width: number; readonly layoutId?: string; readonly className?: string }) {
  const reduce = useReducedMotion() === true;
  const href = hrefOf(r);
  const face =
    href !== null ? (
      <Plate src={href} alt={`sleeve of ${titleOf(r)}`} className={a.art} width={width} aspect={1} />
    ) : (
      <span className={a.blank} role="img" aria-label={`no sleeve: ${titleOf(r)}`}>
        <span className={a.blankTitle} aria-hidden="true">
          {titleOf(r)}
        </span>
        <span className={a.disc} aria-hidden="true" />
        <span className={a.blankFoot} aria-hidden="true">
          <span>{r.artist}</span>
          <span>{r.id.toUpperCase()}</span>
        </span>
      </span>
    );
  if (layoutId === undefined || reduce) return <div className={`${a.face} ${className ?? ""}`}>{face}</div>;
  return (
    <motion.div layoutId={layoutId} className={`${a.face} ${className ?? ""}`} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
      {face}
    </motion.div>
  );
}

/** Where the sleeve was while it is out on the sleeve side: its outline, so nothing beside it moves. */
export function SleevePocket() {
  return <div className={`${a.face} ${a.pocket}`} aria-hidden="true" />;
}

/** The frame's ground: the sleeve's own light, far behind; or the paper hatch when there is no sleeve. */
export function ArtWash({ href }: { readonly href: string | null }) {
  return (
    <div className={a.wash} data-art={href === null ? undefined : ""} aria-hidden="true">
      {href !== null && <Plate src={href} alt="" className={a.washArt} width={480} />}
      <span className={a.vignette} />
    </div>
  );
}
