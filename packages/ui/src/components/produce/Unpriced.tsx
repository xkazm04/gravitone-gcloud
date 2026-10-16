// AN UNPRICED FIGURE, AS A SHAPE (Phase 4, L28): `unpriced · seat`, `unpriced · credits`. The kind
// is read off the reason the pricing gave (a text seat that reports after the run, a credit plan,
// a model nobody declared a price for); the reason itself - the work, verbatim - is the chip's
// accessible name and the Hint's body, never a sentence in a cost cell. The prototype priced
// these as $0, which read as a measurement (measurement-honesty); a sentence in the cell read as
// the app explaining itself.
import { Chip } from "../chip/Chip.tsx";
import { Hint } from "../hint/Hint.tsx";
import s from "./Acts.module.css";

/** The short kind of an unpriced figure, from its reason. */
export function unpricedKind(reason: string | undefined): "seat" | "credits" | "no price" {
  const r = (reason ?? "").toLowerCase();
  if (r.includes("seat")) return "seat";
  if (r.includes("credit") || r.includes("subscription")) return "credits";
  return "no price";
}

/** `hint={false}` where the column is narrow (the plan table): the reason stays the chip's name. */
export function Unpriced({ reason, hint = true }: { readonly reason?: string | undefined; readonly hint?: boolean }) {
  return (
    <span className={s.unpriced} data-component="Unpriced">
      <Chip label={`unpriced · ${unpricedKind(reason)}`} tone="violet" casing="lower" name={reason === undefined ? "unpriced" : `unpriced: ${reason}`} />
      {hint && reason !== undefined && <Hint text={reason} name="why unpriced" />}
    </span>
  );
}
