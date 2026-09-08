"use client";

// AN EMPTY STATE SHAPED LIKE THE THING THAT WILL FILL IT.
//
// Not a message. A dashed outline of the row / tile / slot / card that belongs
// there, so the empty surface teaches its own shape.
//
//   app/_projects/parts.tsx:159-163                "No projects yet." plus a
//                                                  paragraph defining what a
//                                                  project is — a definition
//                                                  nobody reads on the one
//                                                  screen where they already
//                                                  know.
//   app/library/AssetsBrowser.tsx:812-816          the same shape, for assets
//   app/_phases/script/trailer/PromiseLedger.tsx:46-48
//   app/_phases/script/trailer/MovementSection.tsx:70-72
//
// THE MESSAGE DOES NOT SIMPLY VANISH FOR EVERYONE. A sighted user reads the
// absence off the outline; a screen-reader user reads nothing at all from a
// dashed border, so `label` is rendered `sr-only` and defaults to something
// true. That is the floor this whole vocabulary is held to — a glyph only a
// mouse can reach is a regression, not a fix.
//
// The ACTION is a real control at full strength, not part of the ghost: the
// outline is 40% opacity because it is a placeholder, and fading the one thing
// the user can press would be drawing the fix as if it were also absent.

import type { ReactNode } from "react";

export type GhostShape = "row" | "tile" | "slot" | "card";

const SHAPE: Record<GhostShape, string> = {
  row: "h-14 w-full rounded-xl",
  tile: "aspect-square w-full rounded-xl",
  slot: "h-24 w-full rounded-lg",
  card: "h-40 w-full rounded-2xl",
};

export function Ghost({
  shape = "row",
  count = 1,
  glyph,
  action,
  label,
  children,
  className = "",
}: {
  shape?: GhostShape;
  /** How many outlines. Three rows read as "a list"; one reads as "a slot". */
  count?: number;
  /** One centred glyph. One — a glyph field is decoration. */
  glyph?: ReactNode;
  /** A real <Button>, or a link. Rendered over the outlines at full strength. */
  action?: ReactNode;
  /** What is absent, for a screen reader. Four words. */
  label?: string;
  /** A bespoke skeleton, drawn inside each outline. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <p className="sr-only">{label ?? "Nothing here yet"}</p>
      <div aria-hidden className="flex flex-col gap-2 opacity-40">
        {Array.from({ length: Math.max(1, count) }, (_, i) => (
          <div
            key={i}
            className={`border border-dashed border-white/30 ${SHAPE[shape]}`}
          >
            {children}
          </div>
        ))}
      </div>
      {(glyph || action) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          {glyph && (
            <span aria-hidden className="text-white/25">
              {glyph}
            </span>
          )}
          {action && <span className="pointer-events-auto">{action}</span>}
        </div>
      )}
    </div>
  );
}
