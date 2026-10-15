// One of a few (tokens.css `.seg`: 12h · 24h · 3d · week). A group of native pressed
// buttons, exactly one pressed, named as a group. The prototype's own markup; the ARIA
// radio pattern would need arrow keys that bypass the keymap registry.
import s from "./Seg.module.css";

export type SegOption<V extends string> = { readonly value: V; readonly label: string };

export type SegProps<V extends string> = {
  readonly label: string;
  readonly options: readonly SegOption<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
};

export function Seg<V extends string>({ label, options, value, onChange }: SegProps<V>) {
  return (
    <div className={s.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className={s.opt} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
