// Who made this, in which run, with what (index.html's style detail `[data-component=
// Provenance]`: a row of lowercase mono chips; v1 signal/Provenance.tsx).
//
// Kept from v1: a fixed order, so two surfaces cannot disagree about which fact comes first;
// values verbatim (a model id or a price is what somebody pastes into a search box or an
// invoice); only present fields render, and an empty record renders nothing rather than
// "unknown", which would be a claim. Each chip speaks its field name with its value.
// Changed: the design drew values alone, without v1's dim field labels; the label is the
// chip's accessible name instead.
import { Chip } from "../chip/Chip.tsx";
import s from "./Provenance.module.css";

export type ProvenanceFields = {
  readonly model?: string;
  readonly run?: string;
  readonly step?: string;
  readonly vendor?: string;
  readonly cost?: string;
};

const ORDER: readonly (keyof ProvenanceFields)[] = ["model", "run", "step", "vendor", "cost"];

export function Provenance(fields: ProvenanceFields) {
  const present = ORDER.flatMap((k) => {
    const v = fields[k];
    return v === undefined ? [] : [{ k, v }];
  });
  if (present.length === 0) return null;
  return (
    <div className={s.row}>
      {present.map(({ k, v }) => (
        <Chip key={k} label={v} casing="lower" name={`${k} ${v}`} />
      ))}
    </div>
  );
}
