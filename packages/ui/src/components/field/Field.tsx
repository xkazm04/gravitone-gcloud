// Text entry and choice (tokens.css `.field`, `.search`). Native input and select, controlled,
// each with a REQUIRED accessible name: the design draws no visible label beside its fields,
// and a placeholder is not a name - it vanishes on the first keystroke (name-and-description-
// wiring). `keyfield` names the field to the keymap, so its `field` rows (Esc clears, ↓ goes to
// results) fire inside it and nowhere else.
import type { KeyboardEventHandler, Ref } from "react";

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
  /** The native input type; a text field when absent. */
  readonly type?: "text" | "datetime-local" | "search" | "number" | "time";
  readonly maxLength?: number | undefined;
  /** A number field's bounds and step. */
  readonly min?: number;
  readonly step?: number;
  /**
   * The surface's own look, replacing `.field` (a contest winner ported at its pixels - the scout canvas). The name,
   * the keyfield and the busy convention stay this component's; only the class is the surface's.
   */
  readonly skin?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  /** The field's own keys (a results list's ↑ ↓ ⏎); the keymap's `field` rows still fire through `keyfield`. */
  readonly onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  readonly onBlur?: () => void;
  readonly autoFocus?: boolean;
  readonly autoComplete?: "off";
  /** A search field that drives a results list (the combobox pattern). */
  readonly combobox?: { readonly expanded: boolean; readonly controls: string; readonly active?: string | undefined };
  /** A stable hook for the live lanes and the style contract. */
  readonly role?: string;
  /** Busy: aria-disabled and read-only, so the field keeps focus and its place in the tab order (the Button convention). */
  readonly disabled?: boolean | undefined;
  /** The id of the element that describes this field. */
  readonly describedBy?: string | undefined;
};

const stateAttrs = (p: Pick<FieldProps, "disabled" | "describedBy">) => ({
  "aria-disabled": p.disabled === true ? true : undefined,
  readOnly: p.disabled === true ? true : undefined,
  "aria-describedby": p.describedBy,
});

const keyAttr = (keyfield: string | undefined) => (keyfield === undefined ? {} : { [FIELD_ATTR]: keyfield });

export function Field({ label, value, onChange, placeholder, keyfield, type, maxLength, disabled, describedBy, min, step, skin, inputRef, onKeyDown, onBlur, autoFocus, autoComplete, combobox, role }: FieldProps) {
  return (
    <input
      ref={inputRef}
      className={skin ?? s.field}
      type={type}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      min={min}
      step={step}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...(combobox === undefined ? {} : { role: "combobox", "aria-expanded": combobox.expanded, "aria-controls": combobox.controls, "aria-activedescendant": combobox.active })}
      {...(role === undefined ? {} : { "data-role": role })}
      {...stateAttrs({ disabled, describedBy })}
      {...keyAttr(keyfield)}
    />
  );
}

export type TextAreaProps = Pick<FieldProps, "label" | "value" | "onChange" | "placeholder" | "maxLength" | "disabled" | "describedBy" | "skin" | "role"> & {
  readonly rows?: number;
  readonly areaRef?: Ref<HTMLTextAreaElement>;
  readonly onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
};

/** The multi-line field: the same required name and busy convention as Field. */
export function TextArea({ label, value, onChange, placeholder, maxLength, disabled, describedBy, rows = 3, skin, role, areaRef, onKeyDown }: TextAreaProps) {
  return (
    <textarea
      ref={areaRef}
      className={skin ?? `${s.field} ${s.area}`}
      onKeyDown={onKeyDown}
      {...(role === undefined ? {} : { "data-role": role })}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      onChange={(e) => onChange(e.currentTarget.value)}
      {...stateAttrs({ disabled, describedBy })}
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
