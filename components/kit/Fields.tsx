"use client";

// THE FORM CONTROLS OF A WORKING SURFACE: a caps label over a ruled input.
// Native controls, named by their label; no helper text slot.

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="k-field k-caps">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** A machine-short fact shown on hover; keep it a constraint, not a sentence. */
  hint?: string;
}) {
  return (
    <label className="k-field k-caps" title={hint}>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        style={{ width: 88 }}
      />
    </label>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="k-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="k-form">{children}</div>;
}

/** A framed panel for a form or a small block. */
export function PanelBox({ children }: { children: React.ReactNode }) {
  return <div className="k-panelbox">{children}</div>;
}
