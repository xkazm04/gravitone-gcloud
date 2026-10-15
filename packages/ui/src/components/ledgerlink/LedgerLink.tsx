// Every subject links to its events (tokens.css `.ledger-link`, GT.LedgerLink(q, label)).
// The href is the caller's: the ledger's URL shape belongs to the ledger route (wave 3), and
// a second copy of it here would be the drift the prototype's `ledger.html#q=` strings were.
import { Glyph } from "../glyph/Glyph.tsx";
import s from "./LedgerLink.module.css";

export function LedgerLink({ href, subject, label = "ledger" }: { readonly href: string; readonly subject: string; readonly label?: string }) {
  return (
    <a className={s.link} href={href} aria-label={`ledger events for ${subject}`}>
      <Glyph name="ledger" className={s.glyph} />
      {label}
    </a>
  );
}
