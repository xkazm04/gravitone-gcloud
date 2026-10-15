// An empty state shaped like what will fill it (tokens.css `.ghost-card`; v1 signal/Ghost).
// The outlines are aria-hidden; the label is spoken, because a dashed border says nothing
// to a screen reader. Kept from v1: `count` and the sr-only label.
// Not kept: v1's action slot - an act that fills the space is an Empty's action.
import { SrOnly } from "../a11y/SrOnly.tsx";
import s from "./Ghost.module.css";

export function Ghost({ count = 1, label }: { readonly count?: number; readonly label: string }) {
  return (
    <div className={s.list}>
      {Array.from({ length: Math.max(1, count) }, (_, i) => (
        <div key={i} className={s.card} aria-hidden="true" />
      ))}
      <SrOnly text={label} />
    </div>
  );
}
