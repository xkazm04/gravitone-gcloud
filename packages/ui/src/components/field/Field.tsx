// Text entry and choice (tokens.css `.field`, `.search`). Native input and select, controlled,
// each with a REQUIRED accessible name: the design draws no visible label beside its fields,
// and a placeholder is not a name - it vanishes on the first keystroke (name-and-description-
// wiring). `keyfield` names the field to the keymap, so its `field` rows (Esc clears, ↓ goes to
// results) fire inside it and nowhere else.
import { FIELD_ATTR } from "../../keymap/target.ts";
import { Glyph } from "../glyph/Glyph.tsx";
import { Keycap } from "../keycaps/Keycaps.tsx";
import s from "./Field.module.css";

export type FieldProps = {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** An example of the query syntax (`mood:tense · kind:audio`), never an instruction. */
  readonly placeholder?: string;
  readonly keyfield?: string;
};

const keyAttr = (keyfield: string | undefined) => (keyfield === undefined ? {} : { [FIELD_ATTR]: keyfield });

export function Field({ label, value, onChange, placeholder, keyfield }: FieldProps) {
  return (
    <input
      className={s.field}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...keyAttr(keyfield)}
    />
  );
}

export type SelectProps<V extends string> = {
  readonly label: string;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly value: V;
  readonly onChange: (value: V) => void;
};

export function Select<V extends string>({ label, options, value, onChange }: SelectProps<V>) {
  return (
    <select
      className={s.field}
      aria-label={label}
      value={value}
      onChange={(e) => {
        const hit = options.find((o) => o.value === e.currentTarget.value);
        if (hit !== undefined) onChange(hit.value);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A field with the search glyph and the caps of the verb that focuses it (`/`). */
export function Search({ mode, ...field }: FieldProps & { readonly mode: string }) {
  return (
    <div className={s.search} role="search">
      <Glyph name="search" className={s.glyph} />
      <Field {...field} />
      <span className={s.cap}>
        <Keycap mode={mode} verb="search" />
      </span>
    </div>
  );
}
