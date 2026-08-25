"use client";

// Form primitives — the catalog this design language did not have yet.
//
// Added because /projects needs a create/edit dialog and there was nothing to
// build it from: the repo had Panel, Button, Eyebrow, Modal and nothing that
// takes typing. Native controls are used as the base (they are what screen
// readers and autofill understand) but nothing OS-styled survives: a raw
// <select> renders its options in system chrome against a near-black studio and
// reads as broken, so choice-of-few is a radio group drawn as pills instead.
//
// No colour literal: the cyan/white-alpha utilities here are the rendered form
// of the accents already declared in components/ui/tokens.ts.

import { useId } from "react";

const CONTROL =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-base text-white " +
  "placeholder:text-white/25 transition hover:border-white/20 focus:border-cyan-400/40 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2";

const LABEL_TEXT =
  "font-jetbrains mb-1.5 block text-[11px] tracking-[0.18em] text-white/45 uppercase";

/**
 * Label + optional hint + the control it names.
 *
 * TWO SHAPES, because `htmlFor` is optional and the two cases are not the same
 * accessibility object. With an id, this is a labelled control and the markup is
 * a real <label for>. WITHOUT one it used to render a <label> ALL THE SAME — a
 * label element with no `for` and no control nested inside it, which names
 * nothing. To a screen reader that is loose text, and the thing it was meant to
 * name is announced unlabelled.
 *
 * That is not hypothetical: the two `Visual style` fields in ProjectDialog pass
 * no `htmlFor` because their content is a pill GROUP, not one input, so the
 * group had no accessible name at all. A group is what those are, so the
 * no-`htmlFor` branch now says so — role="group" + aria-label — and the label
 * text renders as a <span> carrying the identical classes, so nothing moves by a
 * pixel. <Segmented> below is the same idea done natively (fieldset + legend);
 * this is the shape for content that is not a radio set.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      {children}
      {hint && <p className="font-hanken mt-1.5 text-sm text-slate-400">{hint}</p>}
    </>
  );
  if (!htmlFor) {
    return (
      <div role="group" aria-label={label}>
        <span className={LABEL_TEXT}>{label}</span>
        {body}
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={htmlFor} className={LABEL_TEXT}>
        {label}
      </label>
      {body}
    </div>
  );
}

export function TextInput({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${CONTROL} ${className}`} />;
}

export function TextArea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${CONTROL} resize-none ${className}`} />;
}

/** A number with its unit welded on, so "300" can never be read as minutes.
 *
 *  Welded for the SCREEN READER too, via aria-describedby. The unit used to be
 *  a purely decorative span sitting beside the box, so the field this component
 *  exists to disambiguate announced as a bare number — exactly the ambiguity it
 *  was built to remove, for the users least able to resolve it from context. A
 *  caller's own `aria-describedby` is kept and the unit appended to it. */
export function NumberInput({
  unit,
  className = "",
  "aria-describedby": describedBy,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  const unitId = useId();
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        aria-describedby={[describedBy, unitId].filter(Boolean).join(" ")}
        {...rest}
        className={`${CONTROL} font-jetbrains pr-10 ${className}`}
      />
      <span
        id={unitId}
        className="font-jetbrains pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-sm text-white/35"
      >
        {unit}
      </span>
    </div>
  );
}

/**
 * Choice-of-few as a radio group drawn as pills. A real fieldset with real
 * radios: arrow keys walk it, a screen reader announces the group name, and
 * nothing renders in OS chrome.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string; note?: string }>;
  onChange: (id: T) => void;
  className?: string;
}) {
  const name = useId();
  const active = options.find((o) => o.id === value);
  return (
    <fieldset className={className}>
      <legend className="font-jetbrains mb-1.5 block text-[11px] tracking-[0.18em] text-white/45 uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`font-jetbrains cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
              value === o.id
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                : "border-white/10 text-white/55 hover:border-white/25 hover:text-white/85"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.id}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
      {active?.note && <p className="font-hanken mt-1.5 text-sm text-slate-400">{active.note}</p>}
    </fieldset>
  );
}
