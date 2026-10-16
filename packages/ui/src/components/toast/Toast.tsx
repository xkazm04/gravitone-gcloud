// The act's receipt (tokens.css `.toast`, shell.js `toast(msg)`): one line, bottom centre.
//
// The element is the live region and is ALWAYS mounted, written into when news arrives
// (announcement-accessibility: the region exists before the news; announce transitions,
// not renders). Closed, it holds no text, so a screen reader cannot wander into a receipt
// from three acts ago. Arrival never takes focus, and it ignores the pointer as the
// prototype's did. Timing and the queue are the shell's (wave 3): this is the surface,
// not the scheduler.
//
// An act's receipt may carry its LEDGER chip (Phase 4: every Runs act, launch and re-route): the
// one door from "it happened" to the record of it. The chip alone takes the pointer; the rest of
// the toast still lets presses through to the page beneath.
import { cx } from "../cx.ts";
import { LedgerLink } from "../ledgerlink/LedgerLink.tsx";
import s from "./Toast.module.css";

export type ToastLedger = { readonly href: string; readonly subject: string };

export function Toast({ message, open, ledger }: { readonly message: string; readonly open: boolean; readonly ledger?: ToastLedger | undefined }) {
  return (
    <div className={cx(s.toast, open && s.on)} role="status" aria-live="polite">
      {open ? message : ""}
      {open && ledger !== undefined && (
        <span className={s.door}>
          <LedgerLink href={ledger.href} subject={ledger.subject} />
        </span>
      )}
    </div>
  );
}
