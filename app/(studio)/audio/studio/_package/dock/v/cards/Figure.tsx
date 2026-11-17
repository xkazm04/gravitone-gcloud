// A FIGURE (kit candidate): one number or short value set large in the mono face, its name in caps beneath - the
// shape a count, a length or a size takes on a card instead of a sentence.
import s from "./parts.module.css";

export function Figure({ value, label, tone }: { readonly value: string | number; readonly label: string; readonly tone?: "ok" | "block" | "warn" }) {
  return (
    <span className={s.figure} data-tone={tone}>
      <b className={s.figureValue}>{value}</b>
      <span className={s.figureLabel}>{label}</span>
    </span>
  );
}
