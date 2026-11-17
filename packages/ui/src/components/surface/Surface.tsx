// THE STUDIO'S THREE GROUNDS (design baseline, docs/next/design-baseline/PLAN.md §1b): what a region stands on.
//   glass  a panel, a column, the composer: white at a breath over the ground, a rim, a top shine, a long cast,
//          and the light behind it frosted. Budgeted - backdrop-filter is costly - so a list inside glass is never
//          glass again.
//   raise  opaque, for what is read closely or sits over moving light: a menu, a native list, a dialog.
//   well   recessed, for what is typed or read off: a field's bed, a readout.
// The surface carries no padding and no layout: those are the caller's, through `className`.
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import s from "./Surface.module.css";

export type SurfaceKind = "glass" | "raise" | "well";

export type SurfaceProps = {
  readonly kind?: SurfaceKind;
  readonly as?: "div" | "section" | "aside" | "nav" | "header" | "article";
  readonly className?: string | undefined;
  readonly label?: string;
  readonly children: ReactNode;
};

export function Surface({ kind = "glass", as: Tag = "div", className, label, children }: SurfaceProps) {
  return (
    <Tag className={cx(s.surface, s[kind], className)} data-surface={kind} aria-label={label}>
      {children}
    </Tag>
  );
}
