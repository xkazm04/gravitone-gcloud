// The act's receipt (tokens.css `.toast`, shell.js `toast(msg)`): one line, bottom centre.
//
// The element is the live region and is ALWAYS mounted, written into when news arrives
// (announcement-accessibility: the region exists before the news; announce transitions,
// not renders). Closed, it holds no text, so a screen reader cannot wander into a receipt
// from three acts ago. Arrival never takes focus, and it ignores the pointer as the
// prototype's did. Timing and the queue are the shell's (wave 3): this is the surface,
// not the scheduler.
import { cx } from "../cx.ts";
import s from "./Toast.module.css";

export function Toast({ message, open }: { readonly message: string; readonly open: boolean }) {
  return (
    <div className={cx(s.toast, open && s.on)} role="status" aria-live="polite">
      {open ? message : ""}
    </div>
  );
}
