// Provenance of what is SHOWN (tokens.css `.src`, GT.Src(kind)): real, model, illustrative,
// fixture, derived, session. The kinds are the domain's own (a cost's `src`, a library
// item's `source`) plus `session`, the prototype's acts-in-this-browser; a typo is a type
// error rather than an unstyled tag.
//
// A tag may carry the figure it qualifies (library.js corpus legend "254 real", ledger.js
// cost marks "model $1.20"): `value` is drawn after the kind, inside the same tag, so the
// figure can never sit beside a provenance that is not its own.
import type { CostSource } from "@gt/domain/event";
import type { LibraryItem } from "@gt/domain/libraryItem";
import { cx } from "../cx.ts";
import s from "./SourceTag.module.css";

export type SourceKind = CostSource | LibraryItem["source"] | "session";

export function SourceTag({ kind, value }: { readonly kind: SourceKind; readonly value?: string | number }) {
  return (
    <span className={cx(s.src, kind === "real" && s.real, kind === "illustrative" && s.illustrative)}>
      {value === undefined ? kind : `${kind} ${value}`}
    </span>
  );
}
