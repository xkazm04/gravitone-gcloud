// Observations as a definition list (tokens.css `.obs`): a style's observables, a slot's
// fields. Values are verbatim - a model id or a price is what somebody pastes elsewhere.
// A term is not a key: the Ledger lists an event's envelope (`lane`, `key`) and then its data,
// whose own fields may carry the same names, so a row is keyed by its place as well.
import { Fragment } from "react";
import s from "./Facts.module.css";

export type Fact = { readonly term: string; readonly value: string | number };

export function Facts({ facts }: { readonly facts: readonly Fact[] }) {
  return (
    <dl className={s.facts}>
      {facts.map((f, i) => (
        <Fragment key={`${f.term}:${i}`}>
          <dt className={s.term}>{f.term}</dt>
          <dd className={s.value}>{f.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
