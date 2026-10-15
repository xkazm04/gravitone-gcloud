// The spoken channel. Every component that draws a state as a glyph, a numeral or a colour
// says it here too (v1 signal README: "every drawn state has a spoken equivalent").
import s from "./SrOnly.module.css";

export function SrOnly({ text }: { readonly text: string }) {
  return <span className={s.sr}>{text}</span>;
}
