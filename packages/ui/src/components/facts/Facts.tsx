// Observations as a definition list (tokens.css `.obs`): a style's observables, a slot's
// fields. Values are verbatim - a model id or a price is what somebody pastes elsewhere.
import { Fragment } from "react";
import s from "./Facts.module.css";

export type Fact = { readonly term: string; readonly value: string | number };

export function Facts({ facts }: { readonly facts: readonly Fact[] }) {
  return (
    <dl className={s.facts}>
      {facts.map((f) => (
        <Fragment key={f.term}>
          <dt className={s.term}>{f.term}</dt>
          <dd className={s.value}>{f.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
