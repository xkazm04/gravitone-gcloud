// A real error, verbatim (tokens.css `.err`): `kind · op · message` is the work, so nothing
// here truncates or rewords it (CLAUDE.md: "Real errors explain themselves in full").
// role="alert" only when the error ARRIVES (`live`); a list of past failures re-announced on
// every render is noise (announcement-accessibility: announce transitions, not renders).
import { Glyph } from "../glyph/Glyph.tsx";
import s from "./ErrorLine.module.css";

export function ErrorLine({ message, live = false }: { readonly message: string; readonly live?: boolean }) {
  return (
    <span className={s.err} role={live ? "alert" : undefined}>
      <Glyph name="warn" className={s.glyph} />
      <span>{message}</span>
    </span>
  );
}
