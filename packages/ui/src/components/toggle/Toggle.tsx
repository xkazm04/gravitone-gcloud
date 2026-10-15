// An on/off filter that applies at once (tokens.css `.toggle`): a native button with
// aria-pressed, so the state is announced without any consumer effort. Controlled: the
// caller owns `on` (ui-controls/composition-contracts).
import s from "./Toggle.module.css";

export function Toggle({ label, on, onToggle }: { readonly label: string; readonly on: boolean; readonly onToggle: (next: boolean) => void }) {
  return (
    <button type="button" className={s.toggle} aria-pressed={on} onClick={() => onToggle(!on)}>
      {label}
    </button>
  );
}
