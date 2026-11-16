// An empty state shaped like what will fill it (tokens.css `.ghost-card`; v1 signal/Ghost).
// The outlines are aria-hidden; the label is spoken, because a dashed border says nothing
// to a screen reader. Kept from v1: `count` and the sr-only label.
// Not kept: v1's action slot - an act that fills the space is an Empty's action.
//
// `fill` (2026-11-09, a section's loading frame): the outlines share the height of the region
// they stand in instead of each being a field tall, so a stage, a canvas or a calendar column
// is held by marks the size of what will land there rather than by a short list at its top.
import { SrOnly } from "../a11y/SrOnly.tsx";
import { cx } from "../cx.ts";
import s from "./Ghost.module.css";

export function Ghost({ count = 1, label, fill = false }: { readonly count?: number; readonly label: string; readonly fill?: boolean }) {
  return (
    <div className={cx(s.list, fill && s.fill)}>
      {Array.from({ length: Math.max(1, count) }, (_, i) => (
        <div key={i} className={s.card} aria-hidden="true" />
      ))}
      <SrOnly text={label} />
    </div>
  );
}
